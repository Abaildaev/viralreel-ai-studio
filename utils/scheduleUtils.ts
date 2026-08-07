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
