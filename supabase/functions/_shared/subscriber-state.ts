/*
  What a second /start changes about a subscriber, and what it must not.

  Two facts that look alike and behave in opposite directions. Which funnel
  someone is in is a fact about now: the link they just opened is the course
  they expect to receive, and everything downstream reads that column — the
  delivery that fires when they join the channel, the broadcast segments, the
  per-funnel stats. Where they came from is a fact about the past, and the
  campaign that first earned them keeps the credit no matter which link they
  reopen later.

  Freezing both, as this once did, left a reader who opened a second lead
  magnet receiving the first one's lessons — and behind a subscription gate,
  receiving nothing at all.

  No imports on purpose: loaded by the Deno webhook and by Vitest.
*/

export interface ExistingSubscriber {
  automation_event_id: string | null;
  funnel_id: string | null;
  subscribed_at?: string | null;
  channel_left_at?: string | null;
}

export interface StartAttribution {
  /** The Instagram automation event, once it has been proven to belong here. */
  eventId: string | null;
  senderIgsid: string | null;
}

/** Columns to merge into the subscriber row. Absent keys are left alone. */
export interface SubscriberStartPatch {
  funnel_id: string;
  automation_event_id?: string;
  instagram_sender_igsid?: string | null;
  source?: "instagram";
}

/**
 * The subscriber columns a `/start` should write.
 *
 * Attribution is adopted only when there is none yet, and then all of it at
 * once: someone who first arrived on a bare link and later returns through a
 * tracked one is an Instagram lead we simply had not identified, so the event,
 * the Instagram id and the source move together. Filling in only the event id
 * left an attributed subscriber that the "from Instagram" segment still
 * refused to count.
 */
export function planSubscriberStart(
  existing: ExistingSubscriber | null,
  startedFunnelId: string,
  attribution: StartAttribution,
): SubscriberStartPatch {
  const patch: SubscriberStartPatch = { funnel_id: startedFunnelId };

  if (!existing?.automation_event_id && attribution.eventId) {
    patch.automation_event_id = attribution.eventId;
    patch.instagram_sender_igsid = attribution.senderIgsid;
    patch.source = "instagram";
  }

  return patch;
}

/**
 * A channel member already confirmed by Telegram does not need another
 * `getChatMember` round trip on every /start. The webhook records departures
 * in `channel_left_at`, so that fast path closes as soon as the person leaves.
 */
export function hasConfirmedChannelMembership(
  existing: ExistingSubscriber | null,
): boolean {
  return Boolean(existing?.subscribed_at && !existing.channel_left_at);
}

/** Reopening the same funnel should replay its instant hand-off, not its drips. */
export function shouldReplayImmediateSteps(
  existing: ExistingSubscriber | null,
  startedFunnelId: string,
): boolean {
  return Boolean(existing && existing.funnel_id === startedFunnelId);
}
