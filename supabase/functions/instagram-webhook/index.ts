import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/auth.ts";
import { constantTimeEqual, secretEquals } from "../_shared/crypto.ts";
import { describeInstagramError, InstagramApiError } from "../_shared/instagram.ts";
import {
  buildDirectMessage,
  LEAD_MAGNET_COLUMNS,
  LeadMagnetRow,
  normalizeText,
  pickPublicReply,
  selectLeadMagnet,
  TriggerType,
  truncateUtf8,
} from "../_shared/keyword-match.ts";

const GRAPH_API_BASE_URL = "https://graph.instagram.com/v26.0";

/** Upper bound for the humanising delay, to stay inside the background-task budget. */
const MAX_REPLY_DELAY_SECONDS = 60;

interface IncomingEvent {
  accountIgId: string;
  eventId: string;
  triggerType: TriggerType;
  senderIgsid: string | null;
  text: string;
  commentId?: string;
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
        messaging.message.mid ?? `dm:${accountIgId}:${senderIgsid ?? "unknown"}:${messaging.timestamp ?? 0}`,
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
        eventId: String(value.id),
        triggerType: "comment",
        senderIgsid: value?.from?.id ? String(value.from.id) : null,
        text: String(value.text),
        commentId: String(value.id),
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

async function graphPost(url: string, accessToken: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new InstagramApiError(
      data?.error?.message ?? `Instagram API returned HTTP ${response.status}`,
      data?.error?.code,
      data?.error?.error_subcode,
    );
  }
  return data;
}

async function sendInstagramReply(
  accountIgId: string,
  accessToken: string,
  event: IncomingEvent,
  message: Record<string, unknown>,
): Promise<string> {
  if (event.triggerType === "dm" && !event.senderIgsid) {
    throw new Error("Instagram sender ID is missing");
  }

  // Comment-triggered DMs go through the private-reply endpoint, which is the
  // only way to message someone who has not written to us first.
  const recipient = event.triggerType === "comment"
    ? { comment_id: event.commentId }
    : { id: event.senderIgsid };

  const data = await graphPost(
    `${GRAPH_API_BASE_URL}/${accountIgId}/messages`,
    accessToken,
    { recipient, message },
  );
  return String(data.message_id ?? "");
}

async function sendPublicCommentReply(
  commentId: string,
  accessToken: string,
  text: string,
): Promise<string> {
  const data = await graphPost(
    `${GRAPH_API_BASE_URL}/${commentId}/replies`,
    accessToken,
    { message: truncateUtf8(text, 300) },
  );
  return String(data.id ?? "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processEvent(event: IncomingEvent): Promise<void> {
  const supabase = createAdminClient();
  const { data: account, error: accountError } = await supabase
    .from("instagram_accounts")
    .select("id,user_id,ig_user_id,username,access_token,is_active")
    .eq("ig_user_id", event.accountIgId)
    .eq("is_active", true)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) {
    console.warn(`No active Instagram account found for webhook entry ${event.accountIgId}`);
    return;
  }

  // Our own public replies come back as comment events; without this the
  // automation would answer itself in a loop.
  if (
    event.senderIgsid === String(account.ig_user_id) ||
    normalizeText(event.commenterUsername ?? "") === normalizeText(String(account.username ?? ""))
  ) {
    return;
  }

  const { data: eventRow, error: eventInsertError } = await supabase
    .from("instagram_automation_events")
    .insert({
      instagram_account_id: account.id,
      meta_event_id: event.eventId,
      trigger_type: event.triggerType,
      sender_igsid: event.senderIgsid,
      incoming_text: event.text,
      media_id: event.mediaId ?? null,
      commenter_username: event.commenterUsername ?? null,
      public_reply_status: event.triggerType === "comment" ? "pending" : "skipped",
      dm_status: "pending",
      raw_event: event.rawEvent,
    })
    .select("id")
    .single();

  if (eventInsertError?.code === "23505") return;
  if (eventInsertError) throw eventInsertError;

  const finish = (patch: Record<string, unknown>) =>
    supabase
      .from("instagram_automation_events")
      .update({ ...patch, processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);

  const { data: leadMagnets, error: leadMagnetError } = await supabase
    .from("lead_magnets")
    .select(LEAD_MAGNET_COLUMNS)
    .eq("user_id", account.user_id)
    .eq("is_active", true)
    .or(`instagram_account_id.eq.${account.id},instagram_account_id.is.null`);

  if (leadMagnetError) throw leadMagnetError;

  const match = selectLeadMagnet((leadMagnets ?? []) as LeadMagnetRow[], {
    triggerType: event.triggerType,
    text: event.text,
    mediaId: event.mediaId,
  });

  if (!match) {
    await finish({ status: "ignored", public_reply_status: "skipped", dm_status: "skipped" });
    return;
  }

  const matched = match.leadMagnet;

  if (event.senderIgsid && matched.repeat_delay_hours > 0) {
    const cutoff = new Date(Date.now() - matched.repeat_delay_hours * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("instagram_automation_events")
      .select("id", { count: "exact", head: true })
      .eq("lead_magnet_id", matched.id)
      .eq("sender_igsid", event.senderIgsid)
      .eq("status", "sent")
      .gte("created_at", cutoff);
    if ((count ?? 0) > 0) {
      await finish({
        lead_magnet_id: matched.id,
        status: "ignored",
        public_reply_status: "skipped",
        dm_status: "skipped",
        error_message: `Этот человек уже получал материал — повтор доступен через ${matched.repeat_delay_hours} ч.`,
      });
      return;
    }
  }

  if (!String(account.access_token).startsWith("IGAA")) {
    await finish({
      lead_magnet_id: matched.id,
      status: "failed",
      public_reply_status: "skipped",
      dm_status: "failed",
      error_message:
        "Автоответы требуют токен Instagram Login (IGAA). Переподключите аккаунт через Instagram, а не через Facebook.",
    });
    return;
  }

  const delaySeconds = Math.min(Math.max(matched.reply_delay_seconds ?? 0, 0), MAX_REPLY_DELAY_SECONDS);
  if (delaySeconds > 0) {
    // Jitter so repeated triggers do not answer at a metronomic interval.
    await sleep((delaySeconds * 0.5 + Math.random() * delaySeconds * 0.5) * 1000);
  }

  // The Direct message is the promise; the public comment merely announces it.
  // Sending the announcement first would publicly claim a delivery that may
  // never happen, so the DM goes out first and gates everything else.
  let messageId: string;
  try {
    messageId = await sendInstagramReply(
      account.ig_user_id,
      account.access_token,
      event,
      buildDirectMessage(matched),
    );
  } catch (error) {
    await finish({
      lead_magnet_id: matched.id,
      status: "failed",
      public_reply_status: "skipped",
      dm_status: "failed",
      error_message: describeInstagramError(error),
    });
    return;
  }

  let publicReplyStatus = "skipped";
  let publicReplyId = "";
  let publicReplyError = "";
  if (event.triggerType === "comment" && matched.public_reply_enabled && event.commentId) {
    try {
      publicReplyId = await sendPublicCommentReply(
        event.commentId,
        account.access_token,
        pickPublicReply(matched),
      );
      publicReplyStatus = "sent";
    } catch (error) {
      publicReplyStatus = "failed";
      publicReplyError = describeInstagramError(error);
    }
  }

  await finish({
    lead_magnet_id: matched.id,
    status: "sent",
    public_reply_status: publicReplyStatus,
    public_reply_id: publicReplyId || null,
    dm_status: "sent",
    response_message_id: messageId,
    error_message: publicReplyError ? `Direct доставлен, но публичный ответ не отправлен: ${publicReplyError}` : null,
  });
}

async function processPayload(payload: unknown): Promise<void> {
  for (const event of extractEvents(payload)) {
    try {
      await processEvent(event);
    } catch (error) {
      console.error("Instagram automation event failed", error);
    }
  }
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
  const validSignature = await hasValidSignature(rawBody, req.headers.get("X-Hub-Signature-256"));
  if (!validSignature) return jsonResponse({ error: "Invalid webhook signature" }, 401);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  EdgeRuntime.waitUntil(processPayload(payload));
  return jsonResponse({ received: true });
});
