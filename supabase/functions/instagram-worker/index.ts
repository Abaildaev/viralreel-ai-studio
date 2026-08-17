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
  buildDirectMessage,
  buildReplyText,
  LEAD_MAGNET_COLUMNS,
  LeadMagnetRow,
  pickPublicReply,
  selectLeadMagnet,
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

const GRAPH_API_BASE_URL = "https://graph.instagram.com/v26.0";

/* Short of the 150s free-plan wall clock, so progress is always written back. */
const RUN_BUDGET_MS = 100_000;

/* Rows claimed per tick. Comfortably above 1000 events a day even if they all
   arrive in one hour. */
const BATCH_SIZE = 120;

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
const CLAIM_TIMEOUT_MINUTES = 5;

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
  if (code === 551 || subcode === 2534022 || subcode === 2534014) return false;
  if (text.includes("isn't available") || text.includes("cannot message")) return false;
  if (text.includes("outside of allowed window") || text.includes("24 hours")) return false;
  if (text.includes("already replied") || text.includes("already sent a private reply")) return false;

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

async function cacheContactProfile(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  senderIgsid: string,
): Promise<string | null> {
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

  const { data: credential } = await supabase
    .from("user_ai_credentials")
    .select("deepseek_api_key_encrypted")
    .eq("user_id", account.user_id)
    .maybeSingle();

  let apiKey: string | null = null;
  if (credential?.deepseek_api_key_encrypted) {
    try {
      apiKey = await decryptCredential(credential.deepseek_api_key_encrypted);
    } catch (error) {
      console.error("Could not decrypt DeepSeek credential", error);
    }
  }

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

/** Processes one claimed event. Throws only for retryable failures. */
async function processEvent(
  supabase: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  event: QueuedEvent,
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

  const { data: leadMagnets, error: leadMagnetError } = await supabase
    .from("lead_magnets")
    .select(LEAD_MAGNET_COLUMNS)
    .eq("user_id", account.user_id)
    .eq("is_active", true)
    .or(`instagram_account_id.eq.${account.id},instagram_account_id.is.null`);

  if (leadMagnetError) throw leadMagnetError;

  const match = selectLeadMagnet((leadMagnets ?? []) as LeadMagnetRow[], {
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

  /*
    The Direct message is the promise; the public comment merely announces it.
    Sending the announcement first would publicly claim a delivery that may
    never happen, so the DM goes out first and gates everything else.
  */
  const directReplyText = buildReplyText(matched);
  let messageId: string;

  try {
    messageId = await sendInstagramReply(
      account,
      event,
      buildDirectMessage(matched, directReplyText),
    );
  } catch (error) {
    if (isRetryable(error) && event.attempts < MAX_ATTEMPTS) throw error;

    await finish({
      lead_magnet_id: matched.id,
      status: "failed",
      public_reply_status: "skipped",
      dm_status: "failed",
      error_message: describeInstagramError(error),
    });
    return;
  }

  if (event.trigger_type === "dm" && event.sender_igsid) {
    await supabase.from("ai_sales_messages").insert({
      instagram_account_id: account.id,
      sender_igsid: event.sender_igsid,
      role: "agent",
      content: directReplyText,
      detected_intent: "lead_magnet",
    });
  }

  let publicReplyStatus = "skipped";
  let publicReplyId = "";
  let publicReplyError = "";

  if (event.trigger_type === "comment" && matched.public_reply_enabled) {
    try {
      publicReplyId = await sendPublicCommentReply(
        event.meta_event_id,
        account.access_token,
        pickPublicReply(matched),
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

  await finish({
    lead_magnet_id: matched.id,
    status: "sent",
    public_reply_status: publicReplyStatus,
    public_reply_id: publicReplyId || null,
    dm_status: "sent",
    response_message_id: messageId,
    error_message: publicReplyError
      ? `Direct доставлен, но публичный ответ не отправлен: ${publicReplyError}`
      : null,
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
      .gte("created_at", hourAgo);
    remaining.set(accountId, Math.max(HOURLY_SEND_CAP - (count ?? 0), 0));
  }

  let processed = 0;
  let deferred = 0;
  let throttled = 0;

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
      if (budget <= 0) {
        // Pushed past the hour boundary, where the budget refills.
        await supabase
          .from("instagram_automation_events")
          .update({
            claimed_at: null,
            next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            error_message: "Достигнут часовой лимит отправок — отложено",
          })
          .eq("id", event.id);
        throttled++;
        return;
      }

      remaining.set(account.id, budget - 1);

      try {
        await processEvent(supabase, account, event);
        processed++;
      } catch (error) {
        console.error(`Instagram event ${event.id} failed`, error);
        await deferOrFail(supabase, event, error);
        deferred++;
      }
    }));

    // A breath between batches, so a burst never looks like a flood to Meta.
    await sleep(250);
  }

  return jsonResponse({ claimed: events.length, processed, deferred, throttled });
});
