import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";
import { notifyUser } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!await hasValidCronSecret(req)) {
      return new Response(JSON.stringify({ error: "Cron authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createAdminClient();

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiringAccounts, error } = await supabase
      .from("instagram_accounts")
      .select("id, account_name, username, user_id, token_expires_at")
      .eq("is_active", true)
      .lte("token_expires_at", sevenDaysFromNow)
      .gt("token_expires_at", now.toISOString());

    if (error) throw error;

    let notificationsSent = 0;

    for (const acc of (expiringAccounts || [])) {
      const daysLeft = Math.ceil((new Date(acc.token_expires_at).getTime() - now.getTime()) / (1000 * 3600 * 24));
      
      await notifyUser(
        supabase,
        acc.user_id,
        `⚠️ <b>Внимание! Истекает токен Instagram</b>\n\nАккаунт: @${acc.username}\nОсталось дней: <b>${daysLeft}</b>\n\nПожалуйста, переподключите аккаунт в приложении, иначе автопубликация скоро перестанет работать!`
      );
      notificationsSent++;
    }

    // Also check ALREADY expired tokens to warn
    const { data: expiredAccounts } = await supabase
      .from("instagram_accounts")
      .select("id, account_name, username, user_id")
      .eq("is_active", true)
      .lte("token_expires_at", now.toISOString());

    for (const acc of (expiredAccounts || [])) {
      await notifyUser(
        supabase,
        acc.user_id,
        `🔥 <b>Токен Instagram истёк!</b>\n\nАккаунт: @${acc.username} отключен.\nАвтопубликация не работает. Срочно переподключите аккаунт в приложении!`
      );
      
      // Auto-deactivate the account to prevent failing cron jobs endlessly
      await supabase
        .from("instagram_accounts")
        .update({ is_active: false })
        .eq("id", acc.id);
        
      notificationsSent++;
    }

    return new Response(JSON.stringify({ success: true, checked: (expiringAccounts?.length || 0) + (expiredAccounts?.length || 0), alerts: notificationsSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Token check error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
