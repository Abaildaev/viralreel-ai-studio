/*
  The drip worker: delivers scheduled funnel steps.

  A course runs for days, so nothing about it can live inside a request. Each
  subscriber has at most one pending delivery row at a time, this worker sends
  the ones that have come due, and sending one schedules the next. The sequence
  advances a step per tick rather than being laid out in advance, which is what
  lets an author add lesson six while lesson three is still going out.

  Failure handling differs from the broadcast worker on purpose. A broadcast
  that misses someone is a lost impression; a course that misses lesson four
  leaves a person stranded halfway through something they were promised. So a
  failed step is retried, and only a reader who has made themselves unreachable
  ends the sequence.
*/

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";
import { decryptCredential } from "../_shared/credentials.ts";
import {
  isPermanentDeliveryFailure,
  sendMessage,
  TelegramApiError,
} from "../_shared/telegram-api.ts";
import { advanceSequence } from "../_shared/step-sender.ts";
import {
  type AttachmentColumns,
  ATTACHMENT_COLUMNS,
  prepareTelegramRowAttachment,
} from "../_shared/attachment.ts";

/* Telegram tolerates about 30 messages a second; the drip shares that budget
   with broadcasts, so it paces itself well below. */
const SEND_INTERVAL_MS = 60;

/* Short of the 150s free-plan wall clock, so progress is always written back. */
const RUN_BUDGET_MS = 100_000;

const MAX_ATTEMPTS = 4;

/* Rows per tick. A course rarely has thousands due in the same minute, and
   anything left over is picked up sixty seconds later. */
const BATCH_SIZE = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface DueDelivery {
  id: string;
  attempts: number;
  telegram_bot_id: string;
  subscriber_id: string;
  step_id: string;
  telegram_funnel_steps: AttachmentColumns & {
    user_id: string;
    position: number;
    body: string;
    button_text: string;
    button_url: string;
    is_active: boolean;
    funnel_id: string;
  } | null;
  telegram_subscribers: {
    id: string;
    user_id: string;
    telegram_user_id: string;
    telegram_bot_id: string;
    funnel_id: string | null;
    is_blocked: boolean;
    unsubscribed_at: string | null;
  } | null;
}

const DUE_COLUMNS = `
  id,attempts,telegram_bot_id,subscriber_id,step_id,
  telegram_funnel_steps(user_id,position,body,button_text,button_url,is_active,funnel_id,${ATTACHMENT_COLUMNS}),
  telegram_subscribers(id,user_id,telegram_user_id,telegram_bot_id,funnel_id,is_blocked,unsubscribed_at)
`;

/** Bot tokens are decrypted once per tick, not once per message. */
async function tokenFor(
  supabase: ReturnType<typeof createAdminClient>,
  cache: Map<string, string | null>,
  botId: string,
  expectedUserId: string,
): Promise<string | null> {
  const cacheKey = `${botId}:${expectedUserId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const { data } = await supabase
    .from("telegram_bots")
    .select("user_id,bot_token_encrypted,is_active")
    .eq("id", botId)
    .maybeSingle();

  let token: string | null = null;
  if (data?.is_active && data.user_id === expectedUserId) {
    try {
      token = await decryptCredential(data.bot_token_encrypted as string);
    } catch (error) {
      console.error(`Could not decrypt token for bot ${botId}`, error);
    }
  }

  cache.set(cacheKey, token);
  return token;
}

Deno.serve(async (req: Request) => {
  if (!await hasValidCronSecret(req)) {
    return jsonResponse({ error: "Cron authentication required" }, 401);
  }

  const supabase = createAdminClient();
  const deadline = Date.now() + RUN_BUDGET_MS;
  const tokens = new Map<string, string | null>();

  const claimToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_telegram_step_deliveries",
    { p_limit: BATCH_SIZE, p_claim_token: claimToken },
  );

  if (claimError) return jsonResponse({ error: claimError.message }, 500);

  const claimedIds = (claimed ?? []).map((row) => row.id as string);
  let due: unknown[] = [];
  if (claimedIds.length > 0) {
    const { data, error } = await supabase
      .from("telegram_step_deliveries")
      .select(DUE_COLUMNS)
      .in("id", claimedIds)
      .eq("claim_token", claimToken)
      .eq("status", "processing");
    if (error) return jsonResponse({ error: error.message }, 500);
    due = data ?? [];
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const delivery of due as unknown as DueDelivery[]) {
    if (Date.now() >= deadline) break;

    const step = delivery.telegram_funnel_steps;
    const subscriber = delivery.telegram_subscribers;

    const ownershipMismatch = Boolean(
      step && subscriber && (
        step.user_id !== subscriber.user_id ||
        subscriber.telegram_bot_id !== delivery.telegram_bot_id ||
        subscriber.funnel_id !== step.funnel_id
      )
    );
    if (ownershipMismatch) {
      const { error: ownershipError } = await supabase
        .from("telegram_step_deliveries")
        .update({
          status: "failed",
          error_message: "Telegram delivery ownership mismatch",
          claimed_at: null,
          claim_token: null,
        })
        .eq("id", delivery.id)
        .eq("claim_token", claimToken);
      if (ownershipError) throw ownershipError;
      failed++;
      continue;
    }

    /*
      The step was switched off, deleted, or the reader left after it was
      scheduled. Cancel this one but still advance the sequence, so a single
      retired lesson does not strand everyone behind it.
    */
    const unreachable = !subscriber || subscriber.is_blocked || subscriber.unsubscribed_at;
    if (!step || !step.is_active || unreachable) {
      const { data: cancelledRows, error: cancelError } = await supabase
        .from("telegram_step_deliveries")
        .update({
          status: "cancelled",
          error_message: unreachable ? "Подписчик недоступен" : "Шаг выключен",
          claimed_at: null,
          claim_token: null,
        })
        .eq("id", delivery.id)
        .eq("claim_token", claimToken)
        .select("id");
      if (cancelError) throw cancelError;
      if (!cancelledRows?.length) continue;

      if (step && subscriber && !unreachable) {
        const token = await tokenFor(supabase, tokens, delivery.telegram_bot_id, subscriber.user_id);
        if (token) {
          await advanceSequence(
            supabase,
            token,
            subscriber,
            step.funnel_id,
            step.position,
            { replayImmediate: true },
          ).catch((cause) => console.error("Could not advance past a disabled step", cause));
        }
      }

      skipped++;
      continue;
    }

    const botToken = await tokenFor(supabase, tokens, delivery.telegram_bot_id, subscriber.user_id);
    if (!botToken) {
      // The bot is off or its token is unreadable. Release the lease and leave
      // the row pending: this is the owner's to fix, and the lesson should go
      // out on the next tick after they do.
      await supabase
        .from("telegram_step_deliveries")
        .update({ status: "pending", claimed_at: null, claim_token: null })
        .eq("id", delivery.id)
        .eq("claim_token", claimToken);
      skipped++;
      continue;
    }

    try {
      /* A warm Telegram cache resolves to a file_id. Only the first delivery
         of a new object path needs a signed Storage URL. */
      const attachment = await prepareTelegramRowAttachment(
        supabase,
        delivery.telegram_bot_id,
        step,
      );

      const telegramMessageId = await sendMessage(botToken, {
        chatId: subscriber.telegram_user_id,
        text: step.body.trim() || (attachment ? "" : "…"),
        buttons: [{ text: step.button_text, url: step.button_url }],
        attachment,
      });

      const { data: sentRows, error: sentError } = await supabase
        .from("telegram_step_deliveries")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          telegram_message_id: String(telegramMessageId),
          error_message: null,
          claimed_at: null,
          claim_token: null,
        })
        .eq("id", delivery.id)
        .eq("claim_token", claimToken)
        .select("id");
      if (sentError) throw sentError;
      if (!sentRows?.length) continue;

      sent++;

      // Sending one step is what schedules the next; the sequence has no other
      // clock.
      await advanceSequence(
        supabase,
        botToken,
        subscriber,
        step.funnel_id,
        step.position,
        /* A re-armed instruction must replay its zero-delay prompt even when
           that prompt has a delivery row from an earlier walk. */
        { replayImmediate: true },
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);

      if (cause instanceof TelegramApiError && cause.code === 429) {
        await supabase
          .from("telegram_step_deliveries")
          .update({ status: "pending", claimed_at: null, claim_token: null })
          .eq("id", delivery.id)
          .eq("claim_token", claimToken);
        const wait = Math.min((cause.retryAfter ?? 5) * 1000, 30_000);
        if (Date.now() + wait >= deadline) {
          await supabase
            .from("telegram_step_deliveries")
            .update({ status: "pending", claimed_at: null, claim_token: null })
            .eq("claim_token", claimToken)
            .eq("status", "processing");
          break;
        }
        await sleep(wait);
        continue;
      }

      const permanent = isPermanentDeliveryFailure(cause);
      const attempts = Number(delivery.attempts ?? 0) + 1;

      const { data: updatedRows, error: updateError } = await supabase
        .from("telegram_step_deliveries")
        .update({
          status: permanent || attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error_message: message,
          claimed_at: null,
          claim_token: null,
        })
        .eq("id", delivery.id)
        .eq("claim_token", claimToken)
        .select("id");
      if (updateError) throw updateError;
      if (!updatedRows?.length) continue;

      if (permanent) {
        await supabase
          .from("telegram_subscribers")
          .update({ is_blocked: true, updated_at: new Date().toISOString() })
          .eq("id", subscriber.id);
      }

      failed++;
    }

    await sleep(SEND_INTERVAL_MS);
  }

  /* Rows left in the claimed batch when the wall-clock budget is reached are
     immediately available to the next tick instead of waiting for lease TTL. */
  if (Date.now() >= deadline) {
    await supabase
      .from("telegram_step_deliveries")
      .update({ status: "pending", claimed_at: null, claim_token: null })
      .eq("claim_token", claimToken)
      .eq("status", "processing");
  }

  return jsonResponse({ due: due.length, sent, skipped, failed });
});
