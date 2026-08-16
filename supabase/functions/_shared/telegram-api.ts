/*
  One Telegram Bot API client, shared by the webhook, the setup endpoint and the
  broadcast worker.

  The existing `telegram.ts` sends the owner a notification and swallows every
  error on purpose — that is the right shape for a best-effort side channel and
  the wrong shape for a funnel, where a failed send is the product failing. This
  module reports failures instead, with enough structure for a caller to decide
  between "retry later", "give up on this person" and "stop the whole run".
*/

const API_BASE = "https://api.telegram.org/bot";

/** Carries Telegram's numeric code and flood-wait hint so callers can back off. */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    /** Seconds Telegram asked us to wait, from a 429. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

/**
 * A person who blocked the bot, deleted their account or was deactivated can
 * never receive anything again. Retrying them wastes quota on every future
 * broadcast, so the queue marks them dead rather than failed.
 */
export function isPermanentDeliveryFailure(error: unknown): boolean {
  if (!(error instanceof TelegramApiError)) return false;
  if (error.code !== 403 && error.code !== 400) return false;

  const text = error.message.toLowerCase();
  return (
    text.includes("bot was blocked") ||
    text.includes("user is deactivated") ||
    text.includes("chat not found") ||
    text.includes("user not found") ||
    text.includes("bot can't initiate conversation")
  );
}

export async function callTelegram<T = any>(
  botToken: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!data?.ok) {
    throw new TelegramApiError(
      data?.description ?? `Telegram API returned HTTP ${response.status}`,
      data?.error_code ?? response.status,
      data?.parameters?.retry_after,
    );
  }

  return data.result as T;
}

export interface InlineButton {
  text: string;
  url: string;
}

/** Telegram rejects a keyboard with an empty label or a non-http url. */
export function inlineKeyboard(buttons: InlineButton[]): Record<string, unknown> | undefined {
  const usable = buttons.filter(
    (button) => button.text.trim() && /^https?:\/\//i.test(button.url.trim()),
  );
  if (usable.length === 0) return undefined;

  return {
    inline_keyboard: usable.map((button) => [{
      text: button.text.trim().slice(0, 64),
      url: button.url.trim(),
    }]),
  };
}

export interface SendMessageOptions {
  chatId: string | number;
  text: string;
  buttons?: InlineButton[];
  /** A callback button, for the "I subscribed" check. */
  callbackButton?: { text: string; data: string };
  disableNotification?: boolean;
}

/** Telegram truncates anything longer and returns an error for a bare overflow. */
const MAX_MESSAGE_CHARS = 4096;

/**
 * Sends one message, formatted as HTML.
 *
 * Funnel copy is written by the account owner, who may reasonably use `<b>` —
 * so HTML parsing stays on. But a stray `<` in ordinary prose makes Telegram
 * reject the whole message, and losing a lead over a typo in an em-dash is a
 * bad trade. So a parse failure retries once as plain text: the reader loses
 * the bold, not the material.
 */
export async function sendMessage(
  botToken: string,
  options: SendMessageOptions,
): Promise<number> {
  const keyboard = options.callbackButton
    ? {
      inline_keyboard: [
        ...(options.buttons ?? [])
          .filter((button) => button.text.trim() && /^https?:\/\//i.test(button.url.trim()))
          .map((button) => [{ text: button.text.trim().slice(0, 64), url: button.url.trim() }]),
        [{
          text: options.callbackButton.text.trim().slice(0, 64) || "Проверить",
          callback_data: options.callbackButton.data.slice(0, 64),
        }],
      ],
    }
    : inlineKeyboard(options.buttons ?? []);

  const base: Record<string, unknown> = {
    chat_id: options.chatId,
    text: options.text.slice(0, MAX_MESSAGE_CHARS),
    disable_web_page_preview: true,
    disable_notification: options.disableNotification ?? false,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  };

  try {
    const result = await callTelegram<{ message_id: number }>(botToken, "sendMessage", {
      ...base,
      parse_mode: "HTML",
    });
    return result.message_id;
  } catch (error) {
    const isParseFailure = error instanceof TelegramApiError &&
      error.code === 400 &&
      error.message.toLowerCase().includes("parse entities");
    if (!isParseFailure) throw error;

    const result = await callTelegram<{ message_id: number }>(botToken, "sendMessage", base);
    return result.message_id;
  }
}

export const SUBSCRIBED_STATUSES = new Set(["member", "administrator", "creator"]);

export interface MembershipCheck {
  subscribed: boolean;
  /**
   * Set when the answer is "no" because the question could not be asked —
   * almost always the bot having lost its administrator rights. Distinct from
   * a plain "no", because one is the reader's doing and the other is ours.
   */
  fault: string | null;
}

/**
 * Whether someone is currently in the channel.
 *
 * Treats an API failure as "not subscribed" rather than throwing: crashing the
 * update handler would lose the lead entirely. But it reports the failure
 * separately, because a fault means every visitor is being turned away and the
 * owner needs to hear about it — silently answering "not subscribed" forever
 * is how a funnel dies without anyone noticing.
 */
export async function isChannelMember(
  botToken: string,
  channelId: string,
  telegramUserId: string,
): Promise<MembershipCheck> {
  if (!channelId) return { subscribed: true, fault: null };

  try {
    const member = await callTelegram<{ status: string }>(botToken, "getChatMember", {
      chat_id: channelId,
      user_id: telegramUserId,
    });
    return { subscribed: SUBSCRIBED_STATUSES.has(member.status), fault: null };
  } catch (error) {
    const described = describeTelegramError(error);
    console.warn("getChatMember failed", described);
    return { subscribed: false, fault: described };
  }
}

/** Telegram's messages are English and terse; the UI shows these instead. */
export function describeTelegramError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.toLowerCase();

  if (text.includes("unauthorized") || text.includes("not found") && text.includes("bot")) {
    return "Токен бота недействителен — проверьте его в @BotFather и сохраните заново.";
  }
  if (text.includes("bot was blocked")) {
    return "Пользователь заблокировал бота — сообщения ему больше не доставляются.";
  }
  if (text.includes("chat not found")) {
    return "Чат или канал не найден: проверьте, что бот добавлен в канал администратором.";
  }
  if (text.includes("not enough rights") || text.includes("administrator")) {
    return "Боту не хватает прав в канале — сделайте его администратором.";
  }
  if (text.includes("too many requests") || text.includes("retry after")) {
    return "Telegram временно ограничил частоту отправки — рассылка продолжится автоматически.";
  }
  if (text.includes("parse entities")) {
    return "Ошибка разметки в тексте: проверьте HTML-теги.";
  }

  return raw;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
