/*
  Who a broadcast goes to, described once.

  The composer shows a recipient count and the worker picks the audience, and
  until now each built its own query. Two implementations of one rule drift —
  the count promises 400 people and 380 receive it, or worse the other way
  round — and the drift is invisible until someone counts by hand.

  So the rule lives here as data, and both sides translate the same list into
  their own query. No imports: this module is loaded by the Deno worker and by
  the browser bundle, and it is covered by tests.
*/

export type BroadcastSegment =
  | "all"
  | "subscribed"
  | "delivered"
  | "not_delivered"
  | "from_instagram"
  | "funnel";

export type AudienceFilter =
  | { kind: "eq"; column: string; value: string | boolean }
  | { kind: "isNull"; column: string }
  | { kind: "notNull"; column: string };

/**
 * The filters that define a broadcast's audience, excluding the bot itself.
 *
 * Blocked and departed people are removed for every segment, not just some:
 * the count the owner reads before sending has to be the number who can
 * actually receive the message, or the reported delivery rate is a fiction.
 *
 * A `funnel` segment with no funnel chosen deliberately falls back to the
 * whole audience rather than to nobody, matching what the composer shows while
 * the select is still empty.
 */
export function audienceFilters(
  segment: BroadcastSegment,
  funnelId: string | null,
): AudienceFilter[] {
  const filters: AudienceFilter[] = [
    { kind: "eq", column: "is_blocked", value: false },
    { kind: "isNull", column: "unsubscribed_at" },
  ];

  switch (segment) {
    case "subscribed":
      filters.push({ kind: "notNull", column: "subscribed_at" });
      break;
    case "delivered":
      filters.push({ kind: "notNull", column: "delivered_at" });
      break;
    case "not_delivered":
      filters.push({ kind: "isNull", column: "delivered_at" });
      break;
    case "from_instagram":
      filters.push({ kind: "eq", column: "source", value: "instagram" });
      break;
    case "funnel":
      if (funnelId) filters.push({ kind: "eq", column: "funnel_id", value: funnelId });
      break;
    case "all":
      break;
  }

  return filters;
}

/**
 * The three builder methods these filters need, described without reference to
 * supabase-js. The two callers import that client from different registries —
 * npm in the browser, jsr in Deno — so their builder types are not the same
 * class and cannot be named here.
 */
interface QueryLike {
  eq(column: string, value: unknown): QueryLike;
  is(column: string, value: null): QueryLike;
  not(column: string, operator: string, value: null): QueryLike;
}

/**
 * Applies the filters to a PostgREST query builder, returning it unchanged in
 * type so the caller keeps its row typing.
 *
 * `T` is deliberately unconstrained. Constraining it structurally against the
 * builder makes TypeScript expand supabase-js's self-referential generics until
 * it gives up with "type instantiation is excessively deep" — the constraint
 * bought nothing but a compiler error.
 */
export function applyAudienceFilters<T>(query: T, filters: AudienceFilter[]): T {
  let result = query as unknown as QueryLike;

  for (const filter of filters) {
    if (filter.kind === "eq") result = result.eq(filter.column, filter.value);
    if (filter.kind === "isNull") result = result.is(filter.column, null);
    if (filter.kind === "notNull") result = result.not(filter.column, "is", null);
  }

  return result as unknown as T;
}
