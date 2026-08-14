import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

    // Calculate the date 3 days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch posts that are old, have a video path, and are not pending
    const { data: oldPosts, error: fetchError } = await supabase
      .from("scheduled_posts")
      .select("id, video_path")
      .in("status", ["published", "failed"])
      .not("video_path", "is", null)
      .neq("video_path", "")
      .lt("updated_at", threeDaysAgo)
      .limit(100); // Process in batches to avoid timeouts

    if (fetchError) throw fetchError;

    if (!oldPosts || oldPosts.length === 0) {
      return new Response(JSON.stringify({ message: "No cleanup needed", deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pathsToDelete = oldPosts.map(p => p.video_path);
    
    // Delete files from storage
    const { data: deleteData, error: deleteError } = await supabase.storage
      .from("reels")
      .remove(pathsToDelete);

    if (deleteError) throw deleteError;

    // Update database records so we don't try to clean them again
    const idsToUpdate = oldPosts.map(p => p.id);
    const { error: updateError } = await supabase
      .from("scheduled_posts")
      .update({ video_path: null })
      .in("id", idsToUpdate);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        message: "Cleanup completed", 
        deleted_count: pathsToDelete.length,
        items: deleteData
      }), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
