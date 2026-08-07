/*
  # Add token expiration monitoring

  1. Changes
    - Add `token_expires_at` column to `instagram_accounts`.
    - Update existing records to estimate expiration based on created_at + 60 days.
*/

ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS token_expires_at timestamptz DEFAULT (now() + interval '60 days');

UPDATE instagram_accounts 
SET token_expires_at = created_at + interval '60 days' 
WHERE token_expires_at IS NULL;
