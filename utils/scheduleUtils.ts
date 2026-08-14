import { supabase, PublishWindow } from '../lib/supabase';

const DEFAULT_WINDOW: PublishWindow = {
  timezone: 'Europe/Moscow',
  startHour: 10,
  endHour: 22,
};

export async function loadPublishWindow(userId: string): Promise<PublishWindow> {
  const { data } = await supabase
    .from('profiles')
    .select('timezone, publish_start_hour, publish_end_hour')
    .eq('id', userId)
    .maybeSingle();

  if (!data) return DEFAULT_WINDOW;

  return {
    timezone: data.timezone || DEFAULT_WINDOW.timezone,
    startHour: data.publish_start_hour ?? DEFAULT_WINDOW.startHour,
    endHour: data.publish_end_hour ?? DEFAULT_WINDOW.endHour,
  };
}

function getHourInTimezone(date: Date, timezone: string): number {
  const formatted = date.toLocaleString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatted, 10);
}

function getDatePartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

  const utcGuess = new Date(iso + 'Z');
  const offsetMs = utcGuess.getTime() - new Date(
    utcGuess.toLocaleString('en-US', { timeZone: timezone })
  ).getTime();

  return new Date(utcGuess.getTime() + offsetMs);
}

export function adjustToPublishWindow(
  proposed: Date,
  window: PublishWindow,
): Date {
  if (window.startHour === 0 && window.endHour === 0) return proposed;
  if (window.startHour === window.endHour) return proposed;

  const parts = getDatePartsInTimezone(proposed, window.timezone);
  const hour = parts.hour;

  if (hour >= window.startHour && hour < window.endHour) {
    return proposed;
  }

  if (hour >= window.endHour) {
    return createDateInTimezone(
      parts.year,
      parts.month,
      parts.day + 1,
      window.startHour,
      parts.minute,
      window.timezone,
    );
  }

  return createDateInTimezone(
    parts.year,
    parts.month,
    parts.day,
    window.startHour,
    parts.minute,
    window.timezone,
  );
}

export function scheduleWithWindow(
  baseTime: Date,
  count: number,
  intervalMs: number,
  window: PublishWindow,
): Date[] {
  const times: Date[] = [];
  let current = new Date(baseTime);

  for (let i = 0; i < count; i++) {
    const adjusted = adjustToPublishWindow(current, window);
    times.push(adjusted);
    current = new Date(adjusted.getTime() + intervalMs);
  }

  return times;
}

/** Weekday + time-of-day plan — the way people actually describe a posting schedule. */
export interface SlotPlan {
  /** JS getDay() numbering: 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** "HH:MM" in the plan's timezone. */
  times: string[];
  timezone: string;
}

function weekdayInTimezone(date: Date, timezone: string): number {
  const short = date.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

/** How far ahead we are willing to look for free slots before giving up. */
const MAX_SLOT_SEARCH_DAYS = 400;

/**
 * Fills `count` posts into the next matching slots after `from`, skipping any
 * minute already taken by `busy` so a new batch never lands on top of posts
 * that are already queued.
 */
export function nextSlotTimes(
  plan: SlotPlan,
  count: number,
  from: Date,
  busy: Date[] = [],
): Date[] {
  if (count <= 0 || plan.weekdays.length === 0 || plan.times.length === 0) return [];

  const taken = new Set(busy.map(date => Math.floor(date.getTime() / 60000)));
  const sortedTimes = [...plan.times].sort();
  const times: Date[] = [];

  // Start from the calendar day of `from` as seen in the plan's timezone.
  const startParts = getDatePartsInTimezone(from, plan.timezone);
  const cursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));

  for (let dayOffset = 0; dayOffset < MAX_SLOT_SEARCH_DAYS && times.length < count; dayOffset++) {
    const day = new Date(cursor.getTime() + dayOffset * 86400000);
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth() + 1;
    const date = day.getUTCDate();

    const probe = createDateInTimezone(year, month, date, 12, 0, plan.timezone);
    if (!plan.weekdays.includes(weekdayInTimezone(probe, plan.timezone))) continue;

    for (const time of sortedTimes) {
      if (times.length >= count) break;
      const [hour, minute] = time.split(':').map(Number);
      const slot = createDateInTimezone(year, month, date, hour, minute, plan.timezone);
      if (slot.getTime() <= from.getTime()) continue;
      const key = Math.floor(slot.getTime() / 60000);
      if (taken.has(key)) continue;
      taken.add(key);
      times.push(slot);
    }
  }

  return times;
}

/** Instagram's Content Publishing API allows 25 posts per rolling 24 hours. */
export const INSTAGRAM_DAILY_LIMIT = 25;

/**
 * Largest number of posts falling inside any 24-hour window — used to warn
 * before Instagram starts rejecting them.
 */
export function maxPostsPerDay(times: Date[]): number {
  const sorted = [...times].map(date => date.getTime()).sort((a, b) => a - b);
  let worst = 0;
  for (let i = 0; i < sorted.length; i++) {
    let count = 0;
    for (let j = i; j < sorted.length && sorted[j] - sorted[i] < 86400000; j++) count++;
    worst = Math.max(worst, count);
  }
  return worst;
}

export function formatInTimezone(date: Date, timezone: string): string {
  return date.toLocaleString('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dayLabelInTimezone(date: Date, timezone: string): string {
  const today = new Date();
  const sameDay = (left: Date, right: Date) =>
    left.toLocaleDateString('ru-RU', { timeZone: timezone }) ===
    right.toLocaleDateString('ru-RU', { timeZone: timezone });

  if (sameDay(date, today)) return 'Сегодня';
  if (sameDay(date, new Date(today.getTime() + 86400000))) return 'Завтра';
  return date.toLocaleDateString('ru-RU', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
];

/** Half-hour grid, so picking a time is two clicks instead of typing segments. */
export const TIME_SLOT_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, '0');
  const minute = index % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
});

export const TIMEZONE_OPTIONS = [
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Камчатка (UTC+12)' },
  { value: 'Europe/Kiev', label: 'Киев (UTC+2)' },
  { value: 'Europe/Minsk', label: 'Минск (UTC+3)' },
  { value: 'Asia/Almaty', label: 'Алматы (UTC+6)' },
  { value: 'Asia/Tashkent', label: 'Ташкент (UTC+5)' },
  { value: 'Asia/Tbilisi', label: 'Тбилиси (UTC+4)' },
  { value: 'Asia/Baku', label: 'Баку (UTC+4)' },
  { value: 'Europe/Istanbul', label: 'Стамбул (UTC+3)' },
  { value: 'Asia/Dubai', label: 'Дубай (UTC+4)' },
  { value: 'Europe/London', label: 'Лондон (UTC+0)' },
  { value: 'Europe/Berlin', label: 'Берлин (UTC+1)' },
  { value: 'America/New_York', label: 'Нью-Йорк (UTC-5)' },
  { value: 'America/Los_Angeles', label: 'Лос-Анджелес (UTC-8)' },
  { value: 'Asia/Bangkok', label: 'Бангкок (UTC+7)' },
];

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00`,
}));
