import { supabase } from '../lib/supabase';
/* Imported straight from the Edge Function's shared folder so the browser and
   the worker run the same rule. The module is deliberately dependency-free,
   which is what makes it loadable by both Vite and Deno. */
import {
  applyAudienceFilters,
  audienceFilters,
} from '../supabase/functions/_shared/broadcast-segments';
import { transliterate } from '../utils/translit';
import { attachmentFields } from './attachmentService';
import type {
  BroadcastSegment,
  MessageAttachment,
  TelegramBot,
  TelegramBroadcast,
  TelegramFunnel,
  TelegramFunnelStats,
  TelegramFunnelStep,
  TelegramSubscriber,
} from '../types';

/**
 * Columns of `telegram_bots` the browser may read. `bot_token_encrypted` and
 * `webhook_secret` are deliberately absent: column-level grants make
 * `select('*')` fail, so every query has to go through this list.
 */
export const TELEGRAM_BOT_COLUMNS =
  'id,user_id,instagram_account_id,bot_username,bot_name,channel_id,channel_title,channel_username,' +
  'channel_invite_url,is_active,webhook_set_at,last_error,subscriber_goal,created_at,updated_at';

const FUNNEL_COLUMNS = '*, lead_magnets(id,title,description,codeword)';

/**
 * Calls the setup function and surfaces its error text.
 *
 * `functions.invoke` collapses every non-2xx into "Edge Function returned a
 * non-2xx status code" and drops the response body, which is exactly the text
 * worth showing here — "бот должен быть администратором канала" is actionable,
 * the generic message is not. So the body is read back off the error context.
 */
async function callSetup<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('telegram-setup', { body });

  if (error) {
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function'
      ? await context.json().catch(() => null)
      : null;
    throw new Error(parsed?.error || error.message || 'Не удалось связаться с Telegram');
  }
  if (data?.error) throw new Error(data.error);

  return data as T;
}

/* -------------------------------------------------------------------------- */
/* Bot                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The bot serving one Instagram account.
 *
 * A user may own a bot per account plus one account-agnostic bot, so this
 * prefers the account's own row and falls back to the shared one — the same
 * rule `loadSalesAgentConfig` and the generator's lead magnets already use.
 * Without an account there is nothing to scope to, so only the shared bot is
 * in play.
 */
export async function loadBot(accountId?: string | null): Promise<TelegramBot | null> {
  const query = supabase.from('telegram_bots').select(TELEGRAM_BOT_COLUMNS);

  const { data, error } = accountId
    ? await query.or(`instagram_account_id.eq.${accountId},instagram_account_id.is.null`)
    : await query.is('instagram_account_id', null);

  if (error) throw error;

  // The column list is a runtime string, so supabase-js cannot infer the row
  // shape from it and falls back to its "unparsed select" placeholder type.
  const rows = (data ?? []) as unknown as TelegramBot[];
  return rows.find((row) => row.instagram_account_id === accountId)
    ?? rows.find((row) => row.instagram_account_id === null)
    ?? null;
}

export function connectBot(botToken: string, instagramAccountId: string | null) {
  return callSetup<{ id: string; botUsername: string; botName: string }>({
    action: 'connect',
    botToken,
    instagramAccountId,
  });
}

export function setBotChannel(botId: string, channel: string) {
  return callSetup<{ channelId: string; channelTitle: string }>({
    action: 'set_channel',
    botId,
    channel,
  });
}

export function refreshWebhook(botId: string) {
  return callSetup<{ ok: true; pendingUpdates: number }>({ action: 'refresh_webhook', botId });
}

export interface SubscriptionSetupCheck {
  ok: true;
  botStatus: 'administrator' | 'creator';
  allowedUpdates: string[];
  pendingUpdates: number;
}

/**
 * Proves the subscription gate against the live Telegram API and repairs the
 * webhook's chat_member subscription if an older registration omitted it.
 */
export function verifySubscriptionSetup(botId: string) {
  return callSetup<SubscriptionSetupCheck>({ action: 'verify_subscription', botId });
}

export function disconnectBot(botId: string) {
  return callSetup<{ ok: true }>({ action: 'disconnect', botId });
}

/**
 * Moves an existing bot to one Instagram account, or back to serving all of
 * them when `instagramAccountId` is null.
 *
 * The funnels, subscribers and broadcasts stay where they are — this rewrites
 * one column, unlike disconnecting and reconnecting, which cascades them away.
 */
export function assignBotAccount(botId: string, instagramAccountId: string | null) {
  return callSetup<{ ok: true }>({ action: 'assign_account', botId, instagramAccountId });
}

export async function updateBot(
  botId: string,
  patch: Partial<Pick<TelegramBot, 'is_active' | 'subscriber_goal'>>,
): Promise<void> {
  const { error } = await supabase
    .from('telegram_bots')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', botId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Funnels                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadFunnels(botId: string): Promise<TelegramFunnel[]> {
  const { data, error } = await supabase
    .from('telegram_funnels')
    .select(FUNNEL_COLUMNS)
    .eq('telegram_bot_id', botId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TelegramFunnel[];
}

export type FunnelDraft = Omit<
  TelegramFunnel,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'lead_magnets'
> & { id?: string | null };

/**
 * Turns a loaded funnel into an editable draft.
 *
 * A loaded row carries more than the funnel's own columns: `FUNNEL_COLUMNS`
 * joins `lead_magnets`, and the server maintains `user_id` and the timestamps.
 * Spreading the row into the editor carried all of that back out again, and
 * PostgREST rejects a body naming a column the table does not have — so every
 * edit of an existing funnel failed while creating one worked. Naming the
 * fields is what keeps the two directions in step; a spread cannot, because
 * TypeScript does not excess-property-check one.
 */
export function toFunnelDraft(funnel: TelegramFunnel): FunnelDraft {
  return {
    id: funnel.id,
    telegram_bot_id: funnel.telegram_bot_id,
    lead_magnet_id: funnel.lead_magnet_id,
    name: funnel.name,
    slug: funnel.slug,
    welcome_text: funnel.welcome_text,
    require_subscription: funnel.require_subscription,
    subscribe_button_text: funnel.subscribe_button_text,
    check_button_text: funnel.check_button_text,
    not_subscribed_text: funnel.not_subscribed_text,
    is_active: funnel.is_active,
    is_default: funnel.is_default,
    ...attachmentFields(funnel),
  };
}

export const FUNNEL_STEP_COLUMNS =
  'id,user_id,funnel_id,position,title,body,button_text,button_url,delay_minutes,is_active,' +
  'attachment_type,attachment_path,attachment_name,created_at,updated_at';

export async function loadFunnelSteps(funnelId: string): Promise<TelegramFunnelStep[]> {
  const { data, error } = await supabase
    .from('telegram_funnel_steps')
    .select(FUNNEL_STEP_COLUMNS)
    .eq('funnel_id', funnelId)
    .order('position', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TelegramFunnelStep[];
}

export interface StepInput extends MessageAttachment {
  id: string | null;
  position: number;
  title: string;
  body: string;
  button_text: string;
  button_url: string;
  delay_minutes: number;
  is_active: boolean;
}

/**
 * Replaces a funnel's steps with the edited list.
 *
 * Deletions run first and positions are written in two passes. The table has a
 * unique index on (funnel, position), so writing a reordered list directly
 * collides the moment two steps swap places — the first update would claim a
 * position the second still holds. Parking everything on negative positions
 * first sidesteps that without dropping and recreating rows, which would lose
 * the delivery history pointing at them.
 */
export async function saveFunnelSteps(
  funnelId: string,
  userId: string,
  steps: StepInput[],
): Promise<void> {
  const existing = await loadFunnelSteps(funnelId);
  const keptIds = new Set(steps.map((step) => step.id).filter(Boolean));

  const removed = existing.filter((step) => !keptIds.has(step.id));
  if (removed.length > 0) {
    const { error } = await supabase
      .from('telegram_funnel_steps')
      .delete()
      .in('id', removed.map((step) => step.id));
    if (error) throw error;
  }

  const survivors = steps.filter((step) => step.id);
  if (survivors.length > 0) {
    // Negative positions cannot collide with the final ones, so this pass is
    // always safe regardless of how the list was reordered.
    for (const [index, step] of survivors.entries()) {
      const { error } = await supabase
        .from('telegram_funnel_steps')
        .update({ position: -(index + 1) })
        .eq('id', step.id!);
      if (error) throw error;
    }
  }

  for (const step of steps) {
    const payload = {
      user_id: userId,
      funnel_id: funnelId,
      position: step.position,
      title: step.title,
      body: step.body,
      button_text: step.button_text,
      button_url: step.button_url,
      delay_minutes: step.delay_minutes,
      is_active: step.is_active,
      ...attachmentFields(step),
      updated_at: new Date().toISOString(),
    };

    const { error } = step.id
      ? await supabase.from('telegram_funnel_steps').update(payload).eq('id', step.id)
      : await supabase.from('telegram_funnel_steps').insert(payload);

    if (error) throw error;
  }
}

/** Returns the funnel's id, which a brand-new funnel does not have until saved. */
export async function saveFunnel(draft: FunnelDraft, userId: string): Promise<string> {
  const { id } = draft;
  const payload = {
    user_id: userId,
    telegram_bot_id: draft.telegram_bot_id,
    lead_magnet_id: draft.lead_magnet_id,
    name: draft.name,
    slug: draft.slug,
    welcome_text: draft.welcome_text,
    require_subscription: draft.require_subscription,
    subscribe_button_text: draft.subscribe_button_text,
    check_button_text: draft.check_button_text,
    not_subscribed_text: draft.not_subscribed_text,
    is_active: draft.is_active,
    is_default: draft.is_default,
    ...attachmentFields(draft),
    updated_at: new Date().toISOString(),
  };

  /* The partial unique index allows one default per bot, so promoting a funnel
     has to demote the incumbent first or the write is rejected. */
  if (payload.is_default) {
    const demote = supabase
      .from('telegram_funnels')
      .update({ is_default: false })
      .eq('telegram_bot_id', payload.telegram_bot_id)
      .eq('is_default', true);
    const { error } = id ? await demote.neq('id', id) : await demote;
    if (error) throw error;
  }

  const { data, error } = id
    ? await supabase.from('telegram_funnels').update(payload).eq('id', id).select('id').single()
    : await supabase.from('telegram_funnels').insert(payload).select('id').single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Такой код ссылки уже занят другой воронкой — выберите другой.');
    }
    throw error;
  }

  return data.id as string;
}

export async function deleteFunnel(funnelId: string): Promise<void> {
  const { error } = await supabase.from('telegram_funnels').delete().eq('id', funnelId);
  if (error) throw error;
}

/**
 * Per-funnel counts for one bot.
 *
 * Scoped like every other read on the page: a user may own a bot per Instagram
 * account, and the analytics table renders these rows directly — unfiltered it
 * would list the other account's funnels underneath this one's.
 */
export async function loadFunnelStats(botId: string): Promise<TelegramFunnelStats[]> {
  const { data, error } = await supabase
    .from('telegram_funnel_stats')
    .select('*')
    .eq('telegram_bot_id', botId);
  if (error) throw error;
  return (data ?? []) as TelegramFunnelStats[];
}

/** The link that goes into the Instagram rule's button. */
export function funnelDeepLink(botUsername: string, slug: string): string {
  if (!botUsername) return '';
  return `https://t.me/${botUsername.replace(/^@/, '')}?start=${slug}`;
}

/*
  Reads a deep link back.

  The mirror of `parseStartPayload` on the Deno side, and it has to stay one:
  the editor uses it to tell an author that the link in their Instagram rule
  names a funnel that no longer exists — which the bot itself answers by
  quietly falling back to the default funnel, so nothing downstream would ever
  report the mistake.
*/
export function funnelSlugFromLink(url: string): string {
  try {
    const parsed = new URL(url.trim());
    if (!/^(www\.)?(t|telegram)\.me$/i.test(parsed.hostname)) return '';

    const start = parsed.searchParams.get('start')?.trim() ?? '';
    if (!start) return '';

    // Everything before the first underscore; the rest is the event id.
    const separator = start.indexOf('_');
    return (separator === -1 ? start : start.slice(0, separator)).toLowerCase();
  } catch {
    return '';
  }
}

/** Slugs are the deep-link separator's other half, so they cannot contain `_`. */
export function slugify(value: string): string {
  return transliterate(value)
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

/* -------------------------------------------------------------------------- */
/* Subscribers                                                                 */
/* -------------------------------------------------------------------------- */

export async function loadSubscribers(
  botId: string,
  limit = 500,
): Promise<TelegramSubscriber[]> {
  const { data, error } = await supabase
    .from('telegram_subscribers')
    .select('*, telegram_funnels(name,slug)')
    .eq('telegram_bot_id', botId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TelegramSubscriber[];
}

export interface SubscriberTotals {
  started: number;
  subscribed: number;
  delivered: number;
  signedUp: number;
  fromInstagram: number;
  blocked: number;
  active: number;
  /** Confirmed a channel subscription and later left it. */
  channelLeft: number;
}

/**
 * Counts every subscriber, not just the page the table shows.
 *
 * PostgREST caps a select at 1000 rows, and the subscriber list deliberately
 * asks for 500. Deriving the analytics from that array would quietly stop
 * counting at exactly the scale this feature exists to reach — the goal is a
 * thousand — so the totals come from `head: true` counts instead, which return
 * a number rather than rows and are unaffected by the cap.
 */
export async function loadSubscriberTotals(botId: string): Promise<SubscriberTotals> {
  const base = () =>
    supabase
      .from('telegram_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('telegram_bot_id', botId);

  const [started, subscribed, delivered, signedUp, fromInstagram, blocked, active, channelLeft] =
    await Promise.all([
      base(),
      base().not('subscribed_at', 'is', null),
      base().not('delivered_at', 'is', null),
      base().not('signed_up_at', 'is', null),
      base().eq('source', 'instagram'),
      base().eq('is_blocked', true),
      base().eq('is_blocked', false).is('unsubscribed_at', null),
      base().not('channel_left_at', 'is', null),
    ]);

  return {
    started: started.count ?? 0,
    subscribed: subscribed.count ?? 0,
    delivered: delivered.count ?? 0,
    signedUp: signedUp.count ?? 0,
    fromInstagram: fromInstagram.count ?? 0,
    blocked: blocked.count ?? 0,
    active: active.count ?? 0,
    channelLeft: channelLeft.count ?? 0,
  };
}

const PAGE_SIZE = 1000;

/**
 * Sign-up timestamps for the chart, paged past the same 1000-row cap.
 *
 * Only `created_at` is selected: the chart needs nothing else, and fetching
 * whole rows for a fortnight of traffic would be paying for data to throw away.
 */
export async function loadSignupDates(botId: string, days: number): Promise<Date[]> {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  const dates: Date[] = [];

  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('telegram_subscribers')
      .select('created_at')
      .eq('telegram_bot_id', botId)
      .gte('created_at', cutoff.toISOString())
      // `id` breaks ties: two people who arrived in the same millisecond would
      // otherwise be free to swap places between pages, which duplicates one
      // and drops the other.
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) throw error;
    for (const row of data ?? []) dates.push(new Date(row.created_at as string));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return dates;
}

export async function markSignedUp(subscriberId: string): Promise<void> {
  const { error } = await supabase
    .from('telegram_subscribers')
    .update({ signed_up_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', subscriberId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Broadcasts                                                                  */
/* -------------------------------------------------------------------------- */

export const SEGMENT_LABELS: Record<BroadcastSegment, string> = {
  all: 'Все подписчики',
  subscribed: 'Подтвердившие подписку на канал',
  delivered: 'Получившие лид-магнит',
  not_delivered: 'Не дошедшие до выдачи',
  from_instagram: 'Пришедшие из Instagram',
  funnel: 'Одна воронка',
};

export async function loadBroadcasts(botId: string): Promise<TelegramBroadcast[]> {
  const { data, error } = await supabase
    .from('telegram_broadcasts')
    .select('*')
    .eq('telegram_bot_id', botId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TelegramBroadcast[];
}

export type BroadcastDraft = Pick<
  TelegramBroadcast,
  | 'telegram_bot_id'
  | 'title'
  | 'message_text'
  | 'button_text'
  | 'button_url'
  | 'disable_notification'
  | 'segment'
  | 'segment_funnel_id'
  | 'scheduled_at'
  | 'status'
  | 'attachment_type'
  | 'attachment_path'
  | 'attachment_name'
> & { id?: string | null };

/**
 * Returns the stored row's id.
 *
 * The caller needs it to hand a brand-new broadcast to the worker, and reading
 * it back as "the most recent row for this bot" would pick the wrong one if
 * anything else was created in between — a second tab, or a fast double-click.
 */
export async function saveBroadcast(draft: BroadcastDraft, userId: string): Promise<string> {
  const { id } = draft;
  const payload = {
    user_id: userId,
    telegram_bot_id: draft.telegram_bot_id,
    title: draft.title,
    message_text: draft.message_text,
    button_text: draft.button_text,
    button_url: draft.button_url,
    disable_notification: draft.disable_notification,
    segment: draft.segment,
    segment_funnel_id: draft.segment_funnel_id,
    scheduled_at: draft.scheduled_at,
    status: draft.status,
    ...attachmentFields(draft),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = id
    ? await supabase.from('telegram_broadcasts').update(payload).eq('id', id).select('id').single()
    : await supabase.from('telegram_broadcasts').insert(payload).select('id').single();

  if (error) throw error;
  return data.id as string;
}

/**
 * Hands a broadcast to the worker.
 *
 * Nothing is sent from the browser: the row simply becomes due, and the
 * minutely cron picks it up. A tab closed mid-send therefore changes nothing.
 */
export async function scheduleBroadcast(
  broadcastId: string,
  scheduledAt: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('telegram_broadcasts')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledAt ?? new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', broadcastId)
    .in('status', ['draft', 'scheduled', 'failed', 'cancelled']);

  if (error) throw error;
}

/**
 * Only a send that has not begun can be called back. Once the worker has
 * started, some people already have the message, and pretending otherwise in
 * the interface would be a lie about what the audience received.
 */
export async function cancelBroadcast(broadcastId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('telegram_broadcasts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', broadcastId)
    .eq('status', 'scheduled')
    .select('id');

  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function deleteBroadcast(broadcastId: string): Promise<void> {
  const { error } = await supabase.from('telegram_broadcasts').delete().eq('id', broadcastId);
  if (error) throw error;
}

/**
 * Live recipient count for the composer.
 *
 * Literally the worker's filters, not a second implementation of them — the
 * number shown before sending and the audience actually written to come from
 * one description, so they cannot drift apart.
 */
export async function countSegment(
  botId: string,
  segment: BroadcastSegment,
  funnelId: string | null,
): Promise<number> {
  const { count, error } = await applyAudienceFilters(
    supabase
      .from('telegram_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('telegram_bot_id', botId),
    audienceFilters(segment, funnelId),
  );

  if (error) throw error;
  return count ?? 0;
}
