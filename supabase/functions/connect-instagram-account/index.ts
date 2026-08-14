import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AccountInfo {
  ig_user_id: string;
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count?: number;
  media_count?: number;
  token_to_store: string;
  supports_automation: boolean;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Token goes in the Authorization header so it stays out of access logs. */
async function graphJson(url: string, accessToken: string): Promise<any> {
  const graphResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await graphResponse.json();
  if (!graphResponse.ok || data.error) {
    throw new Error(data?.error?.message ?? `Meta API returned HTTP ${graphResponse.status}`);
  }
  return data;
}

async function inspectInstagramToken(token: string): Promise<AccountInfo> {
  if (token.startsWith("IGAA")) {
    const fields = "id,user_id,username,name,profile_picture_url,followers_count,media_count";
    const data = await graphJson(`https://graph.instagram.com/v26.0/me?fields=${fields}`, token);
    const profile = Array.isArray(data?.data) ? data.data[0] : data;
    if (!profile) throw new Error("Instagram не вернул данные профессионального аккаунта");
    return {
      ig_user_id: String(profile.user_id ?? profile.id),
      username: String(profile.username ?? profile.name ?? profile.user_id ?? profile.id),
      name: String(profile.name ?? profile.username ?? ""),
      profile_picture_url: String(profile.profile_picture_url ?? ""),
      followers_count: profile.followers_count,
      media_count: profile.media_count,
      token_to_store: token,
      supports_automation: true,
    };
  }

  // `access_token` here is a requested field of each page, not a credential.
  const pages = await graphJson(
    "https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token,instagram_business_account",
    token,
  );
  for (const page of pages?.data ?? []) {
    if (!page.instagram_business_account) continue;
    const pageToken = String(page.access_token ?? token);
    const igId = String(page.instagram_business_account.id);
    const profile = await graphJson(
      `https://graph.facebook.com/v26.0/${igId}?fields=id,username,name,profile_picture_url,followers_count,media_count`,
      pageToken,
    );
    return {
      ig_user_id: String(profile.id),
      username: String(profile.username ?? profile.name ?? profile.id),
      name: String(profile.name ?? profile.username ?? page.name ?? ""),
      profile_picture_url: String(profile.profile_picture_url ?? ""),
      followers_count: profile.followers_count,
      media_count: profile.media_count,
      token_to_store: pageToken,
      supports_automation: false,
    };
  }

  throw new Error(
    "Не найден профессиональный Instagram-аккаунт. Проверьте связь Instagram с Facebook Page.",
  );
}

async function subscribeToInstagramWebhooks(account: AccountInfo): Promise<string | null> {
  if (!account.supports_automation) {
    return "Автоответы требуют подключения через Instagram Login с токеном IGAA";
  }

  const subscriptionResponse = await fetch(
    `https://graph.instagram.com/v26.0/${account.ig_user_id}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.token_to_store}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subscribed_fields: "comments,messages" }),
    },
  );
  const subscription = await subscriptionResponse.json();
  if (!subscriptionResponse.ok || subscription.error || subscription.success !== true) {
    return subscription?.error?.message ?? `Instagram API returned HTTP ${subscriptionResponse.status}`;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const user = await getAuthenticatedUser(req);
  if (!user) return response({ error: "Войдите в приложение заново" }, 401);

  try {
    const body = await req.json();
    const token = typeof body.access_token === "string" ? body.access_token.trim() : "";
    const mode = body.mode === "connect" ? "connect" : "inspect";
    if (!token) return response({ error: "Access Token обязателен" }, 400);

    const account = await inspectInstagramToken(token);
    const accountInfo = {
      ig_user_id: account.ig_user_id,
      username: account.username,
      name: account.name,
      profile_picture_url: account.profile_picture_url,
      followers_count: account.followers_count,
      media_count: account.media_count,
      supports_automation: account.supports_automation,
    };

    if (mode === "inspect") return response({ account_info: accountInfo });

    const supabase = createAdminClient();
    const webhookError = await subscribeToInstagramWebhooks(account);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: savedAccount, error: saveError } = await supabase
      .from("instagram_accounts")
      .upsert({
        user_id: user.id,
        account_name: account.name || `@${account.username}`,
        username: account.username,
        ig_user_id: account.ig_user_id,
        access_token: account.token_to_store,
        profile_picture_url: account.profile_picture_url,
        is_active: true,
        token_expires_at: expiresAt,
        webhook_subscribed_at: webhookError ? null : now.toISOString(),
        webhook_error: webhookError,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id,ig_user_id" })
      .select("id,user_id,account_name,username,ig_user_id,profile_picture_url,is_active,created_at,updated_at,webhook_subscribed_at,webhook_error")
      .single();

    if (saveError) throw saveError;
    return response({
      success: true,
      account: savedAccount,
      account_info: accountInfo,
      automation_ready: !webhookError,
      automation_warning: webhookError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Instagram account connection failed", message);
    return response({ error: message }, 400);
  }
});
