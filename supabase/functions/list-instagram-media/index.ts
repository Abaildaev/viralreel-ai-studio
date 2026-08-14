import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const user = await getAuthenticatedUser(req);
  if (!user) return response({ error: "Authentication required" }, 401);

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.account_id === "string" ? body.account_id : "";
  if (!accountId) return response({ error: "Instagram account is required" }, 400);

  const supabase = createAdminClient();
  const { data: account, error } = await supabase
    .from("instagram_accounts")
    .select("ig_user_id,access_token")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return response({ error: error.message }, 500);
  if (!account) return response({ error: "Instagram account not found" }, 404);

  const fields = "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp";
  const graphResponse = await fetch(
    `https://graph.instagram.com/v26.0/${account.ig_user_id}/media?fields=${fields}&limit=50`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  const graphData = await graphResponse.json();
  if (!graphResponse.ok || graphData.error) {
    return response({ error: graphData?.error?.message ?? `Instagram API returned HTTP ${graphResponse.status}` }, 400);
  }

  return response({
    media: (graphData.data ?? []).map((item: Record<string, unknown>) => ({
      id: String(item.id ?? ""),
      caption: String(item.caption ?? ""),
      media_type: String(item.media_type ?? ""),
      media_product_type: String(item.media_product_type ?? ""),
      thumbnail_url: String(item.thumbnail_url ?? item.media_url ?? ""),
      permalink: String(item.permalink ?? ""),
      timestamp: String(item.timestamp ?? ""),
    })),
  });
});
