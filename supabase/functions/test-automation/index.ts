import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";
import {
  pickDirectReply,
  keywordsOf,
  LEAD_MAGNET_COLUMNS,
  LeadMagnetRow,
  matchesKeyword,
  pickPublicReply,
  selectLeadMagnet,
  TriggerType,
} from "../_shared/keyword-match.ts";

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

/** Why a rule did not win, in the order the matcher checks things. */
function explain(
  leadMagnet: LeadMagnetRow,
  triggerType: TriggerType,
  text: string,
  mediaId?: string,
): string {
  const triggerEnabled = triggerType === "dm" ? leadMagnet.trigger_dm : leadMagnet.trigger_comments;
  if (!triggerEnabled) {
    return triggerType === "dm"
      ? "Выключен запуск по сообщениям в Direct"
      : "Выключен запуск по комментариям";
  }
  if (triggerType === "comment" && leadMagnet.media_scope === "selected") {
    if (!mediaId) return "Сценарий ограничен выбранными публикациями — укажите публикацию для проверки";
    if (!leadMagnet.media_ids?.includes(mediaId)) return "Эта публикация не входит в список выбранных";
  }
  const keywords = keywordsOf(leadMagnet);
  if (!keywords.some((keyword) => matchesKeyword(text, keyword, leadMagnet.match_mode))) {
    return leadMagnet.match_mode === "exact"
      ? `Режим «точное совпадение»: текст должен состоять только из ${keywords.join(" / ")}`
      : `Ни одно из слов не найдено: ${keywords.join(", ")}`;
  }
  return "Совпадение есть, но выше по списку сработал другой сценарий";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const user = await getAuthenticatedUser(req);
  if (!user) return response({ error: "Authentication required" }, 401);

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.account_id === "string" ? body.account_id : "";
  const text = typeof body.text === "string" ? body.text : "";
  const triggerType: TriggerType = body.trigger_type === "dm" ? "dm" : "comment";
  const mediaId = typeof body.media_id === "string" && body.media_id ? body.media_id : undefined;

  if (!accountId) return response({ error: "Выберите аккаунт" }, 400);
  if (!text.trim()) return response({ error: "Введите текст комментария или сообщения" }, 400);

  const supabase = createAdminClient();
  const { data: account, error: accountError } = await supabase
    .from("instagram_accounts")
    .select("id,user_id,username,access_token,is_active,webhook_subscribed_at,webhook_error")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) return response({ error: accountError.message }, 500);
  if (!account) return response({ error: "Аккаунт не найден" }, 404);

  // Everything that silently prevents the automation from ever firing.
  const blockers: string[] = [];
  if (!account.is_active) blockers.push("Аккаунт отключён в разделе «Аккаунты»");
  if (!String(account.access_token ?? "").startsWith("IGAA")) {
    blockers.push("Токен получен через Facebook — для автоответов нужен Instagram Login (IGAA)");
  }
  if (!account.webhook_subscribed_at) {
    blockers.push("Аккаунт не подписан на webhook — Instagram не пришлёт события");
  }
  if (account.webhook_error) blockers.push(`Ошибка подписки: ${account.webhook_error}`);

  const { data: rows, error: rulesError } = await supabase
    .from("lead_magnets")
    .select(LEAD_MAGNET_COLUMNS)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .or(`instagram_account_id.eq.${account.id},instagram_account_id.is.null`);

  if (rulesError) return response({ error: rulesError.message }, 500);

  const leadMagnets = (rows ?? []) as LeadMagnetRow[];
  const match = selectLeadMagnet(leadMagnets, { triggerType, text, mediaId });
  /* Picked once, so the panel reports the words and the button that would
     actually travel together rather than two independent draws. */
  const directReply = match ? pickDirectReply(match.leadMagnet) : null;

  return response({
    blockers,
    matched: match
      ? {
        id: match.leadMagnet.id,
        title: match.leadMagnet.title,
        keyword: match.keyword,
        delay_seconds: match.leadMagnet.reply_delay_seconds ?? 0,
        direct_text: directReply!.text,
        button_text: match.leadMagnet.response_url.trim() ? directReply!.buttonText : null,
        response_url: match.leadMagnet.response_url.trim() || null,
        public_reply: triggerType === "comment" && match.leadMagnet.public_reply_enabled
          ? pickPublicReply(match.leadMagnet)
          : null,
        ab_test: triggerType === "comment" && match.leadMagnet.ab_quick_reply_percent > 0
          ? {
            quick_reply_percent: match.leadMagnet.ab_quick_reply_percent,
            quick_reply_text: match.leadMagnet.ab_quick_reply_text,
            quick_reply_button: match.leadMagnet.ab_quick_reply_button,
          }
          : null,
      }
      : null,
    considered: leadMagnets
      .filter((leadMagnet) => leadMagnet.id !== match?.leadMagnet.id)
      .map((leadMagnet) => ({
        id: leadMagnet.id,
        title: leadMagnet.title,
        reason: explain(leadMagnet, triggerType, text, mediaId),
      })),
  });
});
