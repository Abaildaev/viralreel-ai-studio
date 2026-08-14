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

/** Polls the container until Instagram finishes transcoding the upload. */
export async function waitForProcessing(
  containerId: string,
  accessToken: string,
  maxAttempts = 12,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkContainerStatus(containerId, accessToken);
    if (status === "FINISHED") return true;
    if (status === "ERROR") return false;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}
