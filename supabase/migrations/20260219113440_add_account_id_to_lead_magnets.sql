/*
  # Add instagram_account_id to lead_magnets

  ## Changes
  - Adds `instagram_account_id` column to `lead_magnets` table (nullable uuid, FK to instagram_accounts)
  - Adds index for fast lookup by user + account combination

  ## Notes
  - Column is nullable so existing records remain valid (NULL = applies to all accounts / legacy)
  - Users can now create separate lead magnets per Instagram account
  - RLS policies remain unchanged (user_id still controls access)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_magnets' AND column_name = 'instagram_account_id'
  ) THEN
    ALTER TABLE lead_magnets
      ADD COLUMN instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_magnets_user_account_idx
  ON lead_magnets (user_id, instagram_account_id);
