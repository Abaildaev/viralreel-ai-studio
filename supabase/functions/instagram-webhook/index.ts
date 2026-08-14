import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/auth.ts";
import { constantTimeEqual, secretEquals } from "../_shared/crypto.ts";

const GRAPH_API_BASE_URL = "https://graph.instagram.com/v26.0";

type TriggerType = "dm" | "comment";

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

interface LeadMagnetRow {
  id: string;
  instagram_account_id: string | null;
  title: string;
  description: string;
  codeword: string;
  keywords: string[];
  reply_text: string;
  response_url: string;
  button_text: string;
  match_mode: "exact" | "contains";
  trigger_dm: boolean;
  trigger_comments: boolean;
  public_reply_enabled: boolean;
  public_reply_variants: string[];
  media_scope: "all" | "selected";
  media_ids: string[];
  repeat_delay_hours: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("ru-RU");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesCodeword(text: string, codeword: string, mode: "exact" | "contains"): boolean {
  const normalizedText = normalizeText(text);
  const normalizedCodeword = normalizeText(codeword);
  if (!normalizedText || !normalizedCodeword) return false;
  if (mode === "exact") return normalizedText === normalizedCodeword;

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapeRegExp(normalizedCodeword)}($|[^\\p{L}\\p{N}_])`,
    "u",
  );
  return pattern.test(normalizedText);
}

function buildReply(leadMagnet: LeadMagnetRow): string {
  const fallback = leadMagnet.description
    ? `Вот ваш материал «${leadMagnet.title}».\n\n${leadMagnet.description}`
    : `Вот ваш материал «${leadMagnet.title}».`;
  return truncateUtf8(leadMagnet.reply_text.trim() || fallback, 640);
}

function buildDirectMessage(leadMagnet: LeadMagnetRow): Record<string, unknown> {
  const text = buildReply(leadMagnet);
  const url = leadMagnet.response_url.trim();
  if (!url) return { text };

  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons: [{
          type: "web_url",
          url,
          title: truncateUtf8(leadMagnet.button_text.trim() || "Получить материал", 20),
        }],
      },
    },
  };
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
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

async function sendInstagramReply(
  accountIgId: string,
  accessToken: string,
  event: IncomingEvent,
  message: Record<string, unknown>,
): Promise<string> {
  const recipient = event.triggerType === "comment"
    ? { comment_id: event.commentId }
    : { id: event.senderIgsid };

  if (event.triggerType === "dm" && !event.senderIgsid) {
    throw new Error("Instagram sender ID is missing");
  }

  const response = await fetch(`${GRAPH_API_BASE_URL}/${accountIgId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient, message }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data?.error?.message ?? `Instagram API returned HTTP ${response.status}`);
  }
  return String(data.message_id ?? "");
}

async function sendPublicCommentReply(
  commentId: string,
  accessToken: string,
  text: string,
): Promise<string> {
  const response = await fetch(`${GRAPH_API_BASE_URL}/${commentId}/replies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: truncateUtf8(text, 300) }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data?.error?.message ?? `Instagram API returned HTTP ${response.status}`);
  }
  return String(data.id ?? "");
}

function pickPublicReply(leadMagnet: LeadMagnetRow): string {
  const variants = (leadMagnet.public_reply_variants ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (variants.length === 0) return "Отправил в Direct 🙌";
  return variants[Math.floor(Math.random() * variants.length)];
}

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

  const { data: leadMagnets, error: leadMagnetError } = await supabase
    .from("lead_magnets")
    .select("id,instagram_account_id,title,description,codeword,keywords,reply_text,response_url,button_text,match_mode,trigger_dm,trigger_comments,public_reply_enabled,public_reply_variants,media_scope,media_ids,repeat_delay_hours")
    .eq("user_id", account.user_id)
    .eq("is_active", true)
    .or(`instagram_account_id.eq.${account.id},instagram_account_id.is.null`);

  if (leadMagnetError) throw leadMagnetError;

  const sortedLeadMagnets = ((leadMagnets ?? []) as LeadMagnetRow[]).sort((left, right) =>
    Number(Boolean(right.instagram_account_id)) - Number(Boolean(left.instagram_account_id))
  );
  const matched = sortedLeadMagnets.find((leadMagnet) => {
    const triggerEnabled = event.triggerType === "dm"
      ? leadMagnet.trigger_dm
      : leadMagnet.trigger_comments;
    const mediaEnabled = event.triggerType !== "comment" ||
      leadMagnet.media_scope !== "selected" ||
      Boolean(event.mediaId && leadMagnet.media_ids?.includes(event.mediaId));
    const keywords = leadMagnet.keywords?.length ? leadMagnet.keywords : [leadMagnet.codeword];
    return triggerEnabled && mediaEnabled && keywords.some((keyword) =>
      matchesCodeword(event.text, keyword, leadMagnet.match_mode)
    );
  });

  if (!matched) {
    await supabase
      .from("instagram_automation_events")
      .update({
        status: "ignored",
        public_reply_status: "skipped",
        dm_status: "skipped",
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRow.id);
    return;
  }


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
      await supabase
        .from("instagram_automation_events")
        .update({
          lead_magnet_id: matched.id,
          status: "ignored",
          public_reply_status: "skipped",
          dm_status: "skipped",
          error_message: `Повторный запуск доступен через ${matched.repeat_delay_hours} ч.`,
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventRow.id);
      return;
    }
  }

  if (!String(account.access_token).startsWith("IGAA")) {
    await supabase
      .from("instagram_automation_events")
      .update({
        lead_magnet_id: matched.id,
        status: "failed",
        public_reply_status: "skipped",
        dm_status: "failed",
        error_message: "Keyword automation requires an Instagram Login (IGAA) user token",
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRow.id);
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
      publicReplyError = error instanceof Error ? error.message : String(error);
    }
  }

  try {
    const messageId = await sendInstagramReply(
      account.ig_user_id,
      account.access_token,
      event,
      buildDirectMessage(matched),
    );
    await supabase
      .from("instagram_automation_events")
      .update({
        lead_magnet_id: matched.id,
        status: "sent",
        public_reply_status: publicReplyStatus,
        public_reply_id: publicReplyId || null,
        dm_status: "sent",
        response_message_id: messageId,
        error_message: publicReplyError || null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRow.id);
  } catch (error) {
    const dmError = error instanceof Error ? error.message : String(error);
    await supabase
      .from("instagram_automation_events")
      .update({
        lead_magnet_id: matched.id,
        status: "failed",
        public_reply_status: publicReplyStatus,
        public_reply_id: publicReplyId || null,
        dm_status: "failed",
        error_message: [publicReplyError, dmError].filter(Boolean).join(" · "),
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRow.id);
  }
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
