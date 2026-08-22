/*
  Keep transient Instagram video-processing failures in the queue. Meta can
  take longer than one polling window to transcode a Reel, and a temporary
  processing error should not permanently lose the scheduled post.
*/

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_publish_attempts_check;

ALTER TABLE scheduled_posts
  ADD CONSTRAINT scheduled_posts_publish_attempts_check
  CHECK (publish_attempts >= 0);
