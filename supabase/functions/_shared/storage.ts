import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Two hours covers Instagram's asynchronous ingestion (container creation plus
 * up to a minute of polling) with a wide margin, and Telegram fetches the file
 * immediately.
 */
const SIGNED_URL_TTL_SECONDS = 7200;

/**
 * The reels bucket is private. Publishing hands the platform a short-lived
 * signed URL instead of a permanent public one.
 */
export async function createSignedVideoUrl(
  supabase: SupabaseClient,
  videoPath: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("reels")
    .createSignedUrl(videoPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Не удалось подписать ссылку на видео: ${error?.message ?? "signed URL is empty"}`,
    );
  }

  return data.signedUrl;
}
