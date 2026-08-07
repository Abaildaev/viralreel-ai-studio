/*
  # Add draft status and make scheduled_at nullable

  1. Changes to scheduled_posts
    - Add 'draft' to the allowed status values
    - Make `scheduled_at` nullable (drafts don't have a schedule yet)
    - Update existing index to continue covering pending posts only

  2. Flow change
    - Generated posts are now created as 'draft' with no scheduled time
    - User explicitly schedules them, which sets scheduled_at and status='pending'
    - Auto-publish cron only picks up 'pending' posts with scheduled_at <= now
    - This prevents accidental publishing of unreviewed content
*/

ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;
ALTER TABLE scheduled_posts ADD CONSTRAINT scheduled_posts_status_check
  CHECK (status IN ('draft', 'pending', 'publishing', 'published', 'failed'));

ALTER TABLE scheduled_posts ALTER COLUMN scheduled_at DROP NOT NULL;
