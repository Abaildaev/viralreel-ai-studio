/** Turns native errors and Supabase/PostgREST error objects into user text. */
export function getErrorMessage(error: unknown, fallback = 'Произошла ошибка'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
