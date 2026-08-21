/*
  Connecting a Telegram bot, from the browser.

  The bot token never reaches the database in plaintext and never returns to the
  page: the browser posts it once, this function verifies it against Telegram,
  encrypts it and registers the webhook. Afterwards the interface can only
  replace or disconnect the bot — the same contract the DeepSeek key has.
*/

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";
import { decryptCredential, encryptCredential } from "../_shared/credentials.ts";
import { callTelegram, describeTelegramError } from "../_shared/telegram-api.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* `chat_member` is not delivered unless it is asked for by name, and without it
   the bot never learns that someone joined the channel. */
const ALLOWED_UPDATES = ["message", "callback_query", "my_chat_member", "chat_member"];

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function webhookUrl(botId: string): string {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("SUPABASE_URL is not configured");
  return `${base}/functions/v1/telegram-bot?bot=${botId}`;
}

interface ChatInfo {
  id: number;
  title?: string;
  username?: string;
  invite_link?: string;
}

/**
 * Resolves a channel and confirms the bot can actually police it.
 *
 * Both checks matter: `getChat` proves the channel exists and the bot can see
 * it, and the administrator check proves `getChatMember` will work later. A
 * funnel that gates on a subscription it cannot verify would reject everyone.
 */
async function resolveChannel(
  botToken: string,
  botId: number,
  channel: string,
): Promise<{ id: string; title: string; username: string; inviteUrl: string; botStatus: string }> {
  const chat = await callTelegram<ChatInfo>(botToken, "getChat", { chat_id: channel });

  const member = await callTelegram<{ status: string }>(botToken, "getChatMember", {
    chat_id: chat.id,
    user_id: botId,
  });

  if (member.status !== "administrator" && member.status !== "creator") {
    throw new Error(
      "Бот должен быть администратором канала — иначе он не сможет проверять подписку.",
    );
  }

  const username = chat.username ?? "";
  return {
    id: String(chat.id),
    title: chat.title ?? "",
    username,
    // A public channel needs no invite link; a private one cannot be joined without it.
    inviteUrl: chat.invite_link ?? (username ? `https://t.me/${username}` : ""),
    botStatus: member.status,
  };
}

interface WebhookInfo {
  url?: string;
  pending_update_count?: number;
  allowed_updates?: string[];
  last_error_message?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const user = await getAuthenticatedUser(req);
  if (!user) return response({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const supabase = createAdminClient();

  try {
    if (action === "connect") {
      const botToken = typeof body?.botToken === "string" ? body.botToken.trim() : "";
      if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
        return response({ error: "Токен бота выглядит некорректно. Скопируйте его из @BotFather." }, 400);
      }

      const me = await callTelegram<{ id: number; username: string; first_name: string }>(
        botToken,
        "getMe",
      );

      const secret = randomSecret();
      const encrypted = await encryptCredential(botToken);
      const now = new Date().toISOString();

      // Upsert on user_id: reconnecting replaces the token in place, so funnels
      // and subscribers survive a token rotation.
      const { data: saved, error } = await supabase
        .from("telegram_bots")
        .upsert({
          user_id: user.id,
          bot_token_encrypted: encrypted,
          webhook_secret: secret,
          bot_username: me.username ?? "",
          bot_name: me.first_name ?? "",
          is_active: true,
          last_error: null,
          updated_at: now,
        }, { onConflict: "user_id" })
        .select("id,bot_username,bot_name")
        .single();

      if (error) throw error;

      await callTelegram(botToken, "setWebhook", {
        url: webhookUrl(saved.id as string),
        secret_token: secret,
        allowed_updates: ALLOWED_UPDATES,
        drop_pending_updates: true,
      });

      await supabase
        .from("telegram_bots")
        .update({ webhook_set_at: now, updated_at: now })
        .eq("id", saved.id);

      return response({
        id: saved.id,
        botUsername: saved.bot_username,
        botName: saved.bot_name,
      });
    }

    const { data: bot } = await supabase
      .from("telegram_bots")
      .select("id,bot_token_encrypted,bot_username,webhook_secret,channel_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!bot) return response({ error: "Бот не подключён" }, 404);

    const botToken = await decryptCredential(bot.bot_token_encrypted as string);

    if (action === "set_channel") {
      const channel = typeof body?.channel === "string" ? body.channel.trim() : "";
      if (!channel) return response({ error: "Укажите канал" }, 400);

      const me = await callTelegram<{ id: number }>(botToken, "getMe");
      const resolved = await resolveChannel(botToken, me.id, channel);

      const { error } = await supabase
        .from("telegram_bots")
        .update({
          channel_id: resolved.id,
          channel_title: resolved.title,
          channel_username: resolved.username,
          channel_invite_url: resolved.inviteUrl,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bot.id);

      if (error) throw error;
      return response({
        channelId: resolved.id,
        channelTitle: resolved.title,
        channelUsername: resolved.username,
        channelInviteUrl: resolved.inviteUrl,
      });
    }

    if (action === "verify_subscription") {
      const channelId = String(bot.channel_id ?? "").trim();
      const secret = String(bot.webhook_secret ?? "").trim();
      if (!channelId) return response({ error: "Сначала подключите канал" }, 400);
      if (!secret) return response({ error: "У вебхука нет секретного ключа — переустановите его" }, 400);

      /*
        This is the same Telegram method the funnel later uses for every
        visitor. Resolving the already-saved channel proves both that the bot
        can see it and that getChatMember reports the bot as an administrator.
      */
      const me = await callTelegram<{ id: number }>(botToken, "getMe");
      const resolved = await resolveChannel(botToken, me.id, channelId);

      /* Re-applying the webhook is intentional: old registrations that omit
         chat_member never receive the event that releases a subscriber from
         the gate. This verification also repairs that state in one click. */
      const expectedUrl = webhookUrl(bot.id as string);
      await callTelegram(botToken, "setWebhook", {
        url: expectedUrl,
        secret_token: secret,
        allowed_updates: ALLOWED_UPDATES,
      });

      const info = await callTelegram<WebhookInfo>(botToken, "getWebhookInfo");
      const allowedUpdates = info.allowed_updates ?? [];
      const missingUpdates = ALLOWED_UPDATES.filter((update) => !allowedUpdates.includes(update));
      if (info.url !== expectedUrl || missingUpdates.length > 0) {
        throw new Error(
          `Webhook Telegram настроен не полностью: ${missingUpdates.join(", ") || "неверный URL"}`,
        );
      }
      if (info.last_error_message) {
        throw new Error(`Telegram сообщает об ошибке webhook: ${info.last_error_message}`);
      }

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("telegram_bots")
        .update({
          channel_id: resolved.id,
          channel_title: resolved.title,
          channel_username: resolved.username,
          channel_invite_url: resolved.inviteUrl,
          webhook_set_at: now,
          last_error: null,
          updated_at: now,
        })
        .eq("id", bot.id);

      if (error) throw error;
      return response({
        ok: true,
        botStatus: resolved.botStatus,
        allowedUpdates,
        pendingUpdates: info.pending_update_count ?? 0,
      });
    }

    if (action === "refresh_webhook") {
      const secret = randomSecret();
      await callTelegram(botToken, "setWebhook", {
        url: webhookUrl(bot.id as string),
        secret_token: secret,
        allowed_updates: ALLOWED_UPDATES,
      });

      const now = new Date().toISOString();
      await supabase
        .from("telegram_bots")
        .update({ webhook_secret: secret, webhook_set_at: now, last_error: null, updated_at: now })
        .eq("id", bot.id);

      const info = await callTelegram<{ pending_update_count: number }>(botToken, "getWebhookInfo");
      return response({ ok: true, pendingUpdates: info.pending_update_count ?? 0 });
    }

    if (action === "disconnect") {
      // Best effort: a revoked token cannot unregister its webhook, and that
      // must not block the row from being removed.
      await callTelegram(botToken, "deleteWebhook", {}).catch(() => undefined);
      const { error } = await supabase.from("telegram_bots").delete().eq("id", bot.id);
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("Telegram setup failed", error);
    return response({ error: describeTelegramError(error) }, 400);
  }
});
