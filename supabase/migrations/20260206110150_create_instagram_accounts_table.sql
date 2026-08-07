/*
  # Instagram Accounts Management

  1. New Tables
    - `instagram_accounts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `account_name` (text) - display name for the account
      - `username` (text) - Instagram username
      - `ig_user_id` (text) - Instagram API user ID
      - `access_token` (text) - Instagram API access token
      - `profile_picture_url` (text) - avatar URL
      - `is_active` (boolean) - whether account is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Add `instagram_account_id` column to `scheduled_posts` table

  3. Security
    - Enable RLS on `instagram_accounts` table
    - Add policies for authenticated users to manage their own accounts
*/

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  ig_user_id text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT '',
  profile_picture_url text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own instagram accounts"
  ON instagram_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own instagram accounts"
  ON instagram_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own instagram accounts"
  ON instagram_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own instagram accounts"
  ON instagram_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'instagram_account_id'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_instagram_account_id ON scheduled_posts(instagram_account_id);