/*
  The Telegram side of the funnel.

  A person taps the button in the Instagram Direct message, lands on
  `t.me/<bot>?start=<slug>_<automation_event_id>`, and this function runs the
  scenario the owner configured: greet, optionally gate on a channel
  subscription, hand over the material, then make the second ask.

  The payload is what makes the two halves one product. Without it a Telegram
  subscriber is an anonymous arrival; with it, every subscriber is traceable to
  the codeword and the Reel that produced them.
*/

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/auth.ts";
import { secretEquals } from "../_shared/crypto.ts";
import { decryptCredential } from "../_shared/credentials.ts";
import {
  isChannelMember,
  sendMessage,
  SUBSCRIBED_STATUSES,
  TelegramApiError,
  callTelegram,
} from "../_shared/telegram-api.ts";
import { parseStartPayload } from "../_shared/start-payload.ts";
import {
  hasConfirmedChannelMembership,
  planSubscriberStart,
  shouldReplayImmediateSteps,
} from "../_shared/subscriber-state.ts";
import { clearBotFault, reportBotFault } from "../_shared/bot-health.ts";
import { advanceSequence } from "../_shared/step-sender.ts";
import {
  type AttachmentColumns,
  ATTACHMENT_COLUMNS,
  type PreparedTelegramAttachment,
  prepareTelegramRowAttachment,
} from "../_shared/attachment.ts";

interface BotRow {
  id: string;
  user_id: string;
  bot_token_encrypted: string;
  webhook_secret: string;
  channel_id: string;
  channel_username: string;
  channel_invite_url: string;
  is_active: boolean;
  health_alert_at: string | null;
}

const BOT_COLUMNS =
  "id,user_id,bot_token_encrypted,webhook_secret,channel_id,channel_username," +
  "channel_invite_url,is_active,health_alert_at";

interface FunnelRow extends AttachmentColumns {
  id: string;
  user_id: string;
  telegram_bot_id: string;
  slug: string;
  welcome_text: string;
  require_subscription: boolean;
  subscribe_button_text: string;
  check_button_text: string;
  not_subscribed_text: string;
  /* Everything the funnel sends now lives in telegram_funnel_steps. */
  is_default: boolean;
}

const FUNNEL_COLUMNS =
  "id,user_id,telegram_bot_id,slug,welcome_text,require_subscription,subscribe_button_text," +
  "check_button_text,not_subscribed_text,is_default," + ATTACHMENT_COLUMNS;

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  language_code?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Resolves the attribution payload to an event this bot's owner actually owns.
 *
 * A start payload is public — anyone can type one. Without this check a
 * stranger could paste someone else's event id and attach their subscriber to
 * another tenant's campaign, quietly corrupting the analytics that the whole
 * feature exists to produce.
 */
async function resolveAttribution(
  supabase: ReturnType<typeof createAdminClient>,
  bot: BotRow,
  eventId: string | null,
): Promise<{ eventId: string | null; senderIgsid: string | null }> {
  if (!eventId) return { eventId: null, senderIgsid: null };

  const { data } = await supabase
    .from("instagram_automation_events")
    .select("id,sender_igsid,instagram_accounts!inner(user_id)")
    .eq("id", eventId)
    .maybeSingle();

  const owner = (data as any)?.instagram_accounts?.user_id;
  if (!data || owner !== bot.user_id) return { eventId: null, senderIgsid: null };

  return { eventId: data.id as string, senderIgsid: (data.sender_igsid as string) ?? null };
}

function channelUrl(bot: BotRow): string {
  if (bot.channel_invite_url) return bot.channel_invite_url;
  if (bot.channel_username) return `https://t.me/${bot.channel_username.replace(/^@/, "")}`;
  return "";
}

async function selectFunnel(
  supabase: ReturnType<typeof createAdminClient>,
  bot: BotRow,
  slug: string,
): Promise<FunnelRow | null> {
  if (slug) {
    const { data } = await supabase
      .from("telegram_funnels")
      .select(FUNNEL_COLUMNS)
      .eq("telegram_bot_id", bot.id)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data as FunnelRow;
  }

  // A bare /start, an unknown slug, or a funnel that was switched off since the
  // link went out — all land on the default rather than on silence.
  const { data: fallback } = await supabase
    .from("telegram_funnels")
    .select(FUNNEL_COLUMNS)
    .eq("telegram_bot_id", bot.id)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  return (fallback?.[0] as FunnelRow) ?? null;
}

/**
 * Starts the funnel's sequence.
 *
 * Everything after the subscription gate is now a list of steps, so this only
 * marks the gate cleared and hands over to the shared sender — which posts the
 * immediate steps and schedules the first delayed one. The drip worker takes
 * it from there, possibly days later.
 */
async function deliver(
  supabase: ReturnType<typeof createAdminClient>,
  botToken: string,
  funnel: FunnelRow,
  subscriber: { id: string; telegram_user_id: string; telegram_bot_id: string },
  options: {
    leadingAttachment?: PreparedTelegramAttachment | null;
    replayImmediate?: boolean;
  } = {},
): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from("telegram_subscribers")
    .update({ subscribed_at: now, updated_at: now })
    .eq("id", subscriber.id)
    .is("subscribed_at", null);

  // Below every position, so the plan starts from the first step.
  const result = await advanceSequence(supabase, botToken, subscriber, funnel.id, 0, options);

  /* A file-only funnel with no immediate step is still valid. Most funnels
     merge the cover into step one, but this fallback prevents an empty start. */
  if (options.leadingAttachment && result.sent === 0) {
    await sendMessage(botToken, {
      chatId: subscriber.telegram_user_id,
      text: "",
      attachment: options.leadingAttachment,
    });
  }
}

/**
 * Asks for the subscription. Channel updates unlock the material automatically.
 *
 * Carries the funnel's picture when no greeting went out ahead of it, because
 * then this is the first thing the reader sees and a funnel that opens on a
 * wall of text converts worse than one that opens on the thing being promised.
 * Copy inside Telegram's 1024-character caption stays a single captioned
 * message, button included; `sendMessage` splits anything longer on its own.
 */
async function promptForSubscription(
  botToken: string,
  bot: BotRow,
  funnel: FunnelRow,
  chatId: number,
  text: string,
  attachment: PreparedTelegramAttachment | null = null,
): Promise<void> {
  await sendMessage(botToken, {
    chatId,
    text,
    buttons: [{ text: funnel.subscribe_button_text, url: channelUrl(bot) }],
    attachment,
  });
}

async function handleStart(
  supabase: ReturnType<typeof createAdminClient>,
  bot: BotRow,
  botToken: string,
  from: TelegramUser,
  chatId: number,
  payload: string,
): Promise<void> {
  const { slug, eventId } = parseStartPayload(payload);
  const funnel = await selectFunnel(supabase, bot, slug);
  if (!funnel) {
    console.warn(`Bot ${bot.id} has no active funnel to answer /start`);
    return;
  }

  const attribution = await resolveAttribution(supabase, bot, eventId);
  const now = new Date().toISOString();

  /*
    Returning visitors keep their original attribution: the first campaign that
    brought them is the one that earned them, and overwriting it on a second
    /start would quietly move credit to whichever link they happened to reopen.
  */
  const { data: existing } = await supabase
    .from("telegram_subscribers")
    .select("id,automation_event_id,funnel_id,subscribed_at,channel_left_at")
    .eq("telegram_bot_id", bot.id)
    .eq("telegram_user_id", String(from.id))
    .maybeSingle();

  let subscriberId: string;

  if (existing) {
    subscriberId = existing.id as string;

    /* Which funnel they are in moves to the one they just opened; where they
       came from stays with the campaign that earned them. See the module for
       why those two pull in opposite directions. */
    await supabase
      .from("telegram_subscribers")
      .update({
        username: from.username ?? "",
        first_name: from.first_name ?? "",
        is_blocked: false,
        unsubscribed_at: null,
        last_message_at: now,
        updated_at: now,
        ...planSubscriberStart(existing, funnel.id, attribution),
      })
      .eq("id", subscriberId);
  } else {
    const { data: created, error } = await supabase
      .from("telegram_subscribers")
      .insert({
        user_id: bot.user_id,
        telegram_bot_id: bot.id,
        funnel_id: funnel.id,
        automation_event_id: attribution.eventId,
        instagram_sender_igsid: attribution.senderIgsid,
        telegram_user_id: String(from.id),
        username: from.username ?? "",
        first_name: from.first_name ?? "",
        language_code: from.language_code ?? "",
        source: attribution.eventId ? "instagram" : "link",
        started_at: now,
        last_message_at: now,
      })
      .select("id")
      .single();

    if (error) throw error;
    subscriberId = created.id as string;
  }

  const subscriber = {
    id: subscriberId,
    telegram_user_id: String(from.id),
    telegram_bot_id: bot.id,
  };

  const gated = funnel.require_subscription && Boolean(bot.channel_id) && Boolean(channelUrl(bot));

  /*
    Membership is settled before a single word goes out, because the answer
    decides which message carries the funnel's picture. Checking it later, as
    this once did, forced the greeting to be sent blind — and a funnel whose
    greeting is empty then had nowhere to put the picture at all.

    A fault here means nobody is getting through, not that this person declined
    to subscribe. Tell the owner, then still show the prompt — if the rights
    come back the reader's own button will work without them starting over.
  */
  let subscribed = true;
  const confirmedMembership = hasConfirmedChannelMembership(existing);

  if (gated && !confirmedMembership) {
    const membership = await isChannelMember(botToken, bot.channel_id, String(from.id));

    if (membership.fault) {
      await reportBotFault(supabase, bot, `Не удалось проверить подписку на канал: ${membership.fault}`);
    } else {
      await clearBotFault(supabase, bot.id);
    }

    subscribed = membership.subscribed;
  } else if (gated) {
    /* Telegram already confirmed this reader and chat_member records a later
       departure. Avoid a slow network round trip before every repeat /start. */
    subscribed = true;
  }

  const gateComing = gated && !subscribed;

  /*
    The funnel's file rides on the first message the reader sees — usually the
    photo of the thing being promised, which is worth showing before the gate
    has a chance to lose them. That is the greeting when there is one, and the
    subscription request when there is not: an author who folded both into a
    single opening message should not lose the picture for it.

    Only when neither will carry it does the file need a message of its own; a
    file with no words is a valid greeting.
  */
  const attachment = await prepareTelegramRowAttachment(supabase, bot.id, funnel);
  const greeting = funnel.welcome_text.trim();

  if (greeting) {
    await sendMessage(botToken, {
      chatId,
      text: funnel.welcome_text,
      attachment,
    });
  }

  if (!gateComing) {
    await deliver(supabase, botToken, funnel, subscriber, {
      leadingAttachment: greeting ? null : attachment,
      replayImmediate: shouldReplayImmediateSteps(existing, funnel.id),
    });
    return;
  }

  await promptForSubscription(
    botToken,
    bot,
    funnel,
    chatId,
    funnel.not_subscribed_text.trim() ||
      "Подпишитесь на канал, и я сразу пришлю материал 👇",
    greeting ? null : attachment,
  );
}

async function handleSubscriptionCheck(
  supabase: ReturnType<typeof createAdminClient>,
  bot: BotRow,
  botToken: string,
  callbackId: string,
  funnelId: string,
  from: TelegramUser,
  chatId: number,
): Promise<void> {
  const { data: funnel } = await supabase
    .from("telegram_funnels")
    .select(FUNNEL_COLUMNS)
    .eq("id", funnelId)
    .eq("telegram_bot_id", bot.id)
    .maybeSingle();

  const { data: subscriber } = await supabase
    .from("telegram_subscribers")
    .select("id,telegram_user_id,telegram_bot_id")
    .eq("telegram_bot_id", bot.id)
    .eq("telegram_user_id", String(from.id))
    .maybeSingle();

  if (!funnel || !subscriber) {
    await callTelegram(botToken, "answerCallbackQuery", { callback_query_id: callbackId });
    return;
  }

  const membership = await isChannelMember(botToken, bot.channel_id, String(from.id));
  if (membership.fault) {
    await reportBotFault(supabase, bot, `Не удалось проверить подписку на канал: ${membership.fault}`);
  } else {
    await clearBotFault(supabase, bot.id);
  }

  await callTelegram(botToken, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text: membership.subscribed ? "Спасибо! Отправляю материал 🙌" : "Подписка пока не видна",
    show_alert: false,
  });

  if (!membership.subscribed) {
    await sendMessage(botToken, {
      chatId,
      text: (funnel as FunnelRow).not_subscribed_text.trim() ||
        "Пока не вижу подписки. Подпишитесь на канал — материал придёт автоматически 🙌",
      buttons: [{ text: (funnel as FunnelRow).subscribe_button_text, url: channelUrl(bot) }],
    });
    return;
  }

  /*
    Tapping the button twice must not restart the course, and it does not: a
    step is claimed through a unique constraint before it is sent, so a second
    run finds every step taken and sends nothing.

    Returning early on `delivered_at` used to save that second run, at the cost
    of the case this gate exists for — a reader who already finished one funnel
    and has just opened another. For them `delivered_at` is long set, and the
    early return meant the second lead magnet never arrived at all.
  */
  await deliver(supabase, botToken, funnel as FunnelRow, {
    id: subscriber.id as string,
    telegram_user_id: subscriber.telegram_user_id as string,
    telegram_bot_id: subscriber.telegram_bot_id as string,
  });
}

/**
 * Someone joined the channel without pressing the check button.
 *
 * Telegram sends a `chat_member` update for that, so the material can go out
 * the moment they join — which is both faster and one fewer instruction for
 * the reader to follow.
 */
async function handleChannelJoin(
  supabase: ReturnType<typeof createAdminClient>,
  bot: BotRow,
  botToken: string,
  from: TelegramUser,
): Promise<void> {
  const { data: subscriber } = await supabase
    .from("telegram_subscribers")
    .select("id,funnel_id,telegram_user_id,telegram_bot_id")
    .eq("telegram_bot_id", bot.id)
    .eq("telegram_user_id", String(from.id))
    .maybeSingle();

  /* No `delivered_at` check here either: the funnel column now names the
     course they most recently opened, and the delivery claims stop anything
     they have already had from going out twice. */
  if (!subscriber || !subscriber.funnel_id) return;

  const { data: funnel } = await supabase
    .from("telegram_funnels")
    .select(FUNNEL_COLUMNS)
    .eq("id", subscriber.funnel_id)
    .maybeSingle();

  if (!funnel) return;

  await deliver(supabase, botToken, funnel as FunnelRow, {
    id: subscriber.id as string,
    telegram_user_id: subscriber.telegram_user_id as string,
    telegram_bot_id: subscriber.telegram_bot_id as string,
  });
}

async function processUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  bot: BotRow,
  botToken: string,
  update: any,
): Promise<void> {
  const now = new Date().toISOString();

  if (update.message?.text && update.message.chat?.type === "private") {
    const from: TelegramUser = update.message.from ?? {};
    const chatId = Number(update.message.chat.id);
    const text = String(update.message.text);

    if (text.startsWith("/start")) {
      await handleStart(supabase, bot, botToken, from, chatId, text.slice("/start".length));
      return;
    }

    await supabase
      .from("telegram_subscribers")
      .update({ last_message_at: now, updated_at: now })
      .eq("telegram_bot_id", bot.id)
      .eq("telegram_user_id", String(from.id));
    return;
  }

  if (update.callback_query?.data) {
    const query = update.callback_query;
    const data = String(query.data);
    if (data.startsWith("check:")) {
      await handleSubscriptionCheck(
        supabase,
        bot,
        botToken,
        String(query.id),
        data.slice("check:".length),
        query.from ?? {},
        Number(query.message?.chat?.id ?? query.from?.id),
      );
      return;
    }
    await callTelegram(botToken, "answerCallbackQuery", { callback_query_id: String(query.id) });
    return;
  }

  // The bot itself being blocked or unblocked in a private chat.
  if (update.my_chat_member?.chat?.type === "private") {
    const status = update.my_chat_member.new_chat_member?.status;
    const from: TelegramUser = update.my_chat_member.from ?? {};
    const blocked = status === "kicked" || status === "left";

    await supabase
      .from("telegram_subscribers")
      .update({
        is_blocked: blocked,
        unsubscribed_at: blocked ? now : null,
        updated_at: now,
      })
      .eq("telegram_bot_id", bot.id)
      .eq("telegram_user_id", String(from.id));
    return;
  }

  if (update.chat_member) {
    const status = String(update.chat_member.new_chat_member?.status ?? "");
    const chatId = String(update.chat_member.chat?.id ?? "");
    const member: TelegramUser = update.chat_member.new_chat_member?.user ?? {};

    if (!chatId || chatId !== bot.channel_id || !member.id) return;

    if (SUBSCRIBED_STATUSES.has(status)) {
      await supabase
        .from("telegram_subscribers")
        .update({ channel_left_at: null, updated_at: now })
        .eq("telegram_bot_id", bot.id)
        .eq("telegram_user_id", String(member.id));

      await handleChannelJoin(supabase, bot, botToken, member);
      return;
    }

    /*
      They left the channel. `subscribed_at` deliberately stays: they did
      subscribe, and the funnel's history should keep saying so — otherwise the
      conversion rate silently rewrites itself every time someone leaves. The
      departure is a second fact, recorded alongside.

      This does not touch `unsubscribed_at`, which means leaving the bot. A
      channel leaver still receives broadcasts, and should.
    */
    await supabase
      .from("telegram_subscribers")
      .update({ channel_left_at: now, updated_at: now })
      .eq("telegram_bot_id", bot.id)
      .eq("telegram_user_id", String(member.id))
      .is("channel_left_at", null);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const botId = new URL(req.url).searchParams.get("bot");
  if (!botId) return jsonResponse({ error: "Bot is not identified" }, 400);

  const supabase = createAdminClient();
  const { data: bot } = await supabase
    .from("telegram_bots")
    .select(BOT_COLUMNS)
    .eq("id", botId)
    .maybeSingle();

  // A wrong id and a wrong secret answer identically, so the endpoint cannot be
  // used to discover which bot ids exist.
  const authorised = bot
    ? await secretEquals(req.headers.get("X-Telegram-Bot-Api-Secret-Token"), bot.webhook_secret)
    : false;
  if (!bot || !authorised) return jsonResponse({ error: "Invalid webhook secret" }, 401);

  if (!(bot as BotRow).is_active) return jsonResponse({ ok: true });

  const update = await req.json().catch(() => null);
  if (!update) return jsonResponse({ error: "Invalid JSON payload" }, 400);

  /*
    Always 200, even on failure. Telegram retries a non-2xx update, and a retry
    of a half-finished funnel step would send the material a second time; the
    error belongs in the logs, not in the reader's chat.
  */
  try {
    const botToken = await decryptCredential((bot as BotRow).bot_token_encrypted);
    await processUpdate(supabase, bot as BotRow, botToken, update);
  } catch (error) {
    const message = error instanceof TelegramApiError
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : error instanceof Error
      ? error.message
      : String(error);
    console.error("Telegram update failed", message);
    await supabase
      .from("telegram_bots")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("id", bot.id);
  }

  return jsonResponse({ ok: true });
});
