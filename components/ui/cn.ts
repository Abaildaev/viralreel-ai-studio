/**
 * Joins class names, dropping anything falsy. Small enough not to justify a
 * dependency, and every primitive in this folder needs it so callers can pass
 * a `className` that composes rather than replaces.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
