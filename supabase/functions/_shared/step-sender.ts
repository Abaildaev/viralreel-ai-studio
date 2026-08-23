/*
  Moving one subscriber through a funnel's steps.

  Shared by the webhook, which starts the sequence the moment someone clears
  the subscription gate, and by the drip worker, which continues it days later.
  One implementation, because the two differ only in what woke them up.

  The ordering here is deliberate and is the whole safety story: a delivery row
  is claimed before the message is sent, never after. A crash between the two
  leaves a `pending` row that the worker retries — the reader gets the lesson
  late instead of never. Writing the row afterwards would invert that into the
  failure nobody forgives: a lesson sent twice, or a course that silently stops.
*/

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendMessage } from "./telegram-api.ts";
import { type FunnelStep, planSequence } from "./funnel-sequence.ts";
import {
  type AttachmentColumns,
  ATTACHMENT_COLUMNS,
  type PreparedTelegramAttachment,
  readAttachment,
  prepareTelegramAttachment,
} from "./attachment.ts";

export const STEP_COLUMNS =
  "id,position,title,body,button_text,button_url,delay_minutes,is_active," +
  ATTACHMENT_COLUMNS;

/** What the sender reads: the sequencing fields plus the file to send. */
type StepRow = FunnelStep & AttachmentColumns;

export interface SequenceSubscriber {
  id: string;
  telegram_user_id: string;
  telegram_bot_id: string;
}

async function loadSteps(
  supabase: SupabaseClient,
  funnelId: string,
): Promise<StepRow[]> {
  const { data } = await supabase
    .from("telegram_funnel_steps")
    .select(STEP_COLUMNS)
    .eq("funnel_id", funnelId)
    .order("position", { ascending: true });

  return (data ?? []) as unknown as StepRow[];
}

/**
 * Claims a step for this subscriber.
 *
 * Returns false when the row already exists, which means some other path has
 * this step in hand — a concurrent webhook call, or a retry of a tick that
 * already got there. The unique constraint on (subscriber, step) is what makes
 * the claim atomic, so this is a real lock and not a check-then-act.
 */
async function claimStep(
  supabase: SupabaseClient,
  subscriber: SequenceSubscriber,
  stepId: string,
  dueAt: Date,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_step_deliveries")
    .insert({
      telegram_bot_id: subscriber.telegram_bot_id,
      subscriber_id: subscriber.id,
      step_id: stepId,
      due_at: dueAt.toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    // 23505: someone already claimed it. Anything else is a real failure.
    if (error.code === "23505") return null;
    throw error;
  }

  return data.id as string;
}

/*
  Statuses that mean this reader has already been past the step.

  A delivery still `pending` belongs to someone else — a concurrent webhook, a
  tick that got there first — and losing that race is the correct outcome. A
  finished one is different: it says the reader walked here before, and the
  only reason to find it in the path again is that they are walking again.
*/
const WALKED_PAST = ["sent", "cancelled", "failed"];

/**
 * Puts the next step on the clock, whether or not this reader has seen it.
 *
 * The claim used to be made and its answer thrown away, so a reader with an
 * old delivery row simply stopped receiving the funnel: no error, no log line,
 * no change of status — the sequence ended mid-way and nothing said so. It
 * cost an evening to find, twice.
 *
 * Re-arming is decided by the row rather than by a flag from the caller, so
 * the repair carries down the whole sequence: the drip worker schedules each
 * following step through here too, and knows nothing about how the walk began.
 */
async function scheduleNext(
  supabase: SupabaseClient,
  subscriber: SequenceSubscriber,
  stepId: string,
  dueAt: Date,
): Promise<"scheduled" | "rearmed" | "held"> {
  const claimed = await claimStep(supabase, subscriber, stepId, dueAt);
  if (claimed) return "scheduled";

  const { data, error } = await supabase
    .from("telegram_step_deliveries")
    .update({
      status: "pending",
      due_at: dueAt.toISOString(),
      attempts: 0,
      error_message: null,
      sent_at: null,
    })
    .eq("subscriber_id", subscriber.id)
    .eq("step_id", stepId)
    /* Conditional, so a row another path is holding is never taken from it. */
    .in("status", WALKED_PAST)
    .select("id");

  if (error) throw error;

  return (data?.length ?? 0) > 0 ? "rearmed" : "held";
}

export interface AdvanceResult {
  sent: number;
  scheduledFor: Date | null;
  finished: boolean;
}

export interface AdvanceOptions {
  /** Funnel cover to place on the first immediate step instead of by itself. */
  leadingAttachment?: PreparedTelegramAttachment | null;
  /** Re-send only zero-delay hand-off steps already claimed by this reader. */
  replayImmediate?: boolean;
}

/**
 * Sends whatever is due now and schedules whatever comes next.
 *
 * `afterPosition` is the last step this person has already received; pass a
 * number below every position to start the sequence from the top.
 */
export async function advanceSequence(
  supabase: SupabaseClient,
  botToken: string,
  subscriber: SequenceSubscriber,
  funnelId: string,
  afterPosition: number,
  options: AdvanceOptions = {},
  now: Date = new Date(),
): Promise<AdvanceResult> {
  const steps = await loadSteps(supabase, funnelId);
  const plan = planSequence(steps, afterPosition, now);

  let sent = 0;
  let leadingAttachmentConsumed = false;

  for (const step of plan.sendNow) {
    const deliveryId = await claimStep(supabase, subscriber, step.id, now);
    if (!deliveryId && !options.replayImmediate) continue;

    const attachment = readAttachment(step);

    if (!step.body.trim() && !step.button_url.trim() && !attachment) {
      // An empty step is a placeholder the author has not written yet. Skip it
      // rather than sending a blank message, but keep the claim so the
      // sequence moves on instead of stalling here forever. A step that is
      // only a file counts as written — sending the PDF with no caption is a
      // deliberate shape, not an unfinished one.
      await supabase
        .from("telegram_step_deliveries")
        .update({ status: "cancelled", error_message: "Шаг пустой" })
        .eq("id", deliveryId);
      continue;
    }

    /* Telegram reuses its own file_id after the first delivery. Only a cold
       cache mints a Storage URL; every later subscriber gets Telegram media. */
    const prepared = await prepareTelegramAttachment(
      supabase,
      subscriber.telegram_bot_id,
      attachment,
    );
    const leadingAttachment = !leadingAttachmentConsumed
      ? options.leadingAttachment ?? null
      : null;
    const outgoingAttachment = prepared ?? leadingAttachment;
    leadingAttachmentConsumed = true;

    await sendMessage(botToken, {
      chatId: subscriber.telegram_user_id,
      // A bare file needs no filler caption; only a text step does.
      text: step.body.trim() || (outgoingAttachment ? "" : "…"),
      buttons: [{ text: step.button_text, url: step.button_url }],
      attachment: outgoingAttachment,
    });

    if (deliveryId) {
      await supabase
        .from("telegram_step_deliveries")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", deliveryId);
    }

    sent++;
  }

  if (plan.schedule) {
    const outcome = await scheduleNext(
      supabase,
      subscriber,
      plan.schedule.step.id,
      plan.schedule.dueAt,
    );

    if (outcome === "held") {
      /* Legitimate, and worth seeing: the sequence continues on whichever
         path holds the claim. Silence here is what hid the bug. */
      console.log(
        `Step ${plan.schedule.step.id} for subscriber ${subscriber.id} is already scheduled elsewhere`,
      );
    }
  }

  /*
    Two separate writes, because each is guarded by its own "only if still
    unset" condition. Combining them would mean a subscriber who already has a
    `delivered_at` never gets `sequence_done_at` written — the guard for the
    first field would suppress the second.
  */
  if (sent > 0) {
    // Marks when the funnel first kept its promise, so it is written once and
    // never moved forward by a later lesson.
    await supabase
      .from("telegram_subscribers")
      .update({ delivered_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", subscriber.id)
      .is("delivered_at", null);
  }

  if (!plan.schedule) {
    await supabase
      .from("telegram_subscribers")
      .update({ sequence_done_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", subscriber.id)
      .is("sequence_done_at", null);
  }

  return {
    sent,
    scheduledFor: plan.schedule?.dueAt ?? null,
    finished: !plan.schedule,
  };
}
