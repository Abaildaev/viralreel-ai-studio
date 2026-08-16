/*
  The broadcast worker, run once a minute by pg_cron.

  A broadcast to a few thousand people cannot finish inside one Edge Function:
  the worker is capped at 150 seconds on the free plan, and Telegram will not
  accept messages faster than roughly thirty a second anyway. So the audience is
  materialised into `telegram_broadcast_recipients` when the send starts, and
  each tick drains as much of that queue as it can afford before handing the
  rest to the next tick.

  The queue is what makes the run resumable. A worker killed mid-batch loses
  nothing but the in-flight message, and nobody is written to twice, because a
  recipient leaves `pending` only after Telegram has accepted it.
*/

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";
import { decryptCredential } from "../_shared/credentials.ts";
import {
  isPermanentDeliveryFailure,
  sendMessage,
  TelegramApiError,
} from "../_shared/telegram-api.ts";
import {
  applyAudienceFilters,
  audienceFilters,
  type BroadcastSegment,
} from "../_shared/broadcast-segments.ts";

/* Telegram tolerates about 30 messages a second to distinct users. Sending a
   little under that keeps the run clear of 429s, which cost more time than the
   pacing does. */
const SEND_INTERVAL_MS = 40;

/* Stop well short of the 150s free-plan wall clock, so the tick always gets to
   write its progress back before the worker is cut off. */
const RUN_BUDGET_MS = 100_000;

/* A recipient that keeps failing for a transient reason is retried on later
   ticks, but not forever. */
const MAX_ATTEMPTS = 3;

/* PostgREST's default `db-max-rows`. Anything reading the full audience has to
   page rather than assume one request returns it. */
const SELECT_PAGE_SIZE = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface BroadcastRow {
  id: string;
  user_id: string;
  telegram_bot_id: string;
  message_text: string;
  button_text: string;
  button_url: string;
  disable_notification: boolean;
  segment: string;
  segment_funnel_id: string | null;
  status: string;
}

const BROADCAST_COLUMNS =
  "id,user_id,telegram_bot_id,message_text,button_text,button_url," +
  "disable_notification,segment,segment_funnel_id,status";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Freezes the audience for one broadcast.
 *
 * Blocked and unsubscribed people are excluded here rather than at send time,
 * so the recipient count the owner sees is the number of people who can
 * actually receive it, not the number who matched a filter.
 */
async function materialiseRecipients(
  supabase: ReturnType<typeof createAdminClient>,
  broadcast: BroadcastRow,
): Promise<number> {
  /*
    Built fresh per page. A Postgrest builder is a thenable that carries the
    filters accumulated on it, so reusing one instance across pages would append
    a second `order` on every iteration instead of just moving the window.
  */
  const filters = audienceFilters(
    broadcast.segment as BroadcastSegment,
    broadcast.segment_funnel_id,
  );

  const pageQuery = (page: number) => {
    const query = applyAudienceFilters(
      supabase
        .from("telegram_subscribers")
        .select("id,telegram_user_id")
        .eq("telegram_bot_id", broadcast.telegram_bot_id),
      filters,
    );

    // A stable sort key is what makes the windows disjoint; without it the
    // database may return the same person on two pages and miss another.
    return query
      .order("id", { ascending: true })
      .range(page * SELECT_PAGE_SIZE, page * SELECT_PAGE_SIZE + SELECT_PAGE_SIZE - 1);
  };

  /*
    Paged, because PostgREST caps a select at 1000 rows. Without this a
    broadcast to a larger audience would silently reach only the first thousand
    people and still report itself as fully sent.
  */
  const rows: { broadcast_id: string; subscriber_id: string; telegram_user_id: string }[] = [];

  for (let page = 0; ; page++) {
    const { data: subscribers, error } = await pageQuery(page);
    if (error) throw error;

    for (const subscriber of subscribers ?? []) {
      rows.push({
        broadcast_id: broadcast.id,
        subscriber_id: subscriber.id as string,
        telegram_user_id: subscriber.telegram_user_id as string,
      });
    }

    if (!subscribers || subscribers.length < SELECT_PAGE_SIZE) break;
  }

  // Chunked, because a single insert of tens of thousands of rows can outlive
  // the request. `ignoreDuplicates` makes a re-run of this step a no-op.
  for (let index = 0; index < rows.length; index += 500) {
    const { error: insertError } = await supabase
      .from("telegram_broadcast_recipients")
      .upsert(rows.slice(index, index + 500), {
        onConflict: "broadcast_id,subscriber_id",
        ignoreDuplicates: true,
      });
    if (insertError) throw insertError;
  }

  return rows.length;
}

/** Drains pending recipients until the queue empties or the budget runs out. */
async function drain(
  supabase: ReturnType<typeof createAdminClient>,
  broadcast: BroadcastRow,
  botToken: string,
  deadline: number,
): Promise<{ sent: number; failed: number; drained: boolean }> {
  let sent = 0;
  let failed = 0;

  while (Date.now() < deadline) {
    const { data: batch, error } = await supabase
      .from("telegram_broadcast_recipients")
      .select("id,telegram_user_id,subscriber_id,attempts")
      .eq("broadcast_id", broadcast.id)
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .limit(100);

    if (error) throw error;
    if (!batch || batch.length === 0) return { sent, failed, drained: true };

    for (const recipient of batch) {
      if (Date.now() >= deadline) return { sent, failed, drained: false };

      try {
        await sendMessage(botToken, {
          chatId: recipient.telegram_user_id as string,
          text: broadcast.message_text,
          buttons: [{ text: broadcast.button_text, url: broadcast.button_url }],
          disableNotification: broadcast.disable_notification,
        });

        await supabase
          .from("telegram_broadcast_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("id", recipient.id);
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // A flood wait applies to the whole bot, so pausing the run beats
        // burning the remaining budget on calls Telegram will reject.
        if (error instanceof TelegramApiError && error.code === 429) {
          const wait = Math.min((error.retryAfter ?? 5) * 1000, 30_000);
          if (Date.now() + wait >= deadline) return { sent, failed, drained: false };
          await sleep(wait);
          continue;
        }

        const permanent = isPermanentDeliveryFailure(error);
        const attempts = Number(recipient.attempts ?? 0) + 1;

        await supabase
          .from("telegram_broadcast_recipients")
          .update({
            status: permanent || attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            attempts,
            error_message: message,
          })
          .eq("id", recipient.id);

        if (permanent) {
          // They cannot receive anything again — keep every future broadcast
          // from paying for the same discovery.
          await supabase
            .from("telegram_subscribers")
            .update({ is_blocked: true, updated_at: new Date().toISOString() })
            .eq("id", recipient.subscriber_id);
        }

        if (permanent || attempts >= MAX_ATTEMPTS) failed++;
      }

      await sleep(SEND_INTERVAL_MS);
    }
  }

  return { sent, failed, drained: false };
}

async function runBroadcast(
  supabase: ReturnType<typeof createAdminClient>,
  broadcast: BroadcastRow,
  deadline: number,
): Promise<void> {
  const { data: bot } = await supabase
    .from("telegram_bots")
    .select("id,bot_token_encrypted,is_active")
    .eq("id", broadcast.telegram_bot_id)
    .maybeSingle();

  if (!bot?.is_active) {
    await supabase
      .from("telegram_broadcasts")
      .update({
        status: "failed",
        error_message: "Бот отключён — рассылка остановлена",
        finished_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);
    return;
  }

  const botToken = await decryptCredential(bot.bot_token_encrypted as string);

  if (broadcast.status === "scheduled") {
    const total = await materialiseRecipients(supabase, broadcast);
    await supabase
      .from("telegram_broadcasts")
      .update({
        status: "sending",
        total_recipients: total,
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", broadcast.id);

    if (total === 0) {
      await supabase
        .from("telegram_broadcasts")
        .update({ status: "sent", finished_at: new Date().toISOString() })
        .eq("id", broadcast.id);
      return;
    }
  }

  const { sent, failed, drained } = await drain(supabase, broadcast, botToken, deadline);

  // Counts are recomputed from the queue rather than incremented, so a tick
  // that dies after sending but before reporting cannot double-count.
  const { count: sentTotal } = await supabase
    .from("telegram_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcast.id)
    .eq("status", "sent");

  const { count: failedTotal } = await supabase
    .from("telegram_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcast.id)
    .eq("status", "failed");

  await supabase
    .from("telegram_broadcasts")
    .update({
      sent_count: sentTotal ?? sent,
      failed_count: failedTotal ?? failed,
      ...(drained
        ? { status: "sent", finished_at: new Date().toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", broadcast.id);
}

Deno.serve(async (req: Request) => {
  if (!await hasValidCronSecret(req)) {
    return jsonResponse({ error: "Cron authentication required" }, 401);
  }

  const supabase = createAdminClient();
  const deadline = Date.now() + RUN_BUDGET_MS;

  // Sends already under way finish before new ones begin, so a large broadcast
  // cannot be starved by a stream of newly scheduled small ones.
  const { data: sending } = await supabase
    .from("telegram_broadcasts")
    .select(BROADCAST_COLUMNS)
    .eq("status", "sending")
    .order("started_at", { ascending: true })
    .limit(5);

  const { data: due } = await supabase
    .from("telegram_broadcasts")
    .select(BROADCAST_COLUMNS)
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);

  const queue = [...(sending ?? []), ...(due ?? [])] as BroadcastRow[];
  let processed = 0;

  for (const broadcast of queue) {
    if (Date.now() >= deadline) break;
    try {
      await runBroadcast(supabase, broadcast, deadline);
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Broadcast ${broadcast.id} failed`, message);
      await supabase
        .from("telegram_broadcasts")
        .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
        .eq("id", broadcast.id);
    }
  }

  return jsonResponse({ processed, queued: queue.length });
});
