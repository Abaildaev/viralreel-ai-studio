import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";

const GRAPH_API_BASE_URL = "https://graph.instagram.com/v26.0";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const user = await getAuthenticatedUser(req);
  if (!user) return response({ error: "Unauthorized" }, 401);

  const supabase = createAdminClient();
  const { data: accounts, error: accountError } = await supabase
    .from("instagram_accounts")
    .select("id,access_token")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (accountError) return response({ error: "Could not load Instagram accounts" }, 500);

  const accountIds = (accounts ?? []).map((account) => account.id);
  if (accountIds.length === 0) return response({ synced: 0 });

  const { data: messages, error: messageError } = await supabase
    .from("ai_sales_messages")
    .select("instagram_account_id,sender_igsid")
    .in("instagram_account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(300);
  if (messageError) return response({ error: "Could not load conversations" }, 500);

  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account.access_token]));
  const uniqueThreads = new Map<string, { instagram_account_id: string; sender_igsid: string }>();
  for (const message of messages ?? []) {
    uniqueThreads.set(`${message.instagram_account_id}:${message.sender_igsid}`, message);
  }

  let synced = 0;
  for (const thread of [...uniqueThreads.values()].slice(0, 50)) {
    const accessToken = accountMap.get(thread.instagram_account_id);
    if (!accessToken) continue;

    const graphResponse = await fetch(
      `${GRAPH_API_BASE_URL}/${thread.sender_igsid}?fields=name,username,profile_pic`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const profile = await graphResponse.json().catch(() => null);
    if (!graphResponse.ok || profile?.error) continue;

    const { error } = await supabase.from("instagram_contacts").upsert({
      instagram_account_id: thread.instagram_account_id,
      sender_igsid: thread.sender_igsid,
      username: profile?.username ?? null,
      display_name: profile?.name ?? null,
      profile_picture_url: profile?.profile_pic ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "instagram_account_id,sender_igsid" });
    if (!error) synced += 1;
  }

  return response({ synced });
});
