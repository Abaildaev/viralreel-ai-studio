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
  const accountId = typeof body.account_id === "string" ? body.account_id : null;
  const supabase = createAdminClient();

  let query = supabase
    .from("instagram_accounts")
    .select("id,ig_user_id,access_token,username")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (accountId) query = query.eq("id", accountId);

  const { data: accounts, error } = await query;
  if (error) return response({ error: error.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const account of accounts ?? []) {
    try {
      if (!String(account.access_token).startsWith("IGAA")) {
        throw new Error("Требуется подключение через Instagram Login (токен IGAA)");
      }

      const apiResponse = await fetch(
        `https://graph.instagram.com/v26.0/${account.ig_user_id}/subscribed_apps`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${account.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subscribed_fields: "comments,messages,messaging_postbacks" }),
        },
      );
      const data = await apiResponse.json();
      if (!apiResponse.ok || data.error || data.success !== true) {
        throw new Error(data?.error?.message ?? `Instagram API returned HTTP ${apiResponse.status}`);
      }

      await supabase
        .from("instagram_accounts")
        .update({ webhook_subscribed_at: new Date().toISOString(), webhook_error: null })
        .eq("id", account.id);
      results.push({ account_id: account.id, username: account.username, success: true });
    } catch (subscriptionError) {
      const message = subscriptionError instanceof Error
        ? subscriptionError.message
        : String(subscriptionError);
      await supabase
        .from("instagram_accounts")
        .update({ webhook_error: message })
        .eq("id", account.id);
      results.push({ account_id: account.id, username: account.username, success: false, error: message });
    }
  }

  const failed = results.filter((result) => !result.success);
  return response({ success: failed.length === 0, results }, failed.length === results.length && results.length > 0 ? 400 : 200);
});
