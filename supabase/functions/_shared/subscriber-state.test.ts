import { describe, expect, it } from 'vitest';
import {
  hasConfirmedChannelMembership,
  planSubscriberStart,
  shouldReplayImmediateSteps,
} from './subscriber-state';

const untracked = { eventId: null, senderIgsid: null };
const tracked = { eventId: 'event-1', senderIgsid: '17841400000000000' };

describe('what a /start writes on a subscriber', () => {
  it('puts a brand new reader in the funnel they opened', () => {
    expect(planSubscriberStart(null, 'funnel-a', untracked)).toEqual({ funnel_id: 'funnel-a' });
  });

  it('moves a returning reader to the funnel they just opened', () => {
    // The whole point of a second lead magnet: they asked for a different
    // course, so that is the one the channel-join delivery has to send.
    const existing = { automation_event_id: 'event-1', funnel_id: 'funnel-a' };
    expect(planSubscriberStart(existing, 'funnel-b', untracked).funnel_id).toBe('funnel-b');
  });

  it('leaves the first campaign holding the credit', () => {
    const existing = { automation_event_id: 'event-1', funnel_id: 'funnel-a' };
    const patch = planSubscriberStart(existing, 'funnel-b', { eventId: 'event-2', senderIgsid: '99' });
    expect(patch.automation_event_id).toBeUndefined();
    expect(patch.source).toBeUndefined();
    expect(patch.instagram_sender_igsid).toBeUndefined();
  });

  it('adopts attribution all at once when there was none', () => {
    const existing = { automation_event_id: null, funnel_id: 'funnel-a' };
    expect(planSubscriberStart(existing, 'funnel-a', tracked)).toEqual({
      funnel_id: 'funnel-a',
      automation_event_id: 'event-1',
      instagram_sender_igsid: '17841400000000000',
      source: 'instagram',
    });
  });

  it('does not invent attribution from an untracked link', () => {
    const existing = { automation_event_id: null, funnel_id: 'funnel-a' };
    expect(planSubscriberStart(existing, 'funnel-b', untracked)).toEqual({ funnel_id: 'funnel-b' });
  });
});

describe('fast returning-subscriber path', () => {
  it('trusts a membership Telegram already confirmed', () => {
    expect(hasConfirmedChannelMembership({
      automation_event_id: null,
      funnel_id: 'funnel-a',
      subscribed_at: '2026-08-21T12:00:00.000Z',
      channel_left_at: null,
    })).toBe(true);
  });

  it('checks Telegram again after a recorded channel departure', () => {
    expect(hasConfirmedChannelMembership({
      automation_event_id: null,
      funnel_id: 'funnel-a',
      subscribed_at: '2026-08-21T12:00:00.000Z',
      channel_left_at: '2026-08-21T13:00:00.000Z',
    })).toBe(false);
  });

  it('replays only when /start opens the same funnel again', () => {
    const existing = { automation_event_id: null, funnel_id: 'funnel-a' };
    expect(shouldReplayImmediateSteps(existing, 'funnel-a')).toBe(true);
    expect(shouldReplayImmediateSteps(existing, 'funnel-b')).toBe(false);
  });
});
