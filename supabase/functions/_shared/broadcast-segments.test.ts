import { describe, expect, it } from 'vitest';
import {
  applyAudienceFilters,
  audienceFilters,
  type AudienceFilter,
  type BroadcastSegment,
} from './broadcast-segments';

/*
  The composer promises a recipient count and the worker delivers to whoever
  matches. These tests exist to keep those two the same rule — the failure mode
  is not a crash but a quiet lie about who received a message.
*/

const ALL_SEGMENTS: BroadcastSegment[] = [
  'all',
  'subscribed',
  'delivered',
  'not_delivered',
  'from_instagram',
  'funnel',
];

const has = (filters: AudienceFilter[], expected: AudienceFilter) =>
  filters.some((filter) => JSON.stringify(filter) === JSON.stringify(expected));

describe('audienceFilters', () => {
  /*
    The most expensive bug this module can have: a segment that forgets to
    exclude people who cannot receive anything. The count would overstate the
    audience and every delivery rate computed from it would be wrong.
  */
  it.each(ALL_SEGMENTS)('excludes unreachable people for segment %s', (segment) => {
    const filters = audienceFilters(segment, 'funnel-1');
    expect(has(filters, { kind: 'eq', column: 'is_blocked', value: false })).toBe(true);
    expect(has(filters, { kind: 'isNull', column: 'unsubscribed_at' })).toBe(true);
  });

  it('adds nothing beyond the baseline for "all"', () => {
    expect(audienceFilters('all', null)).toHaveLength(2);
  });

  it('selects people who confirmed a channel subscription', () => {
    expect(has(audienceFilters('subscribed', null), {
      kind: 'notNull',
      column: 'subscribed_at',
    })).toBe(true);
  });

  it('separates those who got the material from those who did not', () => {
    expect(has(audienceFilters('delivered', null), {
      kind: 'notNull',
      column: 'delivered_at',
    })).toBe(true);
    expect(has(audienceFilters('not_delivered', null), {
      kind: 'isNull',
      column: 'delivered_at',
    })).toBe(true);
  });

  it('narrows to Instagram arrivals', () => {
    expect(has(audienceFilters('from_instagram', null), {
      kind: 'eq',
      column: 'source',
      value: 'instagram',
    })).toBe(true);
  });

  it('narrows to one funnel when one is chosen', () => {
    expect(has(audienceFilters('funnel', 'funnel-1'), {
      kind: 'eq',
      column: 'funnel_id',
      value: 'funnel-1',
    })).toBe(true);
  });

  /*
    While the select is still empty the composer shows the whole audience, so
    the worker has to agree. Falling back to "nobody" would make a broadcast
    silently reach no one.
  */
  it('falls back to the whole audience when no funnel is chosen', () => {
    expect(audienceFilters('funnel', null)).toEqual(audienceFilters('all', null));
  });

  it('never leaves a channel leaver out — they still get broadcasts', () => {
    for (const segment of ALL_SEGMENTS) {
      const filters = audienceFilters(segment, 'funnel-1');
      expect(filters.some((filter) => filter.column === 'channel_left_at')).toBe(false);
    }
  });
});

describe('applyAudienceFilters', () => {
  /** Records the calls a PostgREST builder would receive. */
  function recordingQuery() {
    const calls: string[] = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push(`eq:${column}=${String(value)}`);
        return query;
      },
      is(column: string, value: null) {
        calls.push(`is:${column}=${String(value)}`);
        return query;
      },
      not(column: string, operator: string, value: null) {
        calls.push(`not:${column} ${operator} ${String(value)}`);
        return query;
      },
      calls,
    };
    return query;
  }

  it('translates every filter kind onto the builder', () => {
    const query = recordingQuery();

    applyAudienceFilters(query, [
      { kind: 'eq', column: 'is_blocked', value: false },
      { kind: 'isNull', column: 'unsubscribed_at' },
      { kind: 'notNull', column: 'delivered_at' },
    ]);

    expect(query.calls).toEqual([
      'eq:is_blocked=false',
      'is:unsubscribed_at=null',
      'not:delivered_at is null',
    ]);
  });

  it('returns the builder so the call can be chained', () => {
    const query = recordingQuery();
    expect(applyAudienceFilters(query, audienceFilters('all', null))).toBe(query);
  });

  it('leaves the builder untouched when there is nothing to apply', () => {
    const query = recordingQuery();
    applyAudienceFilters(query, []);
    expect(query.calls).toEqual([]);
  });
});
