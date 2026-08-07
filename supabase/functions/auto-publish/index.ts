import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getBaseUrl(accessToken: string): string {
  return accessToken.startsWith("IGAA")
    ? "https://graph.instagram.com/v25.0"
    : "https://graph.facebook.com/v25.0";
}

async function createReelsContainer(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string
): Promise<string> {
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption: caption,
    access_token: accessToken,
  });

  const response = await fetch(
    `${getBaseUrl(accessToken)}/${igUserId}/media?${params}`,
    { method: "POST" }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.id;
}

async function checkContainerStatus(
  containerId: string,
  accessToken: string
): Promise<string> {
  const response = await fetch(
    `${getBaseUrl(accessToken)}/${containerId}?fields=status_code&access_token=${accessToken}`
  );
  const data = await response.json();
  return data.status_code;
}

async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string
): Promise<string> {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });

  const response = await fetch(
    `${getBaseUrl(accessToken)}/${igUserId}/media_publish?${params}`,
    { method: "POST" }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.id;
}

async function waitForProcessing(
  containerId: string,
  accessToken: string,
  maxAttempts = 12
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkContainerStatus(containerId, accessToken);
    if (status === "FINISHED") return true;
    if (status === "ERROR") return false;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}

async function sendTelegramMessage(
  supabase: any,
  userId: string,
  message: string
) {
  try {
    const { data: tgStatus } = await supabase
      .from("telegram_settings")
      .select("bot_token, chat_id, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (tgStatus && tgStatus.is_active && tgStatus.bot_token && tgStatus.chat_id) {
      await fetch(`https://api.telegram.org/bot${tgStatus.bot_token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgStatus.chat_id,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true
        }),
      });
    }
  } catch (err) {
    console.error("Failed to send Telegram message", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!hasValidCronSecret(req)) {
      return new Response(JSON.stringify({ error: "Cron authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createAdminClient();

    const now = new Date().toISOString();

    // Reset hanging 'publishing' posts
    await supabase
      .from("scheduled_posts")
      .update({ status: "pending" })
      .eq("status", "publishing")
      .lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const { data: posts, error: fetchError } = await supabase
      .from("scheduled_posts")
      .select("*, instagram_accounts!inner(ig_user_id, access_token, user_id, username, is_active)")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No posts due", published: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const post = posts[0];
    const account = post.instagram_accounts;

    if (!account?.is_active || !account.access_token || !account.ig_user_id) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", error_message: "Instagram account is inactive or missing its access token" })
        .eq("id", post.id);
      return new Response(JSON.stringify({ error: "Instagram account is inactive or missing its access token", published: 0 }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!post.video_path) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", error_message: "Post video has already been cleaned up" })
        .eq("id", post.id);
      return new Response(JSON.stringify({ error: "Post video has already been cleaned up", published: 0 }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claim the post
    const { data: claimed } = await supabase
      .from("scheduled_posts")
      .update({ status: "publishing" })
      .eq("id", post.id)
      .eq("status", "pending")
      .select();

    if (!claimed || claimed.length === 0) {
      return new Response(
        JSON.stringify({ message: "Post already claimed", published: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    try {
      const { data: urlData } = supabase.storage
        .from("reels")
        .getPublicUrl(post.video_path);

      const containerId = await createReelsContainer(
        account.ig_user_id,
        account.access_token,
        urlData.publicUrl,
        post.caption
      );

      const processed = await waitForProcessing(
        containerId,
        account.access_token
      );
      if (!processed)
        throw new Error("Ошибка Facebook: Видео не прошло внутреннюю обработку (Video processing failed or timed out)");

      const mediaId = await publishContainer(
        account.ig_user_id,
        account.access_token,
        containerId
      );

      await supabase
        .from("scheduled_posts")
        .update({
          status: "published",
          instagram_media_id: mediaId,
          published_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      // Remove the source only after Instagram has accepted the post. Keep the
      // path when cleanup fails so the scheduled cleanup job can retry it.
      const { error: cleanupError } = await supabase.storage
        .from("reels")
        .remove([post.video_path]);
      if (cleanupError) {
        console.error("Could not remove video", cleanupError);
      } else {
        await supabase
          .from("scheduled_posts")
          .update({ video_path: null })
          .eq("id", post.id);
      }

      const previewText = post.caption.substring(0, 50).replace(/\n/g, ' ') + (post.caption.length > 50 ? '...' : '');
      await sendTelegramMessage(
        supabase, 
        account.user_id, 
        `✅ <b>Опубликован Reels</b>\n\nАккаунт: @${account.username}\nТекст: <i>"${previewText}"</i>\n\n🎉 Публикация прошла успешно.`
      );

      return new Response(
        JSON.stringify({
          message: "Published successfully",
          published: 1,
          post_id: post.id,
          instagram_media_id: mediaId,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (publishError: any) {
      await supabase
        .from("scheduled_posts")
        .update({
          status: "failed",
          error_message: publishError.message,
        })
        .eq("id", post.id);

      const previewText = post.caption ? post.caption.substring(0, 30).replace(/\n/g, ' ') + '...' : 'Без текста';
      await sendTelegramMessage(
        supabase, 
        account.user_id, 
        `❌ <b>Ошибка публикации Reels</b>\n\nАккаунт: @${account.username}\nПост: <i>"${previewText}"</i>\n\n<b>Ошибка:</b>\n<code>${publishError.message}</code>\n\nВам необходимо проверить аккаунт или видео.`
      );

      return new Response(
        JSON.stringify({
          error: publishError.message,
          published: 0,
          post_id: post.id,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("Auto-publish error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
