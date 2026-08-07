/*
  # Add gemini_api_key to profiles table

  1. Changes
    - Add `gemini_api_key` column to `profiles` table (nullable text, default empty string)

  2. Notes
    - This allows persisting the Gemini API key per user in the database
    - The key is stored as plain text (it's the user's own key, not a system secret)
    - RLS already enabled on profiles table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'gemini_api_key'
  ) THEN
    ALTER TABLE profiles ADD COLUMN gemini_api_key text DEFAULT '' NOT NULL;
  END IF;
END $$;
