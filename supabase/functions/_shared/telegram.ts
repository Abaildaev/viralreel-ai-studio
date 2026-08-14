import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Best-effort publish notification. A broken or disabled Telegram integration
 * must never fail the Instagram publish that triggered it, so every error is
 * logged and swallowed.
 */
export async function notifyUser(
  supabase: SupabaseClient,
  userId: string,
  message: string,
): Promise<void> {
  try {
    const { data: settings } = await supabase
      .from("telegram_settings")
      .select("bot_token, chat_id, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.is_active || !settings.bot_token || !settings.chat_id) return;

    await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.chat_id,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    console.error("Failed to send Telegram message", error);
  }
}
