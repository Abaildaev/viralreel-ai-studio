import { getAuthenticatedHeaders } from '../lib/supabase';

/*
  Instagram hands out avatars as a signed CDN link that stops working after a
  day or two, and `instagram_accounts.profile_picture_url` stores that link
  verbatim. The browser that connected the account keeps painting the picture
  out of its own HTTP cache long after the link is dead, so the breakage shows
  up only on a device that has to fetch it for real — which is why it read as
  "the avatar does not load in a new browser".

  Verification re-reads the profile from the Graph API and writes the fresh URL
  back to the row, so a failed <img> can repair its own source instead of
  falling back to an initial letter until somebody presses «Проверить» on the
  accounts page.
*/

/*
  One attempt per account for the lifetime of the page. A dead URL fails in
  every avatar of that account at once, and a URL that is still dead after the
  refresh must not start the cycle again — so the promise is kept, not cleared.
*/
const attempts = new Map<string, Promise<string | null>>();

/**
 * Re-reads the account's avatar from Instagram and stores it.
 *
 * Resolves to the fresh URL, or `null` when the token can no longer read the
 * profile — the caller is expected to fall back rather than retry.
 */
export function refreshAccountAvatar(accountId: string): Promise<string | null> {
  const started = attempts.get(accountId);
  if (started) return started;

  const attempt = (async () => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-instagram-token`,
      {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({ account_id: accountId }),
      },
    );

    const result = await response.json();
    return result?.valid ? (result.account_info?.profile_picture_url ?? null) : null;
  })().catch(() => null);

  attempts.set(accountId, attempt);
  return attempt;
}
