import { describe, expect, it } from 'vitest';
import { buildStartPayload, parseStartPayload } from './start-payload';

/*
  This parser sits on the seam between the two halves of the funnel, and it
  reads input that anyone on the internet can type. Both properties are worth
  pinning down: that a well-formed link attributes the subscriber correctly,
  and that a malformed or hostile one degrades to "no attribution" rather than
  to a wrong one or a crash.
*/

const EVENT_ID = '3f8e8410-bda0-4ca5-b25b-ca2575c1b4ed';

describe('parseStartPayload', () => {
  it('splits a slug and an event id', () => {
    expect(parseStartPayload(`guide_${EVENT_ID}`)).toEqual({
      slug: 'guide',
      eventId: EVENT_ID,
    });
  });

  it('accepts a bare slug with no attribution', () => {
    expect(parseStartPayload('guide')).toEqual({ slug: 'guide', eventId: null });
  });

  it('treats an empty payload as a plain start', () => {
    expect(parseStartPayload('')).toEqual({ slug: '', eventId: null });
    expect(parseStartPayload('   ')).toEqual({ slug: '', eventId: null });
  });

  it('lowercases the slug, since Telegram links get retyped by hand', () => {
    expect(parseStartPayload('GUIDE').slug).toBe('guide');
    expect(parseStartPayload(`Guide_${EVENT_ID}`).slug).toBe('guide');
  });

  it('keeps the event id case-insensitive but verbatim', () => {
    const upper = EVENT_ID.toUpperCase();
    expect(parseStartPayload(`guide_${upper}`).eventId).toBe(upper);
  });

  /*
    A malformed id must not be stored. It would either dangle as a foreign key
    or, worse, silently point somewhere real.
  */
  it('drops an event id that is not a uuid', () => {
    expect(parseStartPayload('guide_notauuid').eventId).toBeNull();
    expect(parseStartPayload('guide_12345').eventId).toBeNull();
    expect(parseStartPayload(`guide_${EVENT_ID}extra`).eventId).toBeNull();
    expect(parseStartPayload(`guide_${EVENT_ID.slice(0, -1)}`).eventId).toBeNull();
  });

  it('keeps the slug even when the attribution half is junk', () => {
    expect(parseStartPayload('guide_garbage')).toEqual({ slug: 'guide', eventId: null });
  });

  /*
    An unusable slug resolves to the default funnel rather than to silence, so
    rejecting it here is what routes the visitor somewhere sensible.
  */
  it('rejects a slug the database would never have stored', () => {
    expect(parseStartPayload('g').slug).toBe('');
    expect(parseStartPayload('слово').slug).toBe('');
    expect(parseStartPayload('a'.repeat(25)).slug).toBe('');
    expect(parseStartPayload('has-dash').slug).toBe('');
  });

  it('splits on the first underscore only', () => {
    // The slug alphabet excludes `_`, so a second one belongs to the junk half.
    expect(parseStartPayload(`guide_${EVENT_ID}_extra`)).toEqual({
      slug: 'guide',
      eventId: null,
    });
  });

  it('survives a payload that is only a separator', () => {
    expect(parseStartPayload('_')).toEqual({ slug: '', eventId: null });
    expect(parseStartPayload(`_${EVENT_ID}`)).toEqual({ slug: '', eventId: EVENT_ID });
  });
});

describe('buildStartPayload', () => {
  it('round-trips through the parser', () => {
    const payload = buildStartPayload('guide', EVENT_ID);
    expect(parseStartPayload(payload)).toEqual({ slug: 'guide', eventId: EVENT_ID });
  });

  it('omits the separator when there is nothing to attribute', () => {
    expect(buildStartPayload('guide', null)).toBe('guide');
    expect(buildStartPayload('guide')).toBe('guide');
  });

  /* Telegram rejects a start parameter longer than 64 characters, and slug
     plus separator plus UUID is 61 at the maximum slug length. */
  it('stays inside Telegram 64-character limit at the longest slug', () => {
    expect(buildStartPayload('a'.repeat(24), EVENT_ID)).toHaveLength(61);
  });
});
