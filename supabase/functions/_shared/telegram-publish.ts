/*
  Posting a finished Reel to the owner's Telegram channel.

  Extracted so two callers can share it. `publish-telegram` is the manual path,
  driven from the browser. `auto-publish` mirrors a post to the channel the
  moment it lands on Instagram — which is the wiring this project was missing:
  the function existed and was deployed, but nothing ever called it, so the
  README had to admit that posts never reached the channel.

  Order matters more than it looks. `auto-publish` deletes the video from
  storage once Instagram has it, so the mirror has to happen while the file is
  still there. That is why this is a module and not another HTTP call.
*/

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Telegram rejects a caption longer than this. */
const MAX_CAPTION = 1024;

export interface TelegramChannel {
  bot_token: string;
  chat_id: string;
}

export interface TelegramPublishResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Numbered lines read as a list in the channel, so their titles are bolded. */
export function formatCaptionHtml(caption: string): string {
  return escapeHtml(caption).replace(
    /^(\d+\.\s+)(.+)$/gm,
    (_match: string, number: string, title: string) => `${number}<b>${title}</b>`,
  );
}

async function sendVideo(
  channel: TelegramChannel,
  videoUrl: string,
  caption?: string,
): Promise<TelegramPublishResult> {
  try {
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) return { ok: false, error: "Не удалось скачать видео для отправки" };

    const form = new FormData();
    form.append("chat_id", channel.chat_id);
    form.append("video", await videoResponse.blob(), "reel.mp4");
    form.append("supports_streaming", "true");
    form.append("width", "720");
    form.append("height", "1280");

    if (caption) {
      form.append(
        "caption",
        caption.length > MAX_CAPTION ? `${caption.slice(0, MAX_CAPTION - 3)}...` : caption,
      );
    }

    const response = await fetch(
      `https://api.telegram.org/bot${channel.bot_token}/sendVideo`,
      { method: "POST", body: form },
    );
    const data = await response.json();

    if (!data.ok) return { ok: false, error: data.description ?? "Unknown Telegram error" };
    return { ok: true, messageId: data.result.message_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function sendText(
  channel: TelegramChannel,
  text: string,
  replyToMessageId?: number,
): Promise<TelegramPublishResult> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${channel.bot_token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channel.chat_id,
          text,
          parse_mode: "HTML",
          ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}),
        }),
      },
    );
    const data = await response.json();

    if (!data.ok) return { ok: false, error: data.description ?? "Unknown Telegram error" };
    return { ok: true, messageId: data.result.message_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Sends the video, then the full caption as a reply to it.
 *
 * Two messages rather than one because Telegram caps a video caption at 1024
 * characters and a Reels description routinely runs longer. The hook rides
 * with the video so the channel preview reads well; the rest follows beneath.
 */
export async function publishReelToChannel(
  channel: TelegramChannel,
  videoUrl: string,
  hook: string | null,
  caption: string | null,
): Promise<TelegramPublishResult> {
  const video = await sendVideo(channel, videoUrl, hook?.trim() || undefined);
  if (!video.ok) return video;

  if (caption?.trim()) {
    const text = await sendText(channel, formatCaptionHtml(caption), video.messageId);
    // The video is in the channel either way; a failed caption is worth
    // reporting but not worth calling the publish a failure.
    if (!text.ok) {
      return { ok: true, messageId: video.messageId, error: `Описание не отправилось: ${text.error}` };
    }
  }

  return video;
}

/**
 * The owner's channel, if they configured one and left it switched on.
 *
 * Returns null rather than throwing when nothing is set up: for the automatic
 * mirror, "no Telegram configured" is the normal case, not an error.
 */
export async function loadChannel(
  supabase: SupabaseClient,
  userId: string,
): Promise<TelegramChannel | null> {
  const { data } = await supabase
    .from("telegram_settings")
    .select("bot_token, chat_id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.is_active || !data.bot_token || !data.chat_id) return null;
  return { bot_token: data.bot_token as string, chat_id: data.chat_id as string };
}
