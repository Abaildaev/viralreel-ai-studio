/*
  Deciding what a funnel says next.

  A funnel is an ordered list of steps, each with a wait before it. Two callers
  need the same answer from that list: the webhook, the moment someone clears
  the subscription gate, and the drip worker, every time a scheduled step lands.

  The decision is pure on purpose. Sending is full of things that can go wrong —
  tokens, rate limits, blocked readers — and none of them should be tangled up
  with the question of which lesson comes next. That question is arithmetic,
  and arithmetic can be tested.

  No imports: loaded by Deno, by the browser bundle for the preview, and by
  Vitest.
*/

export interface FunnelStep {
  id: string;
  position: number;
  title: string;
  body: string;
  button_text: string;
  button_url: string;
  /** Wait before this step, counted from the previous one. */
  delay_minutes: number;
  is_active: boolean;
}

export interface SequencePlan {
  /**
   * Steps to send right now, in order. More than one only when consecutive
   * steps have no delay between them — a lesson plus its worksheet, say.
   */
  sendNow: FunnelStep[];
  /** The next step that has to wait, and when it is due. */
  schedule: { step: FunnelStep; dueAt: Date } | null;
}

/** Active steps in send order. Inactive ones are skipped, not renumbered. */
export function orderedSteps(steps: FunnelStep[]): FunnelStep[] {
  return steps
    .filter((step) => step.is_active)
    .slice()
    .sort((left, right) => left.position - right.position);
}

/**
 * Works out what happens after `afterPosition`.
 *
 * Passing a position below every step plans the start of the sequence; passing
 * the position just sent plans its continuation. The two cases are the same
 * arithmetic, which is why the webhook and the worker can share this.
 *
 * A step with no delay is sent immediately rather than scheduled, so the lead
 * magnet arrives while the reader is still looking at the chat — waiting a
 * minute for a cron tick to deliver something promised as instant is the
 * difference between a funnel that converts and one that does not.
 */
export function planSequence(
  steps: FunnelStep[],
  afterPosition: number,
  now: Date = new Date(),
): SequencePlan {
  const remaining = orderedSteps(steps).filter((step) => step.position > afterPosition);

  const sendNow: FunnelStep[] = [];

  for (const step of remaining) {
    if (step.delay_minutes > 0) {
      return {
        sendNow,
        schedule: {
          step,
          dueAt: new Date(now.getTime() + step.delay_minutes * 60_000),
        },
      };
    }
    sendNow.push(step);
  }

  return { sendNow, schedule: null };
}

/**
 * When each step lands for someone entering the funnel now.
 *
 * Only the editor needs this — the sender never looks further ahead than the
 * next step — but a course author writing "через 3 дня" on step five is
 * really asking when step five arrives, and the preview should answer.
 */
export function cumulativeSchedule(
  steps: FunnelStep[],
  start: Date = new Date(),
): { step: FunnelStep; at: Date }[] {
  let offset = 0;

  return orderedSteps(steps).map((step) => {
    offset += step.delay_minutes;
    return { step, at: new Date(start.getTime() + offset * 60_000) };
  });
}

/** Renders a delay the way a course author thinks about it. */
export function formatDelay(minutes: number): string {
  if (minutes <= 0) return "сразу";

  if (minutes < 60) return `через ${minutes} мин`;

  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `через ${hours} ${plural(hours, "час", "часа", "часов")}`;
  }

  const days = Math.round(minutes / (60 * 24));
  return `через ${days} ${plural(days, "день", "дня", "дней")}`;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;

  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
