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
  /** Optional here because only steps with files carry these columns. */
  attachment_type?: string;
  attachment_path?: string;
}

/*
  Generic over the row rather than fixed to `FunnelStep`, so a caller that
  selected more columns than the arithmetic needs — the sender, which also
  reads the attachment — gets its own row type back out instead of a narrowed
  one it would have to cast.
*/
export interface SequencePlan<T extends FunnelStep = FunnelStep> {
  /**
   * Steps to send right now, in order. More than one only when consecutive
   * steps have no delay between them — a lesson plus its worksheet, say.
   */
  sendNow: T[];
  /** The next step that has to wait, and when it is due. */
  schedule: { step: T; dueAt: Date } | null;
}

/** Active steps in send order. Inactive ones are skipped, not renumbered. */
export function orderedSteps<T extends FunnelStep>(steps: T[]): T[] {
  const ordered = steps
    .filter((step) => step.is_active)
    .slice()
    .sort((left, right) => left.position - right.position);

  /*
    A duplicated editor row used to send the same PDF twice, especially when
    the automatic channel-join delivery and the old manual check button met an
    already duplicated sequence. The delivery table prevents one row from
    being sent twice; this second guard prevents two indistinguishable rows
    from becoming two messages. A later reminder with a different delay, or
    the same words on a different file, remains a legitimate separate step.
  */
  const seen = new Set<string>();
  return ordered.filter((step) => {
    const fingerprint = [
      step.body.trim(),
      step.button_text.trim(),
      step.button_url.trim(),
      String(step.delay_minutes),
      step.attachment_type?.trim() ?? '',
      step.attachment_path?.trim() ?? '',
    ].join('\u0000');

    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
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
export function planSequence<T extends FunnelStep>(
  steps: T[],
  afterPosition: number,
  now: Date = new Date(),
): SequencePlan<T> {
  const remaining = orderedSteps(steps).filter((step) => step.position > afterPosition);

  const sendNow: T[] = [];

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
export function cumulativeSchedule<T extends FunnelStep>(
  steps: T[],
  start: Date = new Date(),
): { step: T; at: Date }[] {
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
