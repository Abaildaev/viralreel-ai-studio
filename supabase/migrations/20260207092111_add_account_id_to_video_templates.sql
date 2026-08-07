/*
  # Add instagram_account_id to video_templates

  1. Changes
    - Add `instagram_account_id` (uuid, nullable FK to instagram_accounts) to `video_templates`
    - Each template now belongs to a specific Instagram account
    - Index for faster lookups by account

  2. Notes
    - Nullable to allow existing templates without account
    - ON DELETE SET NULL to not lose templates if account is removed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'video_templates' AND column_name = 'instagram_account_id'
  ) THEN
    ALTER TABLE video_templates ADD COLUMN instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_templates_account_id ON video_templates(instagram_account_id);
