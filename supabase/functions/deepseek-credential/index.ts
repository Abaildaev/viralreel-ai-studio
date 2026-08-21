import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";
import { decryptCredential, encryptCredential } from "../_shared/credentials.ts";

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
  const action = String(body?.action ?? "");
  const supabase = createAdminClient();

  if (action === "status") {
    const { data, error } = await supabase
      .from("user_ai_credentials")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return response({ error: "Could not check credential status" }, 500);
    return response({ configured: Boolean(data) });
  }

  if (action === "clear") {
    const { error } = await supabase.from("user_ai_credentials").delete().eq("user_id", user.id);
    if (error) return response({ error: "Could not remove credential" }, 500);
    return response({ configured: false });
  }

  if (action === "complete") {
    const request = body?.request;
    const messages = Array.isArray(request?.messages) ? request.messages : [];
    const totalMessageLength = messages.reduce(
      (sum: number, message: unknown) => sum + String((message as { content?: unknown })?.content ?? "").length,
      0,
    );
    if (
      !request
      || typeof request !== "object"
      || messages.length === 0
      || messages.length > 60
      || totalMessageLength > 80_000
    ) {
      return response({ error: "Invalid DeepSeek request" }, 400);
    }

    const { data: credential, error: credentialError } = await supabase
      .from("user_ai_credentials")
      .select("deepseek_api_key_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (credentialError) return response({ error: "Could not load DeepSeek credential" }, 500);
    if (!credential?.deepseek_api_key_encrypted) {
      return response({ error: "Ключ DeepSeek не сохранён в защищённом хранилище" }, 404);
    }

    try {
      const apiKey = await decryptCredential(credential.deepseek_api_key_encrypted);
      const upstream = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
      });
      const data = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        return response(
          { error: data?.error?.message ?? `DeepSeek API error (${upstream.status})` },
          upstream.status,
        );
      }
      return response(data);
    } catch (error) {
      console.error("DeepSeek completion proxy failed", error);
      return response({ error: "Could not call DeepSeek" }, 502);
    }
  }

  if (action !== "save") return response({ error: "Unsupported action" }, 400);

  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey || apiKey.length > 500) return response({ error: "Invalid API key" }, 400);

  try {
    const { error } = await supabase.from("user_ai_credentials").upsert({
      user_id: user.id,
      deepseek_api_key_encrypted: await encryptCredential(apiKey),
      updated_at: new Date().toISOString(),
    });
    if (error) return response({ error: "Could not save credential" }, 500);
    return response({ configured: true });
  } catch (error) {
    console.error("Could not encrypt DeepSeek credential", error);
    return response({ error: "Secure credential storage is not configured" }, 503);
  }
});
