/*
  Uploading the file a message carries.

  Everything an author attaches — a lead-magnet PDF, a lesson video, a photo
  for a broadcast — lands in one private bucket under their own folder. The
  browser never hands out a URL for it: rows store the object path, and the
  senders sign a two-hour URL at the moment they send, which is the only way a
  drip step scheduled for next Tuesday can still deliver its video.
*/

import { getSignedUrl, supabase } from '../lib/supabase';
import { transliterate } from '../utils/translit';
import type { AttachmentType, MessageAttachment } from '../types';

export const ATTACHMENT_BUCKET = 'funnel-media';

/*
  Telegram's ceilings for a file sent by URL, which is how we send: 5 MB for a
  photo, 20 MB for anything else. Instagram is more generous (8 and 25), so one
  set of limits satisfies both and the editor only has one number to explain.
*/
export const ATTACHMENT_LIMITS: Record<Exclude<AttachmentType, 'none'>, number> = {
  photo: 5 * 1024 * 1024,
  video: 20 * 1024 * 1024,
  document: 20 * 1024 * 1024,
};

export const ATTACHMENT_LABELS: Record<Exclude<AttachmentType, 'none'>, string> = {
  photo: 'Изображение',
  video: 'Видео',
  document: 'Файл',
};

/** What both platforms will actually render, rather than everything a disk holds. */
export function detectAttachmentType(file: File): Exclude<AttachmentType, 'none'> {
  if (file.type.startsWith('image/') && !file.type.includes('svg')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;

  // The limits are round numbers and read as "5 МБ", not "5.0 МБ"; a real
  // file's size still gets its decimal.
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} МБ`;
}

/** Null when the file is fine; a sentence for the author when it is not. */
export function validateAttachment(file: File): string | null {
  const type = detectAttachmentType(file);
  const limit = ATTACHMENT_LIMITS[type];

  if (file.size === 0) return 'Файл пустой.';
  if (file.size > limit) {
    return `${ATTACHMENT_LABELS[type]} до ${formatBytes(limit)} — этот весит ${formatBytes(file.size)}.`;
  }
  return null;
}

/**
 * The object key.
 *
 * Ends with the author's own filename, transliterated, because Telegram takes
 * a document's displayed name from the URL path — there is no field for it
 * when sending by URL. A random prefix keeps two files of the same name apart.
 */
function objectKey(userId: string, file: File): string {
  const dot = file.name.lastIndexOf('.');
  const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';

  const safeStem = transliterate(stem)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'file';
  const safeExtension = extension.replace(/[^a-z0-9]/g, '').slice(0, 8);

  const unique = crypto.randomUUID().slice(0, 8);
  return `${userId}/${unique}-${safeStem}${safeExtension ? `.${safeExtension}` : ''}`;
}

/**
 * Uploads the file and returns the three columns describing it.
 *
 * The old object is deliberately left behind when this replaces one. Deleting
 * it here would destroy the live attachment of a row the author may yet
 * abandon by closing the editor — so unreferenced files are swept later by
 * `cleanup-storage` instead, once nothing points at them.
 */
export async function uploadAttachment(file: File, userId: string): Promise<MessageAttachment> {
  const problem = validateAttachment(file);
  if (problem) throw new Error(problem);

  const path = objectKey(userId, file);
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });

  if (error) throw new Error(`Не удалось загрузить файл: ${error.message}`);

  return {
    attachment_type: detectAttachmentType(file),
    attachment_path: path,
    attachment_name: file.name,
  };
}

/** A short-lived URL for showing the file back to its author in the editor. */
export function attachmentPreviewUrl(path: string): Promise<string> {
  return getSignedUrl(ATTACHMENT_BUCKET, path);
}

/** Splits the three columns off a row, for a payload that names its fields. */
export function attachmentFields(source: MessageAttachment): MessageAttachment {
  return {
    attachment_type: source.attachment_type,
    attachment_path: source.attachment_path,
    attachment_name: source.attachment_name,
  };
}
