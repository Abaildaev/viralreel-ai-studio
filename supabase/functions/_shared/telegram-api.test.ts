import { afterEach, describe, expect, it, vi } from "vitest";
import { isChannelMember, sendMessage } from "./telegram-api.ts";

interface TelegramRequest {
  url: string;
  body: Record<string, any>;
}

function mockTelegram(result: Record<string, unknown> = { message_id: 42 }) {
  const requests: TelegramRequest[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Telegram captioned funnel messages", () => {
  it("sends a short text, photo and button as one Telegram message", async () => {
    const requests = mockTelegram();

    await sendMessage("123:token", {
      chatId: 77,
      text: "Подпишитесь на канал — материал придёт автоматически.",
      buttons: [{ text: "Подписаться", url: "https://t.me/example" }],
      attachment: { type: "photo", url: "https://example.com/cover.png" },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/sendPhoto");
    expect(requests[0].body).toMatchObject({
      chat_id: 77,
      photo: "https://example.com/cover.png",
      caption: "Подпишитесь на канал — материал придёт автоматически.",
      reply_markup: {
        inline_keyboard: [[{ text: "Подписаться", url: "https://t.me/example" }]],
      },
    });
  });

  it("splits only when the caption is longer than Telegram's limit", async () => {
    const requests = mockTelegram();

    await sendMessage("123:token", {
      chatId: 77,
      text: "а".repeat(1025),
      buttons: [{ text: "Подписаться", url: "https://t.me/example" }],
      attachment: { type: "photo", url: "https://example.com/cover.png" },
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toContain("/sendPhoto");
    expect(requests[0].body.caption).toBeUndefined();
    expect(requests[1].url).toContain("/sendMessage");
    expect(requests[1].body.text).toHaveLength(1025);
  });

  it("stores the Telegram file id returned by the first URL delivery", async () => {
    const requests = mockTelegram({
      message_id: 42,
      photo: [{ file_id: "small-photo" }, { file_id: "telegram-photo-file-id" }],
    });
    const rememberTelegramFileId = vi.fn(async () => undefined);

    await sendMessage("123:token", {
      chatId: 77,
      text: "Пак промптов",
      attachment: {
        type: "photo",
        url: "https://storage.example.com/cover.png",
        rememberTelegramFileId,
      },
    });

    expect(requests[0].body.photo).toBe("https://storage.example.com/cover.png");
    expect(rememberTelegramFileId).toHaveBeenCalledOnce();
    expect(rememberTelegramFileId).toHaveBeenCalledWith("telegram-photo-file-id");
  });

  it("sends a cached image directly by Telegram file id", async () => {
    const requests = mockTelegram({
      message_id: 42,
      photo: [{ file_id: "telegram-photo-file-id" }],
    });
    const rememberTelegramFileId = vi.fn(async () => undefined);

    await sendMessage("123:token", {
      chatId: 77,
      text: "Пак промптов",
      attachment: {
        type: "photo",
        url: "telegram-photo-file-id",
        telegramFileId: "telegram-photo-file-id",
        rememberTelegramFileId,
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].body.photo).toBe("telegram-photo-file-id");
    expect(rememberTelegramFileId).not.toHaveBeenCalled();
  });

  it("keeps the channel and manual subscription check under one photo", async () => {
    const requests = mockTelegram({
      message_id: 42,
      photo: [{ file_id: "telegram-photo-file-id" }],
    });

    await sendMessage("123:token", {
      chatId: 77,
      text: "Подпишитесь и заберите каталог",
      buttons: [{ text: "Подписаться", url: "https://t.me/example" }],
      callbackButton: { text: "Проверить подписку", data: "check:funnel-1" },
      attachment: {
        type: "photo",
        url: "telegram-photo-file-id",
        telegramFileId: "telegram-photo-file-id",
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].body.reply_markup.inline_keyboard).toEqual([
      [{ text: "Подписаться", url: "https://t.me/example" }],
      [{ text: "Проверить подписку", callback_data: "check:funnel-1" }],
    ]);
  });
});

describe("isChannelMember", () => {
  it("uses Telegram getChatMember and accepts an administrator", async () => {
    const requests = mockTelegram({ status: "administrator" });

    await expect(isChannelMember("123:token", "-100123", "456"))
      .resolves.toEqual({ subscribed: true, fault: null });
    expect(requests[0].url).toContain("/getChatMember");
    expect(requests[0].body).toMatchObject({ chat_id: "-100123", user_id: "456" });
  });
});
