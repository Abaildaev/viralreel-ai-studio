import { getAuthenticatedHeaders } from '../lib/supabase';

export interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
}

/**
 * The account's recent posts, straight from the Graph API.
 *
 * A media id is not a web address and cannot be turned into one by hand — the
 * public URL is built from a shortcode Instagram never derives from the id, so
 * `permalink` has to be asked for. The token lives on the server, which is why
 * this goes through the Edge Function rather than calling Graph directly.
 *
 * Throws with Instagram's own wording so callers can show it; the API returns
 * the 50 most recent items.
 */
export async function listInstagramMedia(accountId: string): Promise<InstagramMediaItem[]> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-instagram-media`,
    {
      method: 'POST',
      headers: await getAuthenticatedHeaders(),
      body: JSON.stringify({ account_id: accountId }),
    },
  );

  const json = await response.json().catch(() => null);
  if (!response.ok || json?.error) {
    throw new Error(json?.error || `Instagram вернул ошибку (${response.status})`);
  }
  return (json.media ?? []) as InstagramMediaItem[];
}
