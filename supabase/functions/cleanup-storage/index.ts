import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, hasValidCronSecret } from "../_shared/auth.ts";
import { ATTACHMENT_BUCKET } from "../_shared/attachment.ts";

/*
  An attachment is uploaded the moment it is chosen, before the row that points
  at it is saved — which is what lets the author see the file in the preview
  while still deciding. The cost is orphans: every replaced file, and every
  editor closed without saving, leaves an object nothing references.

  They are swept here rather than deleted by the editor, because the editor
  cannot tell "replaced" from "the author will press Cancel and still needs the
  old one". A day's grace covers any session, and after it the reference either
  exists or the file was never wanted.
*/
const ORPHAN_GRACE_HOURS = 24;

/** Every attachment path currently spoken for, across the three tables. */
async function referencedAttachments(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Set<string>> {
  const tables = ["lead_magnets", "telegram_funnel_steps", "telegram_broadcasts"];
  const referenced = new Set<string>();

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("attachment_path")
      .neq("attachment_path", "");

    // A missing column means the migration has not been applied here yet.
    // Deleting on a partial picture would destroy live files, so refuse.
    if (error) throw new Error(`Не удалось прочитать вложения ${table}: ${error.message}`);

    for (const row of data ?? []) {
      if (row.attachment_path) referenced.add(row.attachment_path as string);
    }
  }

  return referenced;
}

/**
 * Deletes attachment objects nothing points at any more.
 *
 * Listed per user folder because storage.list is not recursive, and the bucket
 * is laid out as `<user id>/<file>`.
 */
async function sweepOrphanedAttachments(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const referenced = await referencedAttachments(supabase);
  const cutoff = Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000;

  const { data: folders, error: listError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .list("", { limit: 1000 });
  if (listError) throw listError;

  const orphans: string[] = [];

  for (const folder of folders ?? []) {
    // Only directories have no id of their own in a storage listing.
    if (folder.id) continue;

    const { data: files, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .list(folder.name, { limit: 1000 });
    if (error) throw error;

    for (const file of files ?? []) {
      const path = `${folder.name}/${file.name}`;
      if (referenced.has(path)) continue;

      const created = Date.parse(file.created_at ?? "");
      if (Number.isFinite(created) && created > cutoff) continue;

      orphans.push(path);
    }
  }

  if (orphans.length === 0) return 0;

  const { error: removeError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove(orphans);
  if (removeError) throw removeError;

  return orphans.length;
}

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

    /* Runs before the reels sweep and independently of it: an empty reels
       result used to return early, and folding this in after that would mean
       attachments are only ever swept on days a post happens to expire. */
    const orphanedAttachments = await sweepOrphanedAttachments(supabase);

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
      return new Response(
        JSON.stringify({
          message: "No cleanup needed",
          deleted: 0,
          orphaned_attachments: orphanedAttachments,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
        orphaned_attachments: orphanedAttachments,
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
