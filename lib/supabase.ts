import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getAuthenticatedHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Требуется авторизация');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

/**
 * Columns of `instagram_accounts` the browser is allowed to read. `access_token`
 * is deliberately absent: column-level grants make `select('*')` fail, so every
 * query has to go through this list.
 */
export const INSTAGRAM_ACCOUNT_COLUMNS =
  'id,user_id,account_name,username,ig_user_id,profile_picture_url,is_active,webhook_subscribed_at,webhook_error,created_at,updated_at';

const SIGNED_URL_TTL_SECONDS = 3600;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Storage buckets are private, so media is reachable only through a short-lived
 * signed URL. Results are cached until shortly before they expire to avoid
 * re-signing the same object on every render.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const cacheKey = `${bucket}/${path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw error ?? new Error(`Не удалось подписать ссылку на ${cacheKey}`);
  }

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000,
  });
  return data.signedUrl;
}

export interface Profile {
  id: string;
  email: string;
  ig_user_id: string | null;
  ig_access_token: string | null;
  timezone: string;
  publish_start_hour: number;
  publish_end_hour: number;
  created_at: string;
  updated_at: string;
}

export interface PublishWindow {
  timezone: string;
  startHour: number;
  endHour: number;
}
