import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ valid: false, error: "POST request required" }, 400);
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse({ valid: false, error: "Authentication required" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const accountId = typeof body.account_id === "string" ? body.account_id : "";
    if (!accountId) {
      return jsonResponse({ valid: false, error: "Missing account_id" }, 400);
    }

    // The browser never holds the token: look it up here, scoped to the caller.
    const supabase = createAdminClient();
    const { data: account, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("id,ig_user_id,access_token")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account?.access_token || !account.ig_user_id) {
      return jsonResponse({ valid: false, error: "Instagram account not found" }, 404);
    }

    const accessToken = account.access_token;
    const isInstagramLogin = accessToken.startsWith("IGAA");
    const baseUrl = isInstagramLogin
      ? "https://graph.instagram.com/v26.0"
      : "https://graph.facebook.com/v26.0";
    const fields = isInstagramLogin
      ? "id,user_id,username,name,profile_picture_url,followers_count,media_count"
      : "id,username,name,profile_picture_url,followers_count,media_count";

    const response = await fetch(`${baseUrl}/${account.ig_user_id}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();

    if (data.error) {
      return jsonResponse({
        valid: false,
        error: data.error.message,
        error_code: data.error.code,
        error_type: data.error.type,
      });
    }

    if (data.profile_picture_url) {
      await supabase
        .from("instagram_accounts")
        .update({ profile_picture_url: data.profile_picture_url })
        .eq("id", account.id);
    }

    return jsonResponse({
      valid: true,
      account_info: {
        id: data.id,
        username: data.username,
        name: data.name,
        profile_picture_url: data.profile_picture_url,
        followers_count: data.followers_count,
        media_count: data.media_count,
      },
    });
  } catch (error: any) {
    console.error("Verification error:", error);
    return jsonResponse({ valid: false, error: error.message }, 500);
  }
});
