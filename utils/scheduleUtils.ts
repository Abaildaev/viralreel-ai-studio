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

export function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  /* Treat the requested wall-clock value as a calendar tuple, then converge
     on the instant whose Intl-rendered tuple matches it. This deliberately
     avoids `new Date(localizedString)`, which silently applies the machine's
     timezone and made scheduling differ between browsers and CI. */
  const desiredMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let instantMs = desiredMs;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getDatePartsInTimezone(new Date(instantMs), timezone);
    const actualMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
      0,
    );
    const correction = desiredMs - actualMs;
    instantMs += correction;
    if (correction === 0) break;
  }

  return new Date(instantMs);
}

/** Parses a date and time input as wall-clock values in the selected timezone. */
export function dateTimeInTimezone(dateInput: string, timeInput: string, timezone: string): Date {
  const [year, month, day] = dateInput.split('-').map(Number);
  const [hour, minute] = timeInput.split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    throw new Error('Некорректная дата или время');
  }
  return createDateInTimezone(year, month, day, hour, minute, timezone);
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

export interface TimezoneOption {
  value: string;
  label: string;
  city: string;
  offset: string;
  offsetMinutes: number;
  region: 'cis' | 'europe' | 'asia' | 'americas' | 'mideast' | 'pacific';
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // UTC-11 .. UTC-1
  { value: 'Pacific/Pago_Pago', label: 'Паго-Паго, Самоа (UTC-11)', city: 'Паго-Паго', offset: 'UTC-11', offsetMinutes: -660, region: 'pacific' },
  { value: 'Pacific/Honolulu', label: 'Гонолулу, Гавайи (UTC-10)', city: 'Гонолулу', offset: 'UTC-10', offsetMinutes: -600, region: 'pacific' },
  { value: 'America/Anchorage', label: 'Анкоридж, Аляска (UTC-9)', city: 'Анкоридж', offset: 'UTC-9', offsetMinutes: -540, region: 'americas' },
  { value: 'America/Los_Angeles', label: 'Лос-Анджелес, Сан-Франциско, Ванкувер (UTC-8)', city: 'Лос-Анджелес', offset: 'UTC-8', offsetMinutes: -480, region: 'americas' },
  { value: 'America/Denver', label: 'Денвер, Финикс (UTC-7)', city: 'Денвер', offset: 'UTC-7', offsetMinutes: -420, region: 'americas' },
  { value: 'America/Chicago', label: 'Чикаго, Мехико, Даллас (UTC-6)', city: 'Чикаго', offset: 'UTC-6', offsetMinutes: -360, region: 'americas' },
  { value: 'America/New_York', label: 'Нью-Йорк, Майами, Торонто (UTC-5)', city: 'Нью-Йорк', offset: 'UTC-5', offsetMinutes: -300, region: 'americas' },
  { value: 'America/Santiago', label: 'Сантьяго, Каракас, Ла-Пас (UTC-4)', city: 'Сантьяго', offset: 'UTC-4', offsetMinutes: -240, region: 'americas' },
  { value: 'America/Sao_Paulo', label: 'Буэнос-Айрес, Сан-Паулу, Рио (UTC-3)', city: 'Сан-Паулу', offset: 'UTC-3', offsetMinutes: -180, region: 'americas' },
  { value: 'America/Noronha', label: 'Фернанду-ди-Норонья (UTC-2)', city: 'Норонья', offset: 'UTC-2', offsetMinutes: -120, region: 'americas' },
  { value: 'Atlantic/Azores', label: 'Азорские острова, Кабо-Верде (UTC-1)', city: 'Азоры', offset: 'UTC-1', offsetMinutes: -60, region: 'europe' },

  // UTC+0
  { value: 'UTC', label: 'UTC / Гринвич (UTC+0)', city: 'UTC', offset: 'UTC+0', offsetMinutes: 0, region: 'europe' },
  { value: 'Europe/London', label: 'Лондон, Дублин, Лиссабон (UTC+0)', city: 'Лондон', offset: 'UTC+0', offsetMinutes: 0, region: 'europe' },

  // UTC+1
  { value: 'Europe/Berlin', label: 'Берлин, Париж, Рим, Мадрид, Варшава (UTC+1)', city: 'Берлин', offset: 'UTC+1', offsetMinutes: 60, region: 'europe' },

  // UTC+2
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)', city: 'Калининград', offset: 'UTC+2', offsetMinutes: 120, region: 'cis' },
  { value: 'Europe/Kiev', label: 'Киев, Кишинёв, Рига, Вильнюс, Таллин (UTC+2)', city: 'Киев', offset: 'UTC+2', offsetMinutes: 120, region: 'europe' },
  { value: 'Africa/Cairo', label: 'Каир, Афины, Бухарест (UTC+2)', city: 'Каир', offset: 'UTC+2', offsetMinutes: 120, region: 'mideast' },

  // UTC+3
  { value: 'Europe/Moscow', label: 'Москва, Санкт-Петербург (UTC+3)', city: 'Москва', offset: 'UTC+3', offsetMinutes: 180, region: 'cis' },
  { value: 'Europe/Minsk', label: 'Минск (UTC+3)', city: 'Минск', offset: 'UTC+3', offsetMinutes: 180, region: 'cis' },
  { value: 'Europe/Istanbul', label: 'Стамбул, Анкара (UTC+3)', city: 'Стамбул', offset: 'UTC+3', offsetMinutes: 180, region: 'europe' },
  { value: 'Asia/Riyadh', label: 'Эр-Рияд, Доха, Кувейт (UTC+3)', city: 'Эр-Рияд', offset: 'UTC+3', offsetMinutes: 180, region: 'mideast' },

  // UTC+3:30
  { value: 'Asia/Tehran', label: 'Тегеран (UTC+3:30)', city: 'Тегеран', offset: 'UTC+3:30', offsetMinutes: 210, region: 'mideast' },

  // UTC+4
  { value: 'Europe/Samara', label: 'Самара, Саратов, Ижевск, Ульяновск (UTC+4)', city: 'Самара', offset: 'UTC+4', offsetMinutes: 240, region: 'cis' },
  { value: 'Asia/Baku', label: 'Баку (UTC+4)', city: 'Баку', offset: 'UTC+4', offsetMinutes: 240, region: 'cis' },
  { value: 'Asia/Tbilisi', label: 'Тбилиси (UTC+4)', city: 'Тбилиси', offset: 'UTC+4', offsetMinutes: 240, region: 'cis' },
  { value: 'Asia/Yerevan', label: 'Ереван (UTC+4)', city: 'Ереван', offset: 'UTC+4', offsetMinutes: 240, region: 'cis' },
  { value: 'Asia/Dubai', label: 'Дубай, Абу-Даби, Маскат (UTC+4)', city: 'Дубай', offset: 'UTC+4', offsetMinutes: 240, region: 'mideast' },

  // UTC+4:30
  { value: 'Asia/Kabul', label: 'Кабул (UTC+4:30)', city: 'Кабул', offset: 'UTC+4:30', offsetMinutes: 270, region: 'mideast' },

  // UTC+5
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург, Челябинск, Уфа, Пермь, Тюмень (UTC+5)', city: 'Екатеринбург', offset: 'UTC+5', offsetMinutes: 300, region: 'cis' },
  { value: 'Asia/Tashkent', label: 'Ташкент, Самарканд (UTC+5)', city: 'Ташкент', offset: 'UTC+5', offsetMinutes: 300, region: 'cis' },
  { value: 'Asia/Ashgabat', label: 'Ашхабад (UTC+5)', city: 'Ашхабад', offset: 'UTC+5', offsetMinutes: 300, region: 'cis' },
  { value: 'Asia/Dushanbe', label: 'Душанбе (UTC+5)', city: 'Душанбе', offset: 'UTC+5', offsetMinutes: 300, region: 'cis' },
  { value: 'Asia/Karachi', label: 'Исламабад, Карачи (UTC+5)', city: 'Карачи', offset: 'UTC+5', offsetMinutes: 300, region: 'asia' },

  // UTC+5:30
  { value: 'Asia/Kolkata', label: 'Дели, Мумбаи, Коломбо (UTC+5:30)', city: 'Дели', offset: 'UTC+5:30', offsetMinutes: 330, region: 'asia' },
  // UTC+5:45
  { value: 'Asia/Kathmandu', label: 'Катманду (UTC+5:45)', city: 'Катманду', offset: 'UTC+5:45', offsetMinutes: 345, region: 'asia' },

  // UTC+6
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)', city: 'Омск', offset: 'UTC+6', offsetMinutes: 360, region: 'cis' },
  { value: 'Asia/Almaty', label: 'Астана, Алматы, Шымкент (UTC+5/UTC+6)', city: 'Алматы', offset: 'UTC+5', offsetMinutes: 300, region: 'cis' },
  { value: 'Asia/Bishkek', label: 'Бишкек (UTC+6)', city: 'Бишкек', offset: 'UTC+6', offsetMinutes: 360, region: 'cis' },
  { value: 'Asia/Dhaka', label: 'Дакка (UTC+6)', city: 'Дакка', offset: 'UTC+6', offsetMinutes: 360, region: 'asia' },

  // UTC+7
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск, Томск, Кемерово, Барнаул (UTC+7)', city: 'Красноярск', offset: 'UTC+7', offsetMinutes: 420, region: 'cis' },
  { value: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)', city: 'Новосибирск', offset: 'UTC+7', offsetMinutes: 420, region: 'cis' },
  { value: 'Asia/Bangkok', label: 'Бангкок, Джакарта, Ханой, Пхукет (UTC+7)', city: 'Бангкок', offset: 'UTC+7', offsetMinutes: 420, region: 'asia' },

  // UTC+8
  { value: 'Asia/Irkutsk', label: 'Иркутск, Улан-Удэ (UTC+8)', city: 'Иркутск', offset: 'UTC+8', offsetMinutes: 480, region: 'cis' },
  { value: 'Asia/Shanghai', label: 'Пекин, Шанхай, Гонконг, Гуанчжоу (UTC+8)', city: 'Пекин', offset: 'UTC+8', offsetMinutes: 480, region: 'asia' },
  { value: 'Asia/Singapore', label: 'Сингапур, Куала-Лумпур, Бали (UTC+8)', city: 'Сингапур', offset: 'UTC+8', offsetMinutes: 480, region: 'asia' },
  { value: 'Asia/Ulaanbaatar', label: 'Улан-Батор (UTC+8)', city: 'Улан-Батор', offset: 'UTC+8', offsetMinutes: 480, region: 'asia' },

  // UTC+9
  { value: 'Asia/Yakutsk', label: 'Якутск, Чита, Благовещенск (UTC+9)', city: 'Якутск', offset: 'UTC+9', offsetMinutes: 540, region: 'cis' },
  { value: 'Asia/Tokyo', label: 'Токио, Киото, Осака (UTC+9)', city: 'Токио', offset: 'UTC+9', offsetMinutes: 540, region: 'asia' },
  { value: 'Asia/Seoul', label: 'Сеул (UTC+9)', city: 'Сеул', offset: 'UTC+9', offsetMinutes: 540, region: 'asia' },

  // UTC+9:30
  { value: 'Australia/Adelaide', label: 'Аделаида, Дарвин (UTC+9:30)', city: 'Аделаида', offset: 'UTC+9:30', offsetMinutes: 570, region: 'pacific' },

  // UTC+10
  { value: 'Asia/Vladivostok', label: 'Владивосток, Хабаровск (UTC+10)', city: 'Владивосток', offset: 'UTC+10', offsetMinutes: 600, region: 'cis' },
  { value: 'Australia/Sydney', label: 'Сидней, Мельбурн, Брисбен (UTC+10)', city: 'Сидней', offset: 'UTC+10', offsetMinutes: 600, region: 'pacific' },

  // UTC+11
  { value: 'Asia/Magadan', label: 'Магадан, Сахалин, Южно-Сахалинск (UTC+11)', city: 'Магадан', offset: 'UTC+11', offsetMinutes: 660, region: 'cis' },

  // UTC+12
  { value: 'Asia/Kamchatka', label: 'Камчатка, Анадырь, Петропавловск (UTC+12)', city: 'Камчатка', offset: 'UTC+12', offsetMinutes: 720, region: 'cis' },
  { value: 'Pacific/Auckland', label: 'Окленд, Веллингтон, Фиджи (UTC+12)', city: 'Окленд', offset: 'UTC+12', offsetMinutes: 720, region: 'pacific' },

  // UTC+13 .. UTC+14
  { value: 'Pacific/Tongatapu', label: 'Нукуалофа, Тонга (UTC+13)', city: 'Нукуалофа', offset: 'UTC+13', offsetMinutes: 780, region: 'pacific' },
  { value: 'Pacific/Kiritimati', label: 'Остров Рождества, Кирибати (UTC+14)', city: 'Киритимати', offset: 'UTC+14', offsetMinutes: 840, region: 'pacific' },
];

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00`,
}));
