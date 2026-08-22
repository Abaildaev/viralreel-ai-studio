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
