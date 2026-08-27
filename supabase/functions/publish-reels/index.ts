import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "POST request required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createAdminClient();

    const body = await req.json();
    const accountId = body.account_id;
    const postId = body.post_id;

    if (!postId && !accountId) {
      return new Response(
        JSON.stringify({ error: "Missing post_id or account_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let posts;
    let fetchError;

    if (postId) {
      const result = await supabase
        .from("scheduled_posts")
        .select("*, instagram_accounts!inner(ig_user_id, access_token, user_id, username, is_active)")
        .eq("id", postId)
        .eq("user_id", user.id)
        .eq("instagram_accounts.user_id", user.id)
        .in("status", ["draft", "pending", "failed"]);
      posts = result.data;
      fetchError = result.error;
    } else {
      const now = new Date().toISOString();
      let query = supabase
        .from("scheduled_posts")
        .select("*, instagram_accounts!inner(ig_user_id, access_token, user_id, username, is_active)")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(1);

      if (accountId) {
        query = query
          .eq("instagram_account_id", accountId)
          .eq("instagram_accounts.user_id", user.id);
      }

      const result = await query;
      posts = result.data;
      fetchError = result.error;
    }

    if (fetchError) throw fetchError;

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No posts to publish", published: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const post = posts[0];
    const account = post.instagram_accounts;
    if (account?.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Instagram account does not belong to the authenticated user" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const publishAttempt = post.status === "failed"
      ? 1
      : Number(post.publish_attempts ?? 0) + 1;
    if (!account?.is_active || !account.access_token || !account.ig_user_id) {
      return new Response(
        JSON.stringify({ error: "Instagram account is inactive or missing its access token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!post.video_path) {
      return new Response(JSON.stringify({ error: "Post video has already been cleaned up" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const igUserId = account.ig_user_id;
    const accessToken = account.access_token;

    const { data: claimed } = await supabase
      .from("scheduled_posts")
      .update({ status: "publishing", publish_attempts: publishAttempt })
      .eq("id", post.id)
      .eq("status", post.status)
      .select("id");

    if (!claimed?.length) {
      return new Response(JSON.stringify({ error: "Post is already being processed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const videoUrl = await createSignedVideoUrl(supabase, post.video_path);

      const containerId = await createReelsContainer(
        igUserId,
        accessToken,
        videoUrl,
        post.caption
      );

      const processed = await waitForProcessing(containerId, accessToken);
      if (!processed) throw new Error(VIDEO_PROCESSING_ERROR);

      const mediaId = await publishContainer(igUserId, accessToken, containerId);

      await supabase
        .from("scheduled_posts")
        .update({
          status: "published",
          instagram_media_id: mediaId,
          publish_attempts: 0,
          published_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      const { error: cleanupError } = await supabase.storage
        .from("reels")
        .remove([post.video_path]);
      if (cleanupError) {
        console.error("Could not cleanup published video", cleanupError);
      } else {
        await supabase
          .from("scheduled_posts")
          .update({ video_path: null })
          .eq("id", post.id);
      }

      const previewText = post.caption ? post.caption.substring(0, 50).replace(/\n/g, ' ') + (post.caption.length > 50 ? '...' : '') : 'Без описания';
      await notifyUser(
        supabase,
        account.user_id,
        `✅ <b>Опубликован Reels</b> (Ручной запуск)\n\nАккаунт: @${account.username}\nТекст: <i>"${previewText}"</i>\n\n🎉 Публикация прошла успешно.`
      );

      return new Response(
        JSON.stringify({
          message: "Published successfully",
          published: 1,
          post_id: post.id,
          instagram_media_id: mediaId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      const previewText = post.caption ? post.caption.substring(0, 30).replace(/\n/g, ' ') + '...' : 'Без описания';
      await notifyUser(
        supabase,
        account.user_id,
        `❌ <b>Ошибка публикации Reels</b> (Ручной запуск)\n\nАккаунт: @${account.username}\nПост: <i>"${previewText}"</i>\n\n<b>Ошибка:</b>\n<code>${publishError.message}</code>\n\nПроверьте видео или настройки аккаунта.`
      );

      return new Response(
        JSON.stringify({ error: errorMessage, published: 0, retry_scheduled: canRetry }),
        { status: canRetry ? 202 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Publish error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
