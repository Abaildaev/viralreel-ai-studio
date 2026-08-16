/*
  The Telegram deep-link payload, in one place.

  `t.me/<bot>?start=<slug>_<automation_event_id>` is the seam between the
  Instagram half of the funnel and the Telegram half. Both sides have to agree
  on how it is spelled, and the parser has to stay honest about what it will
  accept — the payload arrives from the open internet, so anyone can type one.

  No imports on purpose: this module is loaded by the Deno webhook and by the
  browser bundle, and it is the one piece of funnel logic covered by tests.
*/

/** Telegram allows 64 characters of [A-Za-z0-9_-] after `?start=`. */
export const MAX_PAYLOAD_LENGTH = 64;

/**
 * Slugs are restricted to lowercase letters and digits so the first underscore
 * is an unambiguous separator — a UUID never contains one.
 */
export const SLUG_PATTERN = /^[a-z0-9]{2,24}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StartPayload {
  /** Empty when the visitor arrived on a bare /start. */
  slug: string;
  /** The automation event to attribute this subscriber to, when trustworthy. */
  eventId: string | null;
}

/**
 * Splits a start payload into its slug and attribution halves.
 *
 * Anything that is not a well-formed UUID after the separator is discarded
 * rather than stored: an unparseable id would become a dangling reference, and
 * a wrong one would misattribute a subscriber to another campaign.
 */
export function parseStartPayload(payload: string): StartPayload {
  const trimmed = payload.trim();
  if (!trimmed) return { slug: "", eventId: null };

  const separator = trimmed.indexOf("_");
  if (separator === -1) {
    const slug = trimmed.toLowerCase();
    return { slug: SLUG_PATTERN.test(slug) ? slug : "", eventId: null };
  }

  const slug = trimmed.slice(0, separator).toLowerCase();
  const rest = trimmed.slice(separator + 1);

  return {
    slug: SLUG_PATTERN.test(slug) ? slug : "",
    eventId: UUID_PATTERN.test(rest) ? rest : null,
  };
}

/** Builds the link that goes into the Instagram rule's button. */
export function buildStartPayload(slug: string, eventId?: string | null): string {
  return eventId ? `${slug}_${eventId}` : slug;
}
