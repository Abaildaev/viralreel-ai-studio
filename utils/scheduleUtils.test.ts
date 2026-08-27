import { describe, expect, it } from 'vitest';
import { dateTimeInTimezone, nextSlotTimes } from './scheduleUtils';

function wallClock(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

describe('schedule timezone handling', () => {
  it('treats date and time inputs as wall-clock values in the selected timezone', () => {
    const moscow = dateTimeInTimezone('2026-08-27', '09:30', 'Europe/Moscow');
    const newYork = dateTimeInTimezone('2026-08-27', '09:30', 'America/New_York');

    expect(wallClock(moscow, 'Europe/Moscow')).toContain('08/27/2026, 09:30');
    expect(wallClock(newYork, 'America/New_York')).toContain('08/27/2026, 09:30');
    expect(moscow.getTime()).not.toBe(newYork.getTime());
  });

  it('creates recurring slots on the requested local weekday and time', () => {
    const slots = nextSlotTimes(
      { weekdays: [1], times: ['09:00'], timezone: 'Europe/Moscow' },
      1,
      new Date('2026-08-23T12:00:00.000Z'),
    );

    expect(slots).toHaveLength(1);
    expect(wallClock(slots[0], 'Europe/Moscow')).toContain('08/24/2026, 09:00');
  });
});
