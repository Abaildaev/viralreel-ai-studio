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
  signRowAttachment,
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
    position: number;
    body: string;
    button_text: string;
    button_url: string;
    is_active: boolean;
    funnel_id: string;
  } | null;
  telegram_subscribers: {
    id: string;
    telegram_user_id: string;
    telegram_bot_id: string;
    is_blocked: boolean;
    unsubscribed_at: string | null;
  } | null;
}

const DUE_COLUMNS = `
  id,attempts,telegram_bot_id,subscriber_id,step_id,
  telegram_funnel_steps(position,body,button_text,button_url,is_active,funnel_id,${ATTACHMENT_COLUMNS}),
  telegram_subscribers(id,telegram_user_id,telegram_bot_id,is_blocked,unsubscribed_at)
`;

/** Bot tokens are decrypted once per tick, not once per message. */
async function tokenFor(
  supabase: ReturnType<typeof createAdminClient>,
  cache: Map<string, string | null>,
  botId: string,
): Promise<string | null> {
  if (cache.has(botId)) return cache.get(botId) ?? null;

  const { data } = await supabase
    .from("telegram_bots")
    .select("bot_token_encrypted,is_active")
    .eq("id", botId)
    .maybeSingle();

  let token: string | null = null;
  if (data?.is_active) {
    try {
      token = await decryptCredential(data.bot_token_encrypted as string);
    } catch (error) {
      console.error(`Could not decrypt token for bot ${botId}`, error);
    }
  }

  cache.set(botId, token);
  return token;
}

Deno.serve(async (req: Request) => {
  if (!await hasValidCronSecret(req)) {
    return jsonResponse({ error: "Cron authentication required" }, 401);
  }

  const supabase = createAdminClient();
  const deadline = Date.now() + RUN_BUDGET_MS;
  const tokens = new Map<string, string | null>();

  const { data: due, error } = await supabase
    .from("telegram_step_deliveries")
    .select(DUE_COLUMNS)
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("due_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return jsonResponse({ error: error.message }, 500);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const delivery of (due ?? []) as unknown as DueDelivery[]) {
    if (Date.now() >= deadline) break;

    const step = delivery.telegram_funnel_steps;
    const subscriber = delivery.telegram_subscribers;

    /*
      The step was switched off, deleted, or the reader left after it was
      scheduled. Cancel this one but still advance the sequence, so a single
      retired lesson does not strand everyone behind it.
    */
    const unreachable = !subscriber || subscriber.is_blocked || subscriber.unsubscribed_at;
    if (!step || !step.is_active || unreachable) {
      await supabase
        .from("telegram_step_deliveries")
        .update({
          status: "cancelled",
          error_message: unreachable ? "Подписчик недоступен" : "Шаг выключен",
        })
        .eq("id", delivery.id);

      if (step && subscriber && !unreachable) {
        const token = await tokenFor(supabase, tokens, delivery.telegram_bot_id);
        if (token) {
          await advanceSequence(
            supabase,
            token,
            subscriber,
            step.funnel_id,
            step.position,
          ).catch((cause) => console.error("Could not advance past a disabled step", cause));
        }
      }

      skipped++;
      continue;
    }

    const botToken = await tokenFor(supabase, tokens, delivery.telegram_bot_id);
    if (!botToken) {
      // The bot is off or its token is unreadable. Leave the row pending: this
      // is the owner's to fix, and the lesson should go out when they do.
      skipped++;
      continue;
    }

    try {
      /* Signed per delivery rather than per tick: a batch is a hundred
         different steps belonging to different funnels, so there is no shared
         file to sign once the way a broadcast has. */
      const attachment = await signRowAttachment(supabase, step);

      await sendMessage(botToken, {
        chatId: subscriber.telegram_user_id,
        text: step.body.trim() || (attachment ? "" : "…"),
        buttons: [{ text: step.button_text, url: step.button_url }],
        attachment,
      });

      await supabase
        .from("telegram_step_deliveries")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", delivery.id);

      sent++;

      // Sending one step is what schedules the next; the sequence has no other
      // clock.
      await advanceSequence(supabase, botToken, subscriber, step.funnel_id, step.position);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);

      if (cause instanceof TelegramApiError && cause.code === 429) {
        const wait = Math.min((cause.retryAfter ?? 5) * 1000, 30_000);
        if (Date.now() + wait >= deadline) break;
        await sleep(wait);
        continue;
      }

      const permanent = isPermanentDeliveryFailure(cause);
      const attempts = Number(delivery.attempts ?? 0) + 1;

      await supabase
        .from("telegram_step_deliveries")
        .update({
          status: permanent || attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error_message: message,
        })
        .eq("id", delivery.id);

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

  return jsonResponse({ due: (due ?? []).length, sent, skipped, failed });
});
