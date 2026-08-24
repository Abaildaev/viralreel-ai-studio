import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";
import { notifyUser } from "../_shared/telegram.ts";
import { checkInstagramToken } from "../_shared/instagram.ts";
import { decryptCredential } from "../_shared/credentials.ts";
import { callTelegram, describeTelegramError } from "../_shared/telegram-api.ts";
import { clearBotFault, reportBotFault } from "../_shared/bot-health.ts";

/**
 * Proactive health check for the Telegram funnel.
 *
 * The webhook reports faults it runs into, but it only runs when someone
 * writes to the bot — and the failure that matters most is Telegram no longer
 * calling it at all. Nothing inside the webhook can notice its own absence, so
 * the state is polled from the outside once a day.
 */
async function checkTelegramBots(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const { data: bots } = await supabase
    .from("telegram_bots")
    .select("id,user_id,bot_token_encrypted,channel_id,channel_title,health_alert_at")
    .eq("is_active", true);

  for (const bot of bots ?? []) {
    try {
      const botToken = await decryptCredential(bot.bot_token_encrypted as string);
      const faults: string[] = [];

      const info = await callTelegram<{
        url: string;
        last_error_message?: string;
        pending_update_count?: number;
      }>(botToken, "getWebhookInfo");

      if (!info.url) {
        faults.push("Вебхук не зарегистрирован — бот не получает сообщения. Нажмите «Переустановить вебхук».");
      } else if (info.last_error_message) {
        faults.push(`Telegram не может достучаться до вебхука: ${info.last_error_message}`);
      }

      // The check that catches a demoted bot: reading the channel's own record
      // needs the same rights that reading a member's does.
      if (bot.channel_id) {
        const me = await callTelegram<{ id: number }>(botToken, "getMe");
        try {
          const member = await callTelegram<{ status: string }>(botToken, "getChatMember", {
            chat_id: bot.channel_id,
            user_id: me.id,
          });
          if (member.status !== "administrator" && member.status !== "creator") {
            faults.push(
              `Бот больше не администратор канала «${bot.channel_title || bot.channel_id}» — проверка подписки не работает, и материал не выдаётся никому.`,
            );
          }
        } catch (error) {
          faults.push(`Канал недоступен боту: ${describeTelegramError(error)}`);
        }
      }

      if (faults.length > 0) {
        await reportBotFault(supabase, bot as any, faults.join("\n\n"));
      } else {
        await clearBotFault(supabase, bot.id as string);
      }
    } catch (error) {
      await reportBotFault(supabase, bot as any, describeTelegramError(error));
    }
  }

  return (bots ?? []).length;
}

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

    /*
      And now the question the calendar cannot answer: does the token still
      work? Nothing about a revoked token, a withdrawn permission or a
      restricted account moves the stored expiry date, so an account can fail
      for weeks while this job reports it healthy.

      An account is only switched off when Meta says the token itself is bad.
      A rate limit or an outage leaves it alone: the platform being busy is not
      the same as the account being disconnected, and disconnecting on the
      first bad minute would create the outage it was meant to warn about.
    */
    const { data: liveAccounts } = await supabase
      .from("instagram_accounts")
      .select("id, user_id, username, ig_user_id, access_token")
      .eq("is_active", true);

    let revoked = 0;

    for (const acc of (liveAccounts || [])) {
      const check = await checkInstagramToken(
        String(acc.ig_user_id ?? ""),
        String(acc.access_token ?? ""),
      );

      if (check.valid || check.inconclusive) {
        if (check.inconclusive) {
          console.warn(`Token check for @${acc.username} was inconclusive: ${check.reason}`);
        }
        continue;
      }

      await notifyUser(
        supabase,
        acc.user_id,
        `🔥 <b>Instagram больше не принимает токен</b>\n\nАккаунт: @${acc.username} отключён.\n\nПричина: ${check.reason}\n\nПереподключите аккаунт в разделе «Аккаунты» — до этого автоответы и автопубликация работать не будут.`,
      );

      await supabase
        .from("instagram_accounts")
        .update({ is_active: false })
        .eq("id", acc.id);

      revoked++;
    }

    const telegramChecked = await checkTelegramBots(supabase);

    return new Response(JSON.stringify({ success: true, checked: (expiringAccounts?.length || 0) + (expiredAccounts?.length || 0), verified: liveAccounts?.length || 0, revoked, alerts: notificationsSent + revoked, telegramBotsChecked: telegramChecked }), {
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
