const GRAPH_API_VERSION = "v26.0";

/**
 * Instagram Login issues user tokens prefixed with `IGAA`, which are served by
 * graph.instagram.com. Facebook Login page tokens go to graph.facebook.com.
 */
export function getGraphBaseUrl(accessToken: string): string {
  return accessToken.startsWith("IGAA")
    ? `https://graph.instagram.com/${GRAPH_API_VERSION}`
    : `https://graph.facebook.com/${GRAPH_API_VERSION}`;
}

/**
 * The token travels in the Authorization header, never in the query string, so
 * it cannot end up in proxy or CDN access logs.
 */
async function graphRequest(
  url: string,
  accessToken: string,
  params?: URLSearchParams,
): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (params) headers["Content-Type"] = "application/x-www-form-urlencoded";

  const response = await fetch(url, {
    method: params ? "POST" : "GET",
    headers,
    body: params,
  });

  const data = await response.json().catch(() => null);
  if (data?.error) throw new Error(data.error.message);
  if (!response.ok) {
    throw new Error(`Instagram API returned HTTP ${response.status}`);
  }
  return data;
}

export async function createReelsContainer(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  const data = await graphRequest(
    `${getGraphBaseUrl(accessToken)}/${igUserId}/media`,
    accessToken,
    new URLSearchParams({ media_type: "REELS", video_url: videoUrl, caption }),
  );
  return data.id;
}

export async function checkContainerStatus(
  containerId: string,
  accessToken: string,
): Promise<string> {
  const data = await graphRequest(
    `${getGraphBaseUrl(accessToken)}/${containerId}?fields=status_code`,
    accessToken,
  );
  return data.status_code;
}

export async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string,
): Promise<string> {
  const data = await graphRequest(
    `${getGraphBaseUrl(accessToken)}/${igUserId}/media_publish`,
    accessToken,
    new URLSearchParams({ creation_id: containerId }),
  );
  return data.id;
}

/** Shared processing/retry policy for cron and manual publication. */
export const VIDEO_PROCESSING_POLL_ATTEMPTS = 18; // 90 seconds at 5s intervals
export const VIDEO_PUBLISH_RETRY_LIMIT = 3;
export const VIDEO_PUBLISH_RETRY_DELAY_MS = 5 * 60 * 1000;
export const VIDEO_PROCESSING_ERROR =
  "Ошибка Facebook: Видео не прошло внутреннюю обработку (Video processing failed or timed out)";

export function isVideoProcessingFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("video processing")
    || normalized.includes("видео не прошло")
    || normalized.includes("видео не прошло обработку");
}

/** Carries Meta's numeric codes so callers can explain the failure. */
export interface InstagramProfile {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

export interface InstagramTokenCheck {
  valid: boolean;
  /** Meta's verdict, in words the account owner can act on. */
  reason?: string;
  code?: number;
  /**
   * Meta could not be reached, or answered with a fault of its own. That says
   * nothing about the token, and an account must never be switched off for it.
   */
  inconclusive?: boolean;
  profile?: InstagramProfile;
}

/*
  Rate limits and Meta's own outages. A token is not dead because the platform
  was busy, and treating those alike would disconnect a working account on the
  first bad minute.
*/
const TRANSIENT_META_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

/**
 * Asks Meta whether the token still works.
 *
 * The check used to be a comparison against the calendar: a token was healthy
 * if its stored expiry was in the future. Nothing about a revoked token, a
 * removed permission or a restricted account moves that date, so the one
 * signal the owner relies on stayed green through exactly the failures it
 * exists to announce.
 *
 * Shared rather than written twice: the button in the app and the nightly job
 * have to answer this question the same way, or one of them starts lying.
 */
export async function checkInstagramToken(
  igUserId: string,
  accessToken: string,
): Promise<InstagramTokenCheck> {
  if (!igUserId || !accessToken) {
    return { valid: false, reason: "Аккаунт не подключён: нет токена или идентификатора." };
  }

  const fields = accessToken.startsWith("IGAA")
    ? "id,user_id,username,name,profile_picture_url,followers_count,media_count"
    : "id,username,name,profile_picture_url,followers_count,media_count";

  let response: Response;
  try {
    response = await fetch(`${getGraphBaseUrl(accessToken)}/${igUserId}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    return {
      valid: false,
      inconclusive: true,
      reason: `Не удалось связаться с Instagram: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const data = await response.json().catch(() => ({}));

  if (data?.error) {
    const code = Number(data.error.code);
    const failure = new InstagramApiError(
      String(data.error.message ?? "Instagram отклонил запрос"),
      Number.isFinite(code) ? code : undefined,
      Number(data.error.error_subcode) || undefined,
    );

    return {
      valid: false,
      code: failure.code,
      reason: describeInstagramError(failure),
      inconclusive: failure.code !== undefined && TRANSIENT_META_CODES.has(failure.code),
    };
  }

  if (!response.ok) {
    return {
      valid: false,
      inconclusive: true,
      reason: `Instagram ответил ${response.status} без объяснения.`,
    };
  }

  return {
    valid: true,
    profile: {
      id: String(data.id ?? igUserId),
      username: data.username,
      name: data.name,
      profile_picture_url: data.profile_picture_url,
      followers_count: data.followers_count,
      media_count: data.media_count,
    },
  };
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

/**
 * Meta's messages are English, terse and often refer to internal concepts. The
 * automation log is read by the account owner, so store something actionable.
 */
export function describeInstagramError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code = error instanceof InstagramApiError ? error.code : undefined;
  const subcode = error instanceof InstagramApiError ? error.subcode : undefined;
  const haystack = raw.toLowerCase();

  const has = (...needles: string[]) => needles.some((needle) => haystack.includes(needle));

  if (code === 190 || has("access token", "session has expired", "oauthexception")) {
    return "Токен Instagram истёк или отозван — переподключите аккаунт в разделе «Аккаунты».";
  }
  if (subcode === 2534022 || has("user not found", "recipient not found")) {
    return "Instagram не нашёл получателя: возможно, аккаунт удалён или заблокировал вас.";
  }
  if (code === 551 || has("isn't available", "is not available", "cannot message")) {
    return "Пользователь закрыл личные сообщения или ограничил переписку — Direct доставить нельзя.";
  }
  if (subcode === 2534014 || has("outside of allowed window", "messaging window", "24 hours")) {
    return "Прошло больше 24 часов с сообщения пользователя — Instagram запрещает писать первым.";
  }
  if (has("already replied", "already sent a private reply")) {
    return "На этот комментарий уже отправлялся личный ответ — Instagram разрешает только один.";
  }
  if (code === 613 || code === 4 || code === 17 || code === 32 || has("rate limit", "too many")) {
    return "Достигнут лимит запросов Instagram — попробуйте позже или уменьшите частоту автоответов.";
  }
  if (has("permission", "not authorized", "insufficient")) {
    return "Не хватает прав приложения Meta: проверьте разрешения instagram_manage_messages и instagram_manage_comments.";
  }

  return raw;
}

/** Polls the container until Instagram finishes transcoding the upload. */
export async function waitForProcessing(
  containerId: string,
  accessToken: string,
  maxAttempts = VIDEO_PROCESSING_POLL_ATTEMPTS,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkContainerStatus(containerId, accessToken);
    if (status === "FINISHED") return true;
    if (status === "ERROR") return false;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}
