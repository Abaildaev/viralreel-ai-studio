import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatCaptionHtml(caption: string): string {
  let text = escapeHtml(caption);

  text = text.replace(/^(\d+\.\s+)(.+)$/gm, (_: string, num: string, title: string) => {
    return `${num}<b>${title}</b>`;
  });

  return text;
}

async function sendVideoToTelegram(
  botToken: string,
  chatId: string,
  videoUrl: string,
  caption?: string
): Promise<{ ok: boolean; message_id?: number; error?: string }> {
  try {
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error("Failed to fetch video");
    }
    const videoBlob = await videoResponse.blob();

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("video", videoBlob, "reel.mp4");
    formData.append("supports_streaming", "true");
    formData.append("width", "720");
    formData.append("height", "1280");

    if (caption) {
      const trimmed = caption.length > 1024 ? caption.substring(0, 1021) + "..." : caption;
      formData.append("caption", trimmed);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendVideo`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (!data.ok) {
      return { ok: false, error: data.description || "Unknown Telegram error" };
    }

    return { ok: true, message_id: data.result.message_id };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function sendTextToTelegram(
  botToken: string,
  chatId: string,
  text: string,
  replyToMessageId?: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
    };

    if (replyToMessageId) {
      body.reply_parameters = {
        message_id: replyToMessageId,
      };
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!data.ok) {
      return { ok: false, error: data.description || "Unknown Telegram error" };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

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
    const { force, post_id } = body;

    const { data: telegramSettings, error: telegramError } = await supabase
      .from("telegram_settings")
      .select("bot_token, chat_id, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (telegramError) throw telegramError;
    if (!telegramSettings?.is_active || !telegramSettings.bot_token || !telegramSettings.chat_id) {
      return new Response(
        JSON.stringify({ error: "Telegram is not configured for this user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let posts;
    let fetchError;

    if (post_id) {
      const result = await supabase
        .from("scheduled_posts")
        .select("*")
        .eq("id", post_id)
        .eq("user_id", user.id)
        .in("status", ["draft", "pending", "failed"]);
      posts = result.data;
      fetchError = result.error;
    } else {
      let query = supabase
        .from("scheduled_posts")
        .select("*")
        .eq("status", "pending")
        .eq("user_id", user.id);

      if (!force) {
        const now = new Date().toISOString();
        query = query.lte("scheduled_at", now);
      }

      const result = await query
        .order("scheduled_at", { ascending: true })
        .limit(10);
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

    let publishedCount = 0;
    const results: Record<string, unknown>[] = [];

    for (const post of posts) {
      if (!post.video_path) {
        await supabase
          .from("scheduled_posts")
          .update({ status: "failed", error_message: "Post video has already been cleaned up" })
          .eq("id", post.id);
        results.push({ post_id: post.id, status: "failed", error: "Post video has already been cleaned up" });
        continue;
      }

      await supabase
        .from("scheduled_posts")
        .update({ status: "publishing" })
        .eq("id", post.id);

      const { data: urlData } = supabase.storage
        .from("reels")
        .getPublicUrl(post.video_path);

      const videoUrl = urlData.publicUrl;

      const videoCaption = post.hook_text || undefined;

      const result = await sendVideoToTelegram(
        telegramSettings.bot_token,
        telegramSettings.chat_id,
        videoUrl,
        videoCaption
      );

      if (result.ok && post.caption && result.message_id) {
        const formattedCaption = formatCaptionHtml(post.caption);
        await sendTextToTelegram(telegramSettings.bot_token, telegramSettings.chat_id, formattedCaption, result.message_id);
      }

      if (result.ok) {
        await supabase
          .from("scheduled_posts")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        const { error: cleanupError } = await supabase.storage
          .from("reels")
          .remove([post.video_path]);
        if (cleanupError) {
          console.error("Could not cleanup published Telegram video", cleanupError);
        } else {
          await supabase
            .from("scheduled_posts")
            .update({ video_path: null })
            .eq("id", post.id);
        }

        publishedCount++;
        results.push({ post_id: post.id, status: "published", message_id: result.message_id });
      } else {
        await supabase
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_message: result.error,
          })
          .eq("id", post.id);

        results.push({ post_id: post.id, status: "failed", error: result.error });
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(
      JSON.stringify({
        message: `Published ${publishedCount} of ${posts.length} posts`,
        published: publishedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Telegram publish error:", error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
