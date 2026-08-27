import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";
import { createSignedVideoUrl } from "../_shared/storage.ts";
import {
  createReelsContainer,
  isVideoProcessingFailure,
  publishContainer,
  VIDEO_PROCESSING_ERROR,
  VIDEO_PUBLISH_RETRY_DELAY_MS,
  VIDEO_PUBLISH_RETRY_LIMIT,
  waitForProcessing,
} from "../_shared/instagram.ts";
import { notifyUser } from "../_shared/telegram.ts";
import { loadChannel, publishReelToChannel } from "../_shared/telegram-publish.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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
    const publishAttempt = Number(post.publish_attempts ?? 0) + 1;

    if (!account || account.user_id !== post.user_id) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", error_message: "Instagram account ownership mismatch" })
        .eq("id", post.id);
      return new Response(JSON.stringify({ error: "Instagram account ownership mismatch", published: 0 }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .update({ status: "publishing", publish_attempts: publishAttempt })
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
      const videoUrl = await createSignedVideoUrl(supabase, post.video_path);

      const containerId = await createReelsContainer(
        account.ig_user_id,
        account.access_token,
        videoUrl,
        post.caption
      );

      const processed = await waitForProcessing(
        containerId,
        account.access_token
      );
      if (!processed) throw new Error(VIDEO_PROCESSING_ERROR);

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
          publish_attempts: 0,
          published_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      /*
        Mirror to the owner's Telegram channel before the source is removed —
        this is the last moment the file exists. Failing here must not undo a
        successful Instagram publish, so the outcome is only recorded.

        Silent when no channel is configured, which is the common case.
      */
      const channel = await loadChannel(supabase, account.user_id);
      if (channel) {
        const mirrored = await publishReelToChannel(
          channel,
          videoUrl,
          post.hook_text ?? null,
          post.caption ?? null,
        );
        if (!mirrored.ok) {
          console.error(`Telegram mirror failed for post ${post.id}`, mirrored.error);
        }
      }

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
      await notifyUser(
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
      const canRetry = isVideoProcessingFailure(publishError)
        && publishAttempt < VIDEO_PUBLISH_RETRY_LIMIT;
      const retryAt = new Date(Date.now() + VIDEO_PUBLISH_RETRY_DELAY_MS).toISOString();
      const errorMessage = canRetry
        ? `${VIDEO_PROCESSING_ERROR}. Автоповтор ${publishAttempt}/${VIDEO_PUBLISH_RETRY_LIMIT} запланирован на ${retryAt}.`
        : publishError.message;

      await supabase
        .from("scheduled_posts")
        .update({
          status: canRetry ? "pending" : "failed",
          scheduled_at: canRetry ? retryAt : post.scheduled_at,
          error_message: errorMessage,
        })
        .eq("id", post.id);

      const previewText = post.caption ? post.caption.substring(0, 30).replace(/\n/g, ' ') + '...' : 'Без текста';
      await notifyUser(
        supabase,
        account.user_id,
        canRetry
          ? `⏳ <b>Instagram обрабатывает видео дольше обычного</b>\n\nАккаунт: @${account.username}\nПост: <i>"${previewText}"</i>\n\nПовторю публикацию автоматически через 5 минут (попытка ${publishAttempt} из ${VIDEO_PUBLISH_RETRY_LIMIT}).`
          : `❌ <b>Ошибка публикации Reels</b>\n\nАккаунт: @${account.username}\nПост: <i>"${previewText}"</i>\n\n<b>Ошибка:</b>\n<code>${publishError.message}</code>\n\nВам необходимо проверить аккаунт или видео.`
      );

      return new Response(
        JSON.stringify({
          error: errorMessage,
          published: 0,
          post_id: post.id,
          retry_scheduled: canRetry,
        }),
        {
          status: canRetry ? 202 : 500,
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
