import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";
import { describeInstagramError, InstagramApiError } from "../_shared/instagram.ts";

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

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "send";
  const instagramAccountId = typeof body?.instagramAccountId === "string" ? body.instagramAccountId : "";
  const senderIgsid = typeof body?.senderIgsid === "string" ? body.senderIgsid : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!instagramAccountId || !senderIgsid || (action === "send" && (!text || text.length > 1000))) {
    return response({ error: "Некорректное сообщение" }, 400);
  }

  const supabase = createAdminClient();
  const { data: account, error: accountError } = await supabase
    .from("instagram_accounts")
    .select("id,ig_user_id,access_token,is_active")
    .eq("id", instagramAccountId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (accountError || !account) return response({ error: "Instagram-аккаунт не найден" }, 404);
  if (!String(account.access_token).startsWith("IGAA")) {
    return response({ error: "Переподключите аккаунт через Instagram Login" }, 400);
  }

  if (action === "resume") {
    const { error } = await supabase
      .from("ai_sales_messages")
      .update({ handed_off: false })
      .eq("instagram_account_id", account.id)
      .eq("sender_igsid", senderIgsid);
    return error
      ? response({ error: "Не удалось вернуть диалог ИИ" }, 500)
      : response({ resumed: true });
  }

  if (action !== "send") return response({ error: "Unsupported action" }, 400);

  try {
    const graphResponse = await fetch(`${GRAPH_API_BASE_URL}/${account.ig_user_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient: { id: senderIgsid }, message: { text } }),
    });
    const data = await graphResponse.json().catch(() => null);
    if (!graphResponse.ok || data?.error) {
      throw new InstagramApiError(
        data?.error?.message ?? `Instagram API returned HTTP ${graphResponse.status}`,
        data?.error?.code,
        data?.error?.error_subcode,
      );
    }

    const { error: insertError } = await supabase.from("ai_sales_messages").insert({
      instagram_account_id: account.id,
      sender_igsid: senderIgsid,
      role: "agent",
      content: text,
      detected_intent: "manual_reply",
      handed_off: true,
    });
    if (insertError) console.error("Could not persist manual Instagram reply", insertError);

    return response({ messageId: String(data?.message_id ?? "") });
  } catch (error) {
    return response({ error: describeInstagramError(error) }, 502);
  }
});
