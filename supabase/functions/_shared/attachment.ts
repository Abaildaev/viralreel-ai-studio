/*
  One attachment, understood the same way by every sender.

  The three tables that carry a file — funnel steps, broadcasts and Instagram
  lead magnets — store it identically, so reading and signing it belongs here
  rather than three times over. What differs is only the last step: Telegram
  wants a method name, Meta wants a type word, and this module hands each of
  them what it asks for.

  The signing rule is the part worth stating out loud. A URL is minted at send
  time and lives for two hours, never longer: a drip step can go out a week
  after its video was uploaded, and both platforms fetch the file the moment
  they accept the message. Nothing durable ever points into the bucket.
*/

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const ATTACHMENT_BUCKET = "funnel-media";

/** Matches the `attachment_type` check constraint. */
export type AttachmentType = "none" | "photo" | "video" | "document";

export interface AttachmentColumns {
  attachment_type: string;
  attachment_path: string;
  attachment_name: string;
}

/** The columns to add to any select that will send the row. */
export const ATTACHMENT_COLUMNS = "attachment_type,attachment_path,attachment_name";

export interface Attachment {
  type: Exclude<AttachmentType, "none">;
  path: string;
  name: string;
}

/** Null for a row with nothing attached, which is most of them. */
export function readAttachment(row: Partial<AttachmentColumns> | null | undefined): Attachment | null {
  const type = row?.attachment_type;
  const path = row?.attachment_path?.trim();

  if (!path || !type || type === "none") return null;
  if (type !== "photo" && type !== "video" && type !== "document") return null;

  return { type, path, name: row?.attachment_name?.trim() || "" };
}

export interface SignedAttachment {
  type: Attachment["type"];
  url: string;
  name: string;
}

/** Two hours: far longer than any single send, far shorter than the file lives. */
const SIGNED_URL_TTL_SECONDS = 7200;

/**
 * Signs the file for one send.
 *
 * Returns null rather than throwing when the object is gone — an author who
 * deleted the file should get the message without it, not a funnel that stops
 * at that step forever. The caller logs the miss; the reader still gets the
 * text and the button, which is where the promise actually lives.
 */
export async function signAttachment(
  supabase: SupabaseClient,
  attachment: Attachment | null,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<SignedAttachment | null> {
  if (!attachment) return null;

  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.path, expiresIn);

  if (error || !data?.signedUrl) {
    console.warn(
      `Attachment ${attachment.path} could not be signed: ${error?.message ?? "empty URL"}`,
    );
    return null;
  }

  return { type: attachment.type, url: data.signedUrl, name: attachment.name };
}

/** Convenience for the common "read it off the row and sign it" pair. */
export function signRowAttachment(
  supabase: SupabaseClient,
  row: Partial<AttachmentColumns> | null | undefined,
): Promise<SignedAttachment | null> {
  return signAttachment(supabase, readAttachment(row));
}

/**
 * Meta's vocabulary for the same three things.
 *
 * Instagram has no "document": a PDF goes as a generic file, which the client
 * renders as a download rather than inline.
 */
export function instagramAttachmentType(type: Attachment["type"]): "image" | "video" | "file" {
  if (type === "photo") return "image";
  if (type === "video") return "video";
  return "file";
}
