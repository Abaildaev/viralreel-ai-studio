/*
  The Instagram automation worker.

  Everything that used to happen inside the webhook now happens here, once a
  minute, against a queue. The move exists for one reason: a Reel that takes off
  delivers its comments in a burst, and the old design processed them one at a
  time inside a single request that slept before each reply. Past the worker's
  wall-clock limit the rest of the batch was dropped — and dropped for good,
  because the rows were already written and Meta's retry deduplicated against
  them. The failure was silent and arrived exactly at the moment the account was
  finally working.

  Here a failure costs a retry instead. The humanising delay is a timestamp to
  wait for rather than a sleep, so waiting is free, and an account's sending is
  capped below Meta's own limit so a spike cannot spend the hour's allowance in
  its first minute.
*/

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";
import { describeInstagramError, InstagramApiError } from "../_shared/instagram.ts";
import {
  buildProfileLinkMessage,
  buildQuickReplyMessage,
  buildDirectMessage,
  pickDirectReply,
  quickReplyFollowup,
  LEAD_MAGNET_COLUMNS,
  LeadMagnetRow,
  pickPublicReply,
  quickReplyParentEventId,
  selectLeadMagnet,
  selectCommentExperimentVariant,
  TriggerType,
  truncateUtf8,
} from "../_shared/keyword-match.ts";
import {
  decideAgentReply,
  SALES_AGENT_COLUMNS,
  SalesAgentRow,
  TranscriptMessage,
} from "../_shared/sales-agent.ts";
import { decryptCredential } from "../_shared/credentials.ts";
import { personalize, resolveFirstName } from "../_shared/personalize.ts";
import { generateDirectOpener } from "../_shared/direct-opener.ts";
import {
  type Attachment,
  instagramAttachmentType,
  readAttachment,
  signAttachment,
} from "../_shared/attachment.ts";

const GRAPH_API_BASE_URL = "https://graph.instagram.com/v26.0";

/* Short of the 150s free-plan wall clock, so progress is always written back. */
const RUN_BUDGET_MS = 100_000;

/*
  Rows claimed per tick.

  Sized against the CPU budget rather than the clock. An Edge Function gets two
  seconds of CPU — I/O does not count, but parsing, matching and building
  payloads does — and a tick that exceeds it is killed outright, leaving its
  claimed rows to sit until the claim expires. That is recoverable but slow, so
  the batch is deliberately smaller than a tick could theoretically manage.

  Fifty a minute is three thousand an hour: far above a thousand events a day
  even if every one of them arrives inside the same hour.
*/
const BATCH_SIZE = 50;

/* How many events are in flight at once. Kept low deliberately: the point is
   to stay well inside Meta's per-second limits while still draining a burst in
   minutes rather than hours. */
const CONCURRENCY = 4;

/*
  Meta allows 750 private replies per hour per account. Stopping at 700 leaves
  headroom for the public replies and profile lookups that share an account's
  budget, and for anything else the owner does by hand.
*/
const HOURLY_SEND_CAP = 700;

/* A row claimed but never finished — the worker died — is retried after this. */
/*
  A tick killed mid-batch leaves its rows claimed. Two minutes is long enough
  that a slow but living worker is never overtaken, and short enough that a
  dead one does not strand a burst for long.
*/
const CLAIM_TIMEOUT_MINUTES = 2;

const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface QueuedEvent {
  id: string;
  instagram_account_id: string;
  meta_event_id: string;
  trigger_type: TriggerType;
  sender_igsid: string | null;
  incoming_text: string;
  media_id: string | null;
  commenter_username: string | null;
  attempts: number;
  raw_event: Record<string, unknown>;
}

interface AccountRow {
  id: string;
  user_id: string;
  ig_user_id: string;
  username: string;
  access_token: string;
}

/**
 * Whether it is worth trying this event again.
 *
 * The distinction matters more than it looks. A closed inbox or an expired
 * messaging window will fail identically forever, and retrying burns the
 * account's hourly allowance on a delivery that cannot happen. A rate limit or
 * a network blip, by contrast, is exactly the case retries exist for.
 */
function isRetryable(error: unknown): boolean {
  const code = error instanceof InstagramApiError ? error.code : undefined;
  const subcode = error instanceof InstagramApiError ? error.subcode : undefined;
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // Rate limiting — the definitive retry case.
  if (code === 613 || code === 4 || code === 17 || code === 32) return true;
  if (text.includes("rate limit") || text.includes("too many")) return true;

  // Permanent: the recipient cannot be reached, now or later.
  if (
    code === 551 ||
    subcode === 2534022 ||
    subcode === 2534014 ||
    subcode === 2534025
  ) return false;
  if (text.includes("isn't available") || text.includes("cannot message")) return false;
  if (text.includes("outside of allowed window") || text.includes("24 hours")) return false;
  if (text.includes("already replied") || text.includes("already sent a private reply")) return false;
  if (text.includes("プライベート返信には無効なコメント")) return false;

  // Permanent until a human intervenes; retrying cannot fix a revoked token.
  if (code === 190 || text.includes("session has expired")) return false;
  if (text.includes("permission") || text.includes("not authorized")) return false;

  // Anything unrecognised — a 500, a timeout, a dropped connection — is worth
  // another go.
  return true;
}

/** Exponential, so a struggling account is not hammered every minute. */
function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), 1800);
}

/**
 * Meta throttling this account, as opposed to refusing this one message.
 *
 * Worth separating, because the response differs in kind: a rate limit applies
 * to everything the account is about to send, so the right move is to stop
 * sending for it entirely rather than to work through the rest of the batch
 * collecting the same rejection — which prolongs the penalty it caused.
 */
function isRateLimited(error: unknown): boolean {
  const code = error instanceof InstagramApiError ? error.code : undefined;
  if (code === 613 || code === 4 || code === 17 || code === 32) return true;

  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return text.includes("rate limit") || text.includes("too many");
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
  account: AccountRow,
  event: QueuedEvent,
  message: Record<string, unknown>,
): Promise<string> {
  if (event.trigger_type === "dm" && !event.sender_igsid) {
    throw new Error("Instagram sender ID is missing");
  }

  // A comment-triggered DM goes through the private-reply endpoint, the only
  // way to message someone who has not written first.
  const recipient = event.trigger_type === "comment"
    ? { comment_id: event.meta_event_id }
    : { id: event.sender_igsid };

  const data = await graphPost(
    `${GRAPH_API_BASE_URL}/${account.ig_user_id}/messages`,
    account.access_token,
    { recipient, message },
  );
  return String(data.message_id ?? "");
}

/**
 * Sends the lead magnet's file as a second Direct message.
 *
 * Second, and never first: Instagram cannot put text and a file in one
 * message, and the text carries the button that is the actual promise. So the
 * message that must arrive goes out on its own, and the file follows as an
 * improvement that is allowed to fail.
 *
 * It does fail, predictably, for comment triggers. A comment buys exactly one
 * private reply and nothing more — the reader has not written to us, so no
 * 24-hour window is open for a follow-up. The editor says so; here we simply
 * record what happened rather than pretending the delivery broke.
 */
async function sendInstagramAttachment(
  account: AccountRow,
  recipientIgsid: string,
  type: Attachment["type"],
  /* Either a reusable id Meta gave us earlier, or a fresh signed URL. */
  payload: { attachment_id: string } | { url: string; is_reusable: true },
): Promise<string> {
  const data = await graphPost(
    `${GRAPH_API_BASE_URL}/${account.ig_user_id}/messages`,
    account.access_token,
    {
      recipient: { id: recipientIgsid },
      message: { attachment: { type: instagramAttachmentType(type), payload } },
    },
  );

  // Present for Messenger; whether Instagram returns it is undocumented, so
  // the caller treats an empty string as "no cache this time".
  return String(data.attachment_id ?? "");
}

/**
 * Sends the file, uploading it to Meta at most once per account.
 *
 * The first delivery hands over a signed URL and keeps whatever reusable id
 * comes back; later ones send the id, so the file never leaves our storage
 * again. A cached id that Meta has since forgotten is dropped and the send
 * retried from the URL — one wasted call, rather than a rule that quietly
 * stops delivering its material.
 */
async function deliverAttachment(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  recipientIgsid: string,
  attachment: Attachment,
): Promise<void> {
  const { data: cached } = await supabase
    .from("instagram_attachment_cache")
    .select("id,attachment_id")
    .eq("instagram_account_id", account.id)
    .eq("attachment_path", attachment.path)
    .maybeSingle();

  if (cached?.attachment_id) {
    try {
      await sendInstagramAttachment(account, recipientIgsid, attachment.type, {
        attachment_id: cached.attachment_id as string,
      });

      await supabase
        .from("instagram_attachment_cache")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", cached.id);
      return;
    } catch (error) {
      console.warn(
        `Reusable attachment ${cached.attachment_id} was rejected, falling back to the file`,
        error,
      );
      await supabase.from("instagram_attachment_cache").delete().eq("id", cached.id);
    }
  }

  const signed = await signAttachment(supabase, attachment);
  if (!signed) throw new Error("файл не найден в хранилище");

  const attachmentId = await sendInstagramAttachment(
    account,
    recipientIgsid,
    attachment.type,
    { url: signed.url, is_reusable: true },
  );

  if (!attachmentId) return;

  /* Two events for the same rule can arrive in one batch and both miss the
     cache, so the write has to tolerate the other one getting there first. */
  await supabase
    .from("instagram_attachment_cache")
    .upsert(
      {
        instagram_account_id: account.id,
        attachment_path: attachment.path,
        attachment_id: attachmentId,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "instagram_account_id,attachment_path" },
    );
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

/* How long a cached profile is considered good enough. Names and avatars
   change rarely; an extra Graph call per incoming DM does not. */
const CONTACT_CACHE_DAYS = 7;

async function cacheContactProfile(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  senderIgsid: string,
): Promise<string | null> {
  /*
    A profile lookup is a Graph call, and at high message volume it doubles the
    API traffic for no new information — the same handful of people write
    repeatedly. A recent cache entry answers just as well.
  */
  const fresh = new Date(Date.now() - CONTACT_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabase
    .from("instagram_contacts")
    .select("username")
    .eq("instagram_account_id", account.id)
    .eq("sender_igsid", senderIgsid)
    .gte("updated_at", fresh)
    .maybeSingle();

  if (cached) return (cached.username as string) ?? null;

  try {
    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${senderIgsid}?fields=name,username,profile_pic`,
      { headers: { Authorization: `Bearer ${account.access_token}` } },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) return null;

    await supabase.from("instagram_contacts").upsert({
      instagram_account_id: account.id,
      sender_igsid: senderIgsid,
      username: data.username ?? null,
      display_name: data.name ?? null,
      profile_picture_url: data.profile_pic ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "instagram_account_id,sender_igsid" });

    return data.username ?? null;
  } catch (error) {
    console.warn("Instagram profile lookup failed", error);
    return null;
  }
}

/**
 * Runs the AI sales agent for one incoming Direct message.
 *
 * Returns true when it owned the outcome — replied, or deliberately stayed
 * silent and recorded why.
 */
async function runSalesAgent(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  event: QueuedEvent,
  finish: (patch: Record<string, unknown>) => Promise<unknown>,
): Promise<boolean> {
  const { data: agents } = await supabase
    .from("ai_sales_agents")
    .select(SALES_AGENT_COLUMNS)
    .eq("user_id", account.user_id)
    .eq("is_enabled", true)
    .or(`instagram_account_id.eq.${account.id},instagram_account_id.is.null`);

  const agent = (agents ?? []).sort((left, right) =>
    Number(Boolean(right.instagram_account_id)) - Number(Boolean(left.instagram_account_id))
  )[0] as SalesAgentRow | undefined;

  if (!agent) return false;

  const senderIgsid = event.sender_igsid!;

  const { data: history } = await supabase
    .from("ai_sales_messages")
    .select("role,content,handed_off")
    .eq("instagram_account_id", account.id)
    .eq("sender_igsid", senderIgsid)
    .order("created_at", { ascending: true })
    .limit(20);

  const transcript: TranscriptMessage[] = (history ?? []).map((row) => ({
    role: row.role as "user" | "agent",
    content: row.content as string,
  }));
  const alreadyHandedOff = (history ?? []).some((row) => row.handed_off);

  const apiKey = await deepSeekKeyFor(supabase, account.user_id);

  const decision = await decideAgentReply(
    agent,
    transcript,
    event.incoming_text,
    alreadyHandedOff,
    apiKey,
  );

  await supabase.from("ai_sales_messages").insert({
    instagram_account_id: account.id,
    sender_igsid: senderIgsid,
    role: "user",
    content: event.incoming_text,
    detected_intent: decision.intent,
  });

  if (!decision.reply) {
    await finish({
      status: "ignored",
      public_reply_status: "skipped",
      dm_status: "skipped",
      error_message: decision.skippedReason ?? null,
    });
    return true;
  }

  const messageId = await sendInstagramReply(account, event, { text: decision.reply });

  await supabase.from("ai_sales_messages").insert({
    instagram_account_id: account.id,
    sender_igsid: senderIgsid,
    role: "agent",
    content: decision.reply,
    detected_intent: decision.intent,
    handed_off: decision.handOff,
  });

  await finish({
    status: "sent",
    public_reply_status: "skipped",
    dm_status: "sent",
    response_message_id: messageId,
    error_message: decision.handOff ? "Диалог передан человеку" : null,
  });
  return true;
}

/**
 * Completes the experimental two-step path.
 *
 * The first private reply to a comment contains no link: it contains a Quick
 * Reply. Tapping it creates this user-authored DM and opens the normal 24-hour
 * window. Only then do we send the same attributed Telegram button the control
 * arm receives immediately.
 */
async function handleQuickReplyFollowup(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  event: QueuedEvent,
  finish: (patch: Record<string, unknown>) => Promise<unknown>,
): Promise<boolean> {
  if (event.trigger_type !== "dm" || !event.sender_igsid) return false;
  const parentId = quickReplyParentEventId(event.raw_event);
  if (!parentId) return false;

  const complete = async (patch: Record<string, unknown>) => {
    const result = await finish(patch) as { error?: { message?: string } | null };
    if (result?.error) {
      throw new Error(`Не удалось завершить Quick Reply: ${result.error.message ?? "ошибка базы данных"}`);
    }
  };

  /*
    A Graph API send cannot be rolled back. If recording status='sent' is
    temporarily blocked (for example, by an older uniqueness constraint),
    mark the webhook handled instead of retrying and sending the same DM again.
  */
  const completeDelivered = async (patch: Record<string, unknown>) => {
    const sent = await finish({ ...patch, status: "sent" }) as {
      error?: { message?: string } | null;
    };
    if (!sent?.error) return;

    const fallback = await finish({
      ...patch,
      status: "ignored",
      dm_status: "sent",
      error_message: `Direct доставлен; повтор заблокирован: ${sent.error.message ?? "ошибка фиксации статуса"}`,
    }) as { error?: { message?: string } | null };
    if (fallback?.error) {
      throw new Error(`Не удалось зафиксировать доставленный Quick Reply: ${fallback.error.message ?? "ошибка базы данных"}`);
    }
  };

  const clickedAt = new Date().toISOString();
  const parentColumns =
    "id,instagram_account_id,lead_magnet_id,sender_igsid,experiment_variant," +
    "experiment_conversion_event_id,experiment_clicked_at,experiment_converted_at";

  /*
    Claim the click before sending. Two taps can create two different webhook
    messages; only one of them may own the follow-up. A retry of the winning
    event keeps ownership and is allowed to try the Graph call again.
  */
  const { data: claimed } = await supabase
    .from("instagram_automation_events")
    .update({
      experiment_conversion_event_id: event.id,
      experiment_clicked_at: clickedAt,
    })
    .eq("id", parentId)
    .eq("instagram_account_id", account.id)
    .eq("sender_igsid", event.sender_igsid)
    .eq("experiment_variant", "quick_reply")
    .is("experiment_conversion_event_id", null)
    .select(parentColumns)
    .maybeSingle();

  let parent = claimed;
  if (!parent) {
    const { data: existing } = await supabase
      .from("instagram_automation_events")
      .select(parentColumns)
      .eq("id", parentId)
      .eq("instagram_account_id", account.id)
      .eq("sender_igsid", event.sender_igsid)
      .eq("experiment_variant", "quick_reply")
      .maybeSingle();

    if (!existing) {
      await complete({
        status: "ignored",
        public_reply_status: "skipped",
        dm_status: "skipped",
        error_message: "Quick Reply не относится к активному A/B-событию",
      });
      return true;
    }

    if (existing.experiment_conversion_event_id !== event.id) {
      await complete({
        lead_magnet_id: existing.lead_magnet_id,
        experiment_variant: "quick_reply",
        experiment_parent_event_id: existing.id,
        status: "ignored",
        public_reply_status: "skipped",
        dm_status: "skipped",
        error_message: "Quick Reply уже обработан",
      });
      return true;
    }

    // The message was already accepted by Instagram. A previous attempt may
    // have failed only while saving the child event, so never call Graph again.
    if (existing.experiment_converted_at) {
      await completeDelivered({
        lead_magnet_id: existing.lead_magnet_id,
        experiment_variant: "quick_reply",
        experiment_parent_event_id: existing.id,
        public_reply_status: "skipped",
        dm_status: "sent",
        error_message: null,
      });
      return true;
    }
    parent = existing;
  }

  if (!parent.lead_magnet_id) {
    await complete({
      experiment_variant: "quick_reply",
      experiment_parent_event_id: parent.id,
      status: "failed",
      public_reply_status: "skipped",
      dm_status: "failed",
      error_message: "У A/B-события больше нет связанной воронки",
    });
    return true;
  }

  const { data: rule, error: ruleError } = await supabase
    .from("lead_magnets")
    .select(LEAD_MAGNET_COLUMNS)
    .eq("id", parent.lead_magnet_id)
    .eq("user_id", account.user_id)
    .maybeSingle();

  if (ruleError || !rule) {
    await complete({
      lead_magnet_id: parent.lead_magnet_id,
      experiment_variant: "quick_reply",
      experiment_parent_event_id: parent.id,
      status: "failed",
      public_reply_status: "skipped",
      dm_status: "failed",
      error_message: ruleError?.message ?? "Воронка A/B-теста не найдена",
    });
    return true;
  }

  const leadMagnet = rule as LeadMagnetRow;
  const directReply = quickReplyFollowup(leadMagnet);
  let messageId: string;

  try {
    messageId = await sendInstagramReply(
      account,
      event,
      buildDirectMessage(leadMagnet, directReply, parent.id),
    );
  } catch (error) {
    if (isRetryable(error) && event.attempts < MAX_ATTEMPTS) throw error;
    await complete({
      lead_magnet_id: leadMagnet.id,
      experiment_variant: "quick_reply",
      experiment_parent_event_id: parent.id,
      status: "failed",
      public_reply_status: "skipped",
      dm_status: "failed",
      error_message: describeInstagramError(error),
    });
    return true;
  }

  await supabase.from("ai_sales_messages").insert([
    {
      instagram_account_id: account.id,
      sender_igsid: event.sender_igsid,
      role: "user",
      content: event.incoming_text,
      detected_intent: "lead_magnet",
    },
    {
      instagram_account_id: account.id,
      sender_igsid: event.sender_igsid,
      role: "agent",
      content: directReply.text,
      detected_intent: "lead_magnet",
    },
  ]);

  let attachmentError = "";
  const attachment = readAttachment(leadMagnet);
  if (attachment) {
    try {
      await deliverAttachment(supabase, account, event.sender_igsid, attachment);
    } catch (error) {
      attachmentError = describeInstagramError(error);
    }
  }

  const convertedAt = new Date().toISOString();
  const { error: conversionError } = await supabase
    .from("instagram_automation_events")
    .update({ experiment_converted_at: convertedAt })
    .eq("id", parent.id)
    .eq("experiment_conversion_event_id", event.id);

  await completeDelivered({
    lead_magnet_id: leadMagnet.id,
    experiment_variant: "quick_reply",
    experiment_parent_event_id: parent.id,
    public_reply_status: "skipped",
    dm_status: "sent",
    response_message_id: messageId,
    error_message: conversionError
      ? `Direct доставлен; конверсия не записана: ${conversionError.message}`
      : attachmentError
        ? `Direct доставлен, но файл не отправлен: ${attachmentError}`
        : null,
  });
  return true;
}

/** Processes one claimed event. Throws only for retryable failures. */
/**
 * The commenter's first name, when Instagram's profile gives one worth using.
 *
 * Read from `instagram_contacts` first: the same people comment under post
 * after post, and a Graph call per comment would add a round trip to every
 * delivery for a value that does not change. A miss is fetched once and cached
 * for everyone after.
 *
 * Never throws. A greeting is a nicety; failing to look one up must not cost
 * the delivery it was meant to decorate.
 */
/**
 * The user's DeepSeek key, decrypted, or null when there is nothing usable.
 *
 * Both the sales agent and the personalised opener need it, and neither may
 * fall over because a key is missing or a decrypt fails — each has its own
 * silent fallback. So the failure is swallowed here once rather than twice.
 */
async function deepSeekKeyFor(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data: credential } = await supabase
    .from("user_ai_credentials")
    .select("deepseek_api_key_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  if (!credential?.deepseek_api_key_encrypted) return null;

  try {
    return await decryptCredential(credential.deepseek_api_key_encrypted as string);
  } catch (error) {
    console.error("Could not decrypt DeepSeek credential", error);
    return null;
  }
}

async function resolveCommenterName(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  senderIgsid: string | null,
): Promise<string | null> {
  if (!senderIgsid) return null;

  try {
    const { data: cached } = await supabase
      .from("instagram_contacts")
      .select("display_name,username")
      .eq("instagram_account_id", account.id)
      .eq("sender_igsid", senderIgsid)
      .maybeSingle();

    if (cached) {
      return resolveFirstName(
        cached.display_name as string | null,
        cached.username as string | null,
      );
    }

    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${senderIgsid}?fields=name,username,profile_pic`,
      { headers: { Authorization: `Bearer ${account.access_token}` } },
    );
    const profile = await response.json().catch(() => null);
    if (!response.ok || profile?.error) return null;

    await supabase.from("instagram_contacts").upsert({
      instagram_account_id: account.id,
      sender_igsid: senderIgsid,
      username: profile?.username ?? null,
      display_name: profile?.name ?? null,
      profile_picture_url: profile?.profile_pic ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "instagram_account_id,sender_igsid" });

    return resolveFirstName(profile?.name ?? null, profile?.username ?? null);
  } catch (error) {
    console.error("Could not resolve commenter name", error);
    return null;
  }
}

async function processEvent(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  event: QueuedEvent,
  leadMagnets: LeadMagnetRow[],
): Promise<void> {
  const finish = (patch: Record<string, unknown>) =>
    supabase
      .from("instagram_automation_events")
      .update({ ...patch, processed_at: new Date().toISOString(), claimed_at: null })
      .eq("id", event.id);

  if (event.trigger_type === "dm" && event.sender_igsid) {
    const username = await cacheContactProfile(supabase, account, event.sender_igsid);
    if (username) event.commenter_username = username;
  }

  if (await handleQuickReplyFollowup(supabase, account, event, finish)) return;

  const match = selectLeadMagnet(leadMagnets, {
    triggerType: event.trigger_type,
    text: event.incoming_text,
    mediaId: event.media_id ?? undefined,
  });

  if (!match) {
    /*
      No keyword rule matched. The AI sales agent gets a turn before we give up,
      but only on Direct messages: a comment may be answered privately exactly
      once, and spending that single allowance on an open-ended chat reply would
      burn it for the lead magnet the person may be about to ask for.
    */
    if (event.trigger_type === "dm" && event.sender_igsid) {
      const handled = await runSalesAgent(supabase, account, event, finish);
      if (handled) return;
    }

    await finish({ status: "ignored", public_reply_status: "skipped", dm_status: "skipped" });
    return;
  }

  const matched = match.leadMagnet;

  // Keyword replies belong to the Direct thread too, so the CRM shows one
  // coherent conversation rather than only the agent's half.
  if (event.trigger_type === "dm" && event.sender_igsid) {
    await supabase.from("ai_sales_messages").insert({
      instagram_account_id: account.id,
      sender_igsid: event.sender_igsid,
      role: "user",
      content: event.incoming_text,
      detected_intent: "lead_magnet",
    });
  }

  if (event.sender_igsid && matched.repeat_delay_hours > 0) {
    const cutoff = new Date(Date.now() - matched.repeat_delay_hours * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("instagram_automation_events")
      .select("id", { count: "exact", head: true })
      .eq("lead_magnet_id", matched.id)
      .eq("sender_igsid", event.sender_igsid)
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

  const experimentVariant = event.trigger_type === "comment" && event.sender_igsid
    ? selectCommentExperimentVariant(matched, event.sender_igsid)
    : null;

  /*
    The Direct message is the promise; the public comment merely announces it.
    Sending the announcement first would publicly claim a delivery that may
    never happen, so the DM goes out first and gates everything else.
  */
  let directReply = pickDirectReply(matched);
  let messageId: string;

  /*
    The model rewrites the wording, never the delivery: the button, the link
    and the attachment are still assembled by buildDirectMessage from the same
    reply. A null here — no key, a timeout, a refusal — simply leaves the
    prepared variant in place, so the material goes out either way.

    Only the plain variant is rewritten. The quick-reply and profile-link arms
    of the experiment carry wording of their own, and rewriting them would
    measure the model instead of the arm.
  */
  if (matched.direct_ai_personalize && experimentVariant !== "quick_reply" && experimentVariant !== "profile_link") {
    const firstName = await resolveCommenterName(supabase, account, event.sender_igsid);
    const written = await generateDirectOpener(await deepSeekKeyFor(supabase, account.user_id), {
      title: matched.title,
      description: matched.description ?? "",
      examples: matched.direct_reply_variants ?? [],
      name: firstName,
      comment: event.incoming_text ?? "",
    });
    if (written) directReply = { ...directReply, text: written };
  }

  try {
    messageId = await sendInstagramReply(
      account,
      event,
      experimentVariant === "quick_reply"
        ? buildQuickReplyMessage(matched, event.id)
        : experimentVariant === "profile_link"
        ? buildProfileLinkMessage(matched)
        : buildDirectMessage(matched, directReply, event.id),
    );
  } catch (error) {
    if (isRetryable(error) && event.attempts < MAX_ATTEMPTS) throw error;

    await finish({
      lead_magnet_id: matched.id,
      status: "failed",
      public_reply_status: "skipped",
      dm_status: "failed",
      experiment_variant: experimentVariant,
      error_message: describeInstagramError(error),
    });
    return;
  }

  if (event.trigger_type === "dm" && event.sender_igsid) {
    await supabase.from("ai_sales_messages").insert({
      instagram_account_id: account.id,
      sender_igsid: event.sender_igsid,
      role: "agent",
      content: directReply.text,
      detected_intent: "lead_magnet",
    });
  }

  /*
    The file, if the rule has one. Signed now and used immediately; Meta
    fetches it while the call is open.
  */
  let attachmentError = "";
  const attachment = readAttachment(matched);

  if (
    attachment &&
    event.sender_igsid &&
    (event.trigger_type === "dm" || experimentVariant === "control")
  ) {
    try {
      await deliverAttachment(supabase, account, event.sender_igsid, attachment);
    } catch (error) {
      attachmentError = describeInstagramError(error);
    }
  } else if (attachment && !event.sender_igsid) {
    attachmentError = "Instagram не сообщил отправителя, файл отправить некому";
  }

  let publicReplyStatus = "skipped";
  let publicReplyId = "";
  let publicReplyError = "";

  if (event.trigger_type === "comment" && matched.public_reply_enabled) {
    try {
      /*
        Looked up only now, after the Direct has landed. The name changes how
        the announcement reads, never whether the material is delivered, so it
        must not sit on the path of the thing that matters.
      */
      const firstName = await resolveCommenterName(supabase, account, event.sender_igsid);

      publicReplyId = await sendPublicCommentReply(
        event.meta_event_id,
        account.access_token,
        personalize(
          experimentVariant === "quick_reply"
            ? "Отправил в Direct 🙌 Нажмите кнопку в сообщении, чтобы получить материал."
            : pickPublicReply(matched),
          firstName,
        ),
      );
      publicReplyStatus = "sent";
    } catch (error) {
      // The Direct message already landed, which is the part that matters. A
      // failed announcement is recorded, never retried — a retry would resend
      // the DM too.
      publicReplyStatus = "failed";
      publicReplyError = describeInstagramError(error);
    }
  }

  /* Both are notes on a delivery that succeeded, so they are reported
     together rather than one overwriting the other. */
  const notes = [
    publicReplyError ? `публичный ответ не отправлен: ${publicReplyError}` : "",
    attachmentError ? `файл не отправлен: ${attachmentError}` : "",
  ].filter(Boolean);

  await finish({
    lead_magnet_id: matched.id,
    experiment_variant: experimentVariant,
    status: "sent",
    public_reply_status: publicReplyStatus,
    public_reply_id: publicReplyId || null,
    dm_status: "sent",
    response_message_id: messageId,
    error_message: notes.length ? `Direct доставлен, но ${notes.join("; ")}` : null,
  });
}

/** Marks an event for another attempt, or gives up after enough of them. */
async function deferOrFail(
  supabase: ReturnType<typeof createAdminClient>,
  event: QueuedEvent,
  error: unknown,
): Promise<void> {
  // The claim already incremented the counter, so this is the attempt that
  // just failed.
  const attempts = event.attempts;
  const message = describeInstagramError(error);

  if (attempts >= MAX_ATTEMPTS) {
    await supabase
      .from("instagram_automation_events")
      .update({
        status: "failed",
        dm_status: "failed",
        error_message: `${message} (после ${attempts} попыток)`,
        processed_at: new Date().toISOString(),
        claimed_at: null,
      })
      .eq("id", event.id);
    return;
  }

  await supabase
    .from("instagram_automation_events")
    .update({
      claimed_at: null,
      error_message: message,
      next_attempt_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
    })
    .eq("id", event.id);
}

Deno.serve(async (req: Request) => {
  if (!await hasValidCronSecret(req)) {
    return jsonResponse({ error: "Cron authentication required" }, 401);
  }

  const supabase = createAdminClient();
  const deadline = Date.now() + RUN_BUDGET_MS;

  /*
    One statement, via FOR UPDATE SKIP LOCKED: rows are claimed and their
    attempt counter incremented atomically, so two overlapping ticks can never
    take the same event. A worker that dies mid-event leaves a stale claim,
    which the timeout releases for a later tick.
  */
  const { data: claimed, error: claimError } = await supabase.rpc("claim_instagram_events", {
    batch_size: BATCH_SIZE,
    claim_timeout: `${CLAIM_TIMEOUT_MINUTES} minutes`,
  });

  if (claimError) return jsonResponse({ error: claimError.message }, 500);

  const events = (claimed ?? []) as unknown as QueuedEvent[];
  if (events.length === 0) return jsonResponse({ claimed: 0 });

  // Accounts are loaded once, not per event.
  const accountIds = [...new Set(events.map((event) => event.instagram_account_id))];
  const { data: accountRows } = await supabase
    .from("instagram_accounts")
    .select("id,user_id,ig_user_id,username,access_token,is_active")
    .in("id", accountIds);

  const accounts = new Map<string, AccountRow>();
  for (const row of accountRows ?? []) {
    if (row.is_active) accounts.set(row.id as string, row as AccountRow);
  }

  /*
    Per-account budget for this hour. Checked once per tick rather than per
    event: a spike that would blow through Meta's limit is deferred here, so
    the account never earns a rate-limit penalty in the first place.
  */
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const remaining = new Map<string, number>();

  for (const accountId of accountIds) {
    const { count } = await supabase
      .from("instagram_automation_events")
      .select("id", { count: "exact", head: true })
      .eq("instagram_account_id", accountId)
      .eq("status", "sent")
      /*
        Counted by when the reply went out, not when the comment arrived. Meta
        limits sends per hour, and once a backlog forms the two stop agreeing:
        an event received two hours ago and answered a minute ago is a send
        that happened just now. Counting by `created_at` would leave it out,
        understate the hour, and let the account sail past the limit exactly
        during the burst the cap exists to survive.
      */
      .gte("processed_at", hourAgo);
    remaining.set(accountId, Math.max(HOURLY_SEND_CAP - (count ?? 0), 0));
  }

  /*
    Rules are the same for every event belonging to an account, so they are
    fetched once per tick rather than once per event. At fifty events that is
    one query instead of fifty, and the saving grows with the batch.
  */
  const rulesByAccount = new Map<string, LeadMagnetRow[]>();
  for (const account of accounts.values()) {
    const { data } = await supabase
      .from("lead_magnets")
      .select(LEAD_MAGNET_COLUMNS)
      .eq("user_id", account.user_id)
      .eq("is_active", true)
      .or(`instagram_account_id.eq.${account.id},instagram_account_id.is.null`);
    rulesByAccount.set(account.id, (data ?? []) as LeadMagnetRow[]);
  }

  let processed = 0;
  let deferred = 0;
  let throttled = 0;

  /* Accounts Meta is currently throttling. Nothing more is sent for them this
     tick; their events go back to the queue with the hour's cooldown. */
  const rateLimited = new Set<string>();

  for (let index = 0; index < events.length; index += CONCURRENCY) {
    if (Date.now() >= deadline) break;

    const slice = events.slice(index, index + CONCURRENCY);

    await Promise.all(slice.map(async (event) => {
      const account = accounts.get(event.instagram_account_id);

      if (!account) {
        await supabase
          .from("instagram_automation_events")
          .update({
            status: "ignored",
            error_message: "Аккаунт Instagram отключён",
            processed_at: new Date().toISOString(),
            claimed_at: null,
          })
          .eq("id", event.id);
        return;
      }

      const budget = remaining.get(account.id) ?? 0;
      const stopped = rateLimited.has(account.id);

      if (stopped || budget <= 0) {
        // Pushed past the hour boundary, where both the budget and Meta's own
        // window refill.
        await supabase
          .from("instagram_automation_events")
          .update({
            claimed_at: null,
            next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            error_message: stopped
              ? "Instagram ограничил частоту — отложено до следующего окна"
              : "Достигнут часовой лимит отправок — отложено",
          })
          .eq("id", event.id);
        throttled++;
        return;
      }

      remaining.set(account.id, budget - 1);

      try {
        await processEvent(supabase, account, event, rulesByAccount.get(account.id) ?? []);
        processed++;
      } catch (error) {
        console.error(`Instagram event ${event.id} failed`, error);

        /*
          One rate-limit answer speaks for the whole account, so the rest of
          its batch is stood down rather than sent into the same wall. Working
          through them would earn nothing but a longer penalty.
        */
        if (isRateLimited(error)) rateLimited.add(account.id);

        await deferOrFail(supabase, event, error);
        deferred++;
      }
    }));

    // A breath between batches, so a burst never looks like a flood to Meta.
    await sleep(250);
  }

  return jsonResponse({ claimed: events.length, processed, deferred, throttled });
});
