import { describe, expect, it } from 'vitest';
import {
  cumulativeSchedule,
  formatDelay,
  orderedSteps,
  planSequence,
  type FunnelStep,
} from './funnel-sequence';

/*
  A course is delivered once, in order, over days. Every test here is really
  one of three questions: does the reader get the right lesson, do they get it
  at the right time, and can they get one twice.
*/

const NOW = new Date('2026-08-16T12:00:00.000Z');

const step = (position: number, delay_minutes: number, overrides: Partial<FunnelStep> = {}): FunnelStep => ({
  id: `step-${position}`,
  position,
  title: `Урок ${position}`,
  body: `Текст урока ${position}`,
  button_text: '',
  button_url: '',
  delay_minutes,
  is_active: true,
  ...overrides,
});

describe('orderedSteps', () => {
  it('sorts by position regardless of how they arrived', () => {
    const steps = [step(3, 0), step(1, 0), step(2, 0)];
    expect(orderedSteps(steps).map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it('skips inactive steps without renumbering the rest', () => {
    const steps = [step(1, 0), step(2, 0, { is_active: false }), step(3, 0)];
    expect(orderedSteps(steps).map((s) => s.position)).toEqual([1, 3]);
  });

  it('does not mutate the input', () => {
    const steps = [step(2, 0), step(1, 0)];
    orderedSteps(steps);
    expect(steps.map((s) => s.position)).toEqual([2, 1]);
  });

  it('sends an accidentally duplicated message only once', () => {
    const duplicate = step(2, 0, {
      body: 'Вот PDF с промптами',
      button_text: 'Протестировать',
      button_url: 'https://t.me/example_bot',
      attachment_type: 'document',
      attachment_path: 'user/prompts.pdf',
    });
    const original = { ...duplicate, id: 'step-1', position: 1 };

    expect(orderedSteps([original, duplicate]).map((s) => s.id)).toEqual(['step-1']);
  });

  it('keeps the same copy when it is deliberately scheduled for later', () => {
    const first = step(1, 0, { body: 'Напоминание' });
    const later = step(2, 180, { body: 'Напоминание' });

    expect(orderedSteps([first, later])).toHaveLength(2);
  });
});

describe('planSequence', () => {
  /*
    The lead magnet is promised as instant. Scheduling it for the next cron
    tick would make the reader wait up to a minute staring at a chat that
    already said "держите материал".
  */
  it('sends the opening step immediately when it has no delay', () => {
    const plan = planSequence([step(1, 0), step(2, 1440)], 0, NOW);
    expect(plan.sendNow.map((s) => s.position)).toEqual([1]);
    expect(plan.schedule?.step.position).toBe(2);
  });

  it('sends a run of zero-delay steps together', () => {
    const plan = planSequence([step(1, 0), step(2, 0), step(3, 60)], 0, NOW);
    expect(plan.sendNow.map((s) => s.position)).toEqual([1, 2]);
    expect(plan.schedule?.step.position).toBe(3);
  });

  it('schedules rather than sends when the first step waits', () => {
    const plan = planSequence([step(1, 30)], 0, NOW);
    expect(plan.sendNow).toEqual([]);
    expect(plan.schedule?.dueAt.toISOString()).toBe('2026-08-16T12:30:00.000Z');
  });

  it('counts the delay from now, not from funnel entry', () => {
    const later = new Date('2026-08-20T09:00:00.000Z');
    const plan = planSequence([step(1, 1440)], 0, later);
    expect(plan.schedule?.dueAt.toISOString()).toBe('2026-08-21T09:00:00.000Z');
  });

  it('continues from the step just sent', () => {
    const steps = [step(1, 0), step(2, 1440), step(3, 1440)];
    const plan = planSequence(steps, 2, NOW);
    expect(plan.sendNow).toEqual([]);
    expect(plan.schedule?.step.position).toBe(3);
  });

  /* Reaching the end is how the sender knows to mark the course finished. */
  it('reports nothing left at the end of the sequence', () => {
    const plan = planSequence([step(1, 0), step(2, 60)], 2, NOW);
    expect(plan.sendNow).toEqual([]);
    expect(plan.schedule).toBeNull();
  });

  it('plans nothing for a funnel with no steps', () => {
    expect(planSequence([], 0, NOW)).toEqual({ sendNow: [], schedule: null });
  });

  /*
    Switching a lesson off mid-course must skip it, not stall everyone waiting
    behind it.
  */
  it('steps over an inactive lesson', () => {
    const steps = [step(1, 0), step(2, 60, { is_active: false }), step(3, 120)];
    const plan = planSequence(steps, 1, NOW);
    expect(plan.schedule?.step.position).toBe(3);
    expect(plan.schedule?.dueAt.toISOString()).toBe('2026-08-16T14:00:00.000Z');
  });

  it('never looks backwards, so a resend cannot repeat a lesson', () => {
    const steps = [step(1, 0), step(2, 0), step(3, 0)];
    expect(planSequence(steps, 3, NOW).sendNow).toEqual([]);
    expect(planSequence(steps, 2, NOW).sendNow.map((s) => s.position)).toEqual([3]);
  });
});

describe('cumulativeSchedule', () => {
  it('accumulates delays down the course', () => {
    const steps = [step(1, 0), step(2, 1440), step(3, 1440)];
    expect(cumulativeSchedule(steps, NOW).map((entry) => entry.at.toISOString())).toEqual([
      '2026-08-16T12:00:00.000Z',
      '2026-08-17T12:00:00.000Z',
      '2026-08-18T12:00:00.000Z',
    ]);
  });

  it('ignores inactive steps when projecting the calendar', () => {
    const steps = [step(1, 0), step(2, 1440, { is_active: false }), step(3, 60)];
    const schedule = cumulativeSchedule(steps, NOW);
    expect(schedule).toHaveLength(2);
    expect(schedule[1].at.toISOString()).toBe('2026-08-16T13:00:00.000Z');
  });
});

describe('formatDelay', () => {
  it('names an immediate step', () => {
    expect(formatDelay(0)).toBe('сразу');
    expect(formatDelay(-5)).toBe('сразу');
  });

  it('uses minutes, hours and days as the size warrants', () => {
    expect(formatDelay(30)).toBe('через 30 мин');
    expect(formatDelay(120)).toBe('через 2 часа');
    expect(formatDelay(1440)).toBe('через 1 день');
    expect(formatDelay(4320)).toBe('через 3 дня');
  });

  /* Russian plurals are the kind of detail that makes an interface look
     machine-written when it is wrong. */
  it('declines the unit correctly', () => {
    expect(formatDelay(60)).toBe('через 1 час');
    expect(formatDelay(300)).toBe('через 5 часов');
    expect(formatDelay(1440 * 5)).toBe('через 5 дней');
    expect(formatDelay(1440 * 11)).toBe('через 11 дней');
    expect(formatDelay(1440 * 21)).toBe('через 21 день');
    expect(formatDelay(1440 * 22)).toBe('через 22 дня');
  });
});
