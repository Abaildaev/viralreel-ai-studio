/*
  # Add sort_order column to scheduled_posts

  1. Modified Tables
    - `scheduled_posts`
      - Added `sort_order` (integer, default 0) - controls display order in the scheduler queue

  2. Notes
    - Allows users to shuffle/reorder posts independently of created_at
    - Default value 0, lower numbers appear first
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN sort_order integer DEFAULT 0;
  END IF;
END $$;

UPDATE scheduled_posts
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, instagram_account_id ORDER BY created_at DESC) AS rn
  FROM scheduled_posts
) sub
WHERE scheduled_posts.id = sub.id AND scheduled_posts.sort_order = 0;