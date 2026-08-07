/*
  # Add updated_at column to scheduled_posts

  1. Changes to scheduled_posts
    - Add `updated_at` (timestamptz) column with default now()
    - Create trigger to auto-update `updated_at` on every row update

  2. Notes
    - This column is used to detect stuck "publishing" posts
    - The auto-publish cron job resets posts stuck in "publishing" for > 10 minutes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_scheduled_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_scheduled_posts_updated_at ON scheduled_posts;
CREATE TRIGGER set_scheduled_posts_updated_at
  BEFORE UPDATE ON scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_posts_updated_at();
