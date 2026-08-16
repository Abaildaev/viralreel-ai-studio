/*
  Telling the owner that the funnel has stopped working.

  A broken Telegram funnel fails silently and expensively: if the bot is
  demoted in the channel, `getChatMember` starts erroring, every visitor is
  treated as unsubscribed, and nobody receives the material — while the
  interface still shows a connected bot and a healthy webhook. The leads keep
  arriving from Instagram and keep hitting a wall.

  So a fault is pushed rather than waiting to be noticed, through the same
  Telegram notification channel that already warns about expiring Instagram
  tokens.
*/

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { notifyUser } from "./telegram.ts";

/*
  A fault repeats on every incoming message, so the alert has to be rate
  limited or a broken channel turns into a flood. Six hours is short enough to
  re-warn within a working day and long enough not to nag.
*/
const ALERT_COOLDOWN_HOURS = 6;

export interface HealthTrackedBot {
  id: string;
  user_id: string;
  health_alert_at?: string | null;
}

/**
 * Records a fault and tells the owner, at most once per cooldown.
 *
 * Never throws: this runs inside the update handler, and failing to deliver a
 * warning must not also cost the lead that triggered it.
 */
export async function reportBotFault(
  supabase: SupabaseClient,
  bot: HealthTrackedBot,
  message: string,
): Promise<void> {
  const now = new Date();

  try {
    const lastAlert = bot.health_alert_at ? new Date(bot.health_alert_at) : null;
    const due = !lastAlert ||
      now.getTime() - lastAlert.getTime() > ALERT_COOLDOWN_HOURS * 60 * 60 * 1000;

    await supabase
      .from("telegram_bots")
      .update({
        last_error: message,
        ...(due ? { health_alert_at: now.toISOString() } : {}),
        updated_at: now.toISOString(),
      })
      .eq("id", bot.id);

    if (!due) return;

    await notifyUser(
      supabase,
      bot.user_id,
      `🔴 <b>Воронка в Telegram не работает</b>\n\n${message}\n\n` +
        `Пока это не исправлено, люди из Instagram доходят до бота, но материал не получают.`,
    );
  } catch (error) {
    console.error("Could not report Telegram bot fault", error);
  }
}

/**
 * Marks the bot healthy again after a successful check.
 *
 * Clearing `health_alert_at` as well as the message means the next fault is
 * announced immediately instead of waiting out a cooldown started by the
 * previous one.
 */
export async function clearBotFault(
  supabase: SupabaseClient,
  botId: string,
): Promise<void> {
  try {
    await supabase
      .from("telegram_bots")
      .update({
        last_error: null,
        health_alert_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", botId)
      .not("last_error", "is", null);
  } catch (error) {
    console.error("Could not clear Telegram bot fault", error);
  }
}
