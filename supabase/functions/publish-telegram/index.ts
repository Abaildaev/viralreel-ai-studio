import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, getAuthenticatedUser } from "../_shared/auth.ts";
import { createSignedVideoUrl } from "../_shared/storage.ts";
import { loadChannel, publishReelToChannel } from "../_shared/telegram-publish.ts";

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
    const { force, post_id } = body;

    const channel = await loadChannel(supabase, user.id);
    if (!channel) {
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

      const videoUrl = await createSignedVideoUrl(supabase, post.video_path);

      const result = await publishReelToChannel(
        channel,
        videoUrl,
        post.hook_text ?? null,
        post.caption ?? null,
      );

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
        results.push({ post_id: post.id, status: "published", message_id: result.messageId });
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
