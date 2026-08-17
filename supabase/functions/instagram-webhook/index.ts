/*
  The Instagram webhook: validate, write down, answer.

  It used to do the whole job inside the request — match the keyword, wait out
  the humanising delay, call the Graph API, run the sales agent — one event at
  a time. That works at a trickle and fails at exactly the moment worth caring
  about. Comments on a Reel that takes off arrive in bursts; an Edge Function
  worker lives 150 seconds; and with a delay of thirty seconds per event, a
  batch of more than half a dozen was cut off partway through. The rows were
  already written, so Meta's retry deduplicated against them, and the rest of
  the burst was gone. Silently.

  Now the only job here is to be fast and to lose nothing: verify the
  signature, record each event, return 200. `instagram-worker` does the rest on
  a schedule, with retries, so a failure costs a few minutes instead of a lead.

  The unique constraint on (account, meta_event_id) still provides idempotency
  for Meta's retries — but now a crash before processing leaves a row the
  worker will pick up, rather than a row nobody will ever look at again.
*/

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/auth.ts";
import { constantTimeEqual, secretEquals } from "../_shared/crypto.ts";
import { normalizeText, TriggerType } from "../_shared/keyword-match.ts";

interface IncomingEvent {
  accountIgId: string;
  eventId: string;
  triggerType: TriggerType;
  senderIgsid: string | null;
  text: string;
  mediaId?: string;
  commenterUsername?: string;
  rawEvent: Record<string, unknown>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractEvents(payload: any): IncomingEvent[] {
  const events: IncomingEvent[] = [];

  for (const entry of payload?.entry ?? []) {
    const accountIgId = String(entry?.id ?? "");
    if (!accountIgId) continue;

    for (const messaging of entry?.messaging ?? []) {
      if (!messaging?.message?.text || messaging.message.is_echo || messaging.is_self) continue;
      const senderIgsid = messaging?.sender?.id ? String(messaging.sender.id) : null;
      const eventId = String(
        messaging.message.mid ??
          `dm:${accountIgId}:${senderIgsid ?? "unknown"}:${messaging.timestamp ?? 0}`,
      );
      events.push({
        accountIgId,
        eventId,
        triggerType: "dm",
        senderIgsid,
        text: String(messaging.message.text),
        rawEvent: messaging,
      });
    }

    for (const change of entry?.changes ?? []) {
      if (change?.field !== "comments" || !change?.value?.text || !change?.value?.id) continue;
      const value = change.value;
      events.push({
        accountIgId,
        /*
          The comment id doubles as the event id. The worker needs it to call
          the private-reply endpoint, which is addressed by comment rather than
          by person.
        */
        eventId: String(value.id),
        triggerType: "comment",
        senderIgsid: value?.from?.id ? String(value.from.id) : null,
        text: String(value.text),
        mediaId: value?.media?.id ? String(value.media.id) : undefined,
        commenterUsername: value?.from?.username ? String(value.from.username) : undefined,
        rawEvent: change,
      });
    }
  }

  return events;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

async function hasValidSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const provided = hexToBytes(signatureHeader.slice("sha256=".length));
  if (!provided) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  return constantTimeEqual(expected, provided);
}

/**
 * Records a batch of events for the worker.
 *
 * The reply delay is resolved to a `next_attempt_at` here rather than slept
 * through later. It is read from whichever rule has the longest delay for this
 * account, because the actual matching rule is not known until the worker runs
 * — and waiting slightly too long is invisible, while replying too soon is the
 * behaviour the setting exists to prevent.
 */
async function enqueue(payload: unknown): Promise<number> {
  const supabase = createAdminClient();
  const events = extractEvents(payload);
  if (events.length === 0) return 0;

  const accountIds = [...new Set(events.map((event) => event.accountIgId))];
  const { data: accountRows } = await supabase
    .from("instagram_accounts")
    .select("id,ig_user_id,username,user_id")
    .in("ig_user_id", accountIds)
    .eq("is_active", true);

  const accounts = new Map(
    (accountRows ?? []).map((row) => [String(row.ig_user_id), row]),
  );

  const delays = new Map<string, number>();
  for (const account of accounts.values()) {
    const { data: rules } = await supabase
      .from("lead_magnets")
      .select("reply_delay_seconds")
      .eq("user_id", account.user_id)
      .eq("is_active", true)
      .order("reply_delay_seconds", { ascending: false })
      .limit(1);
    delays.set(account.id as string, rules?.[0]?.reply_delay_seconds ?? 0);
  }

  const rows: Record<string, unknown>[] = [];

  for (const event of events) {
    const account = accounts.get(event.accountIgId);
    if (!account) {
      console.warn(`No active Instagram account for webhook entry ${event.accountIgId}`);
      continue;
    }

    /*
      Our own public replies come back as comment events. Without this the
      automation would answer itself in a loop.
    */
    if (
      event.senderIgsid === String(account.ig_user_id) ||
      normalizeText(event.commenterUsername ?? "") === normalizeText(String(account.username ?? ""))
    ) {
      continue;
    }

    const delaySeconds = delays.get(account.id as string) ?? 0;
    // Jitter, so a burst of replies does not go out at a metronomic interval.
    const wait = delaySeconds > 0
      ? (delaySeconds * 0.5 + Math.random() * delaySeconds * 0.5) * 1000
      : 0;

    rows.push({
      instagram_account_id: account.id,
      meta_event_id: event.eventId,
      trigger_type: event.triggerType,
      sender_igsid: event.senderIgsid,
      incoming_text: event.text,
      media_id: event.mediaId ?? null,
      commenter_username: event.commenterUsername ?? null,
      public_reply_status: event.triggerType === "comment" ? "pending" : "skipped",
      dm_status: "pending",
      status: "received",
      next_attempt_at: new Date(Date.now() + wait).toISOString(),
      raw_event: event.rawEvent,
    });
  }

  if (rows.length === 0) return 0;

  /*
    One insert for the whole batch, ignoring duplicates. `ignoreDuplicates`
    turns Meta's redelivery into a no-op instead of an error, which is exactly
    the idempotency the unique constraint was added for.
  */
  const { error } = await supabase
    .from("instagram_automation_events")
    .upsert(rows, {
      onConflict: "instagram_account_id,meta_event_id",
      ignoreDuplicates: true,
    });

  if (error) throw error;
  return rows.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const tokenMatches = await secretEquals(
      url.searchParams.get("hub.verify_token"),
      Deno.env.get("META_WEBHOOK_VERIFY_TOKEN"),
    );

    if (mode === "subscribe" && challenge && tokenMatches) {
      return new Response(challenge, { status: 200 });
    }
    return jsonResponse({ error: "Webhook verification failed" }, 403);
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  if (!await hasValidSignature(rawBody, req.headers.get("X-Hub-Signature-256"))) {
    return jsonResponse({ error: "Invalid webhook signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  /*
    Answered synchronously, unlike the old background task. Writing rows is
    fast, and a non-2xx now means Meta retries an event that was genuinely not
    recorded — which is the behaviour we want, and could not have before,
    because the work continued after the response was sent.
  */
  try {
    const queued = await enqueue(payload);
    return jsonResponse({ received: true, queued });
  } catch (error) {
    console.error("Could not enqueue Instagram events", error);
    return jsonResponse({ error: "Could not record events" }, 500);
  }
});
