import { supabase } from '../lib/supabase';
/* Imported straight from the Edge Function's shared folder so the browser and
   the worker run the same rule. The module is deliberately dependency-free,
   which is what makes it loadable by both Vite and Deno. */
import {
  applyAudienceFilters,
  audienceFilters,
} from '../supabase/functions/_shared/broadcast-segments';
import type {
  BroadcastSegment,
  TelegramBot,
  TelegramBroadcast,
  TelegramFunnel,
  TelegramFunnelStats,
  TelegramSubscriber,
} from '../types';

/**
 * Columns of `telegram_bots` the browser may read. `bot_token_encrypted` and
 * `webhook_secret` are deliberately absent: column-level grants make
 * `select('*')` fail, so every query has to go through this list.
 */
export const TELEGRAM_BOT_COLUMNS =
  'id,user_id,bot_username,bot_name,channel_id,channel_title,channel_username,' +
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

export async function loadBot(): Promise<TelegramBot | null> {
  const { data, error } = await supabase
    .from('telegram_bots')
    .select(TELEGRAM_BOT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  // The column list is a runtime string, so supabase-js cannot infer the row
  // shape from it and falls back to its "unparsed select" placeholder type.
  return (data as unknown as TelegramBot) ?? null;
}

export function connectBot(botToken: string) {
  return callSetup<{ id: string; botUsername: string; botName: string }>({
    action: 'connect',
    botToken,
  });
}

export function setBotChannel(channel: string) {
  return callSetup<{ channelId: string; channelTitle: string }>({
    action: 'set_channel',
    channel,
  });
}

export function refreshWebhook() {
  return callSetup<{ ok: true; pendingUpdates: number }>({ action: 'refresh_webhook' });
}

export function disconnectBot() {
  return callSetup<{ ok: true }>({ action: 'disconnect' });
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

export async function saveFunnel(draft: FunnelDraft, userId: string): Promise<void> {
  const { id, ...fields } = draft;
  const payload = { ...fields, user_id: userId, updated_at: new Date().toISOString() };

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

  const { error } = id
    ? await supabase.from('telegram_funnels').update(payload).eq('id', id)
    : await supabase.from('telegram_funnels').insert(payload);

  if (error) {
    if (error.code === '23505') {
      throw new Error('Такой код ссылки уже занят другой воронкой — выберите другой.');
    }
    throw error;
  }
}

export async function deleteFunnel(funnelId: string): Promise<void> {
  const { error } = await supabase.from('telegram_funnels').delete().eq('id', funnelId);
  if (error) throw error;
}

export async function loadFunnelStats(): Promise<TelegramFunnelStats[]> {
  const { data, error } = await supabase.from('telegram_funnel_stats').select('*');
  if (error) throw error;
  return (data ?? []) as TelegramFunnelStats[];
}

/** The link that goes into the Instagram rule's button. */
export function funnelDeepLink(botUsername: string, slug: string): string {
  if (!botUsername) return '';
  return `https://t.me/${botUsername.replace(/^@/, '')}?start=${slug}`;
}

/**
 * The same link with the attribution placeholder the Instagram webhook fills
 * in. Shown in the UI so it is obvious the two halves are one journey.
 */
export function funnelTrackedLink(botUsername: string, slug: string): string {
  const base = funnelDeepLink(botUsername, slug);
  return base ? `${base}_{{event_id}}` : '';
}

/** Slugs are the deep-link separator's other half, so they cannot contain `_`. */
export function slugify(value: string): string {
  const translit: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e',
    ю: 'yu', я: 'ya', ь: '', ъ: '',
  };

  return value
    .toLowerCase()
    .split('')
    .map((character) => translit[character] ?? character)
    .join('')
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
> & { id?: string | null };

/**
 * Returns the stored row's id.
 *
 * The caller needs it to hand a brand-new broadcast to the worker, and reading
 * it back as "the most recent row for this bot" would pick the wrong one if
 * anything else was created in between — a second tab, or a fast double-click.
 */
export async function saveBroadcast(draft: BroadcastDraft, userId: string): Promise<string> {
  const { id, ...fields } = draft;
  const payload = { ...fields, user_id: userId, updated_at: new Date().toISOString() };

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
