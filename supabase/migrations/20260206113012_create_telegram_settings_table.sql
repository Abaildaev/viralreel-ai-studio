/*
  # Create Telegram Settings Table

  1. New Tables
    - `telegram_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `bot_token` (text, encrypted bot token)
      - `chat_id` (text, channel or chat ID)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `telegram_settings` table
    - Add policies for authenticated users to manage their own settings
*/

CREATE TABLE IF NOT EXISTS telegram_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_token text NOT NULL,
  chat_id text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE telegram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram settings"
  ON telegram_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own telegram settings"
  ON telegram_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram settings"
  ON telegram_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own telegram settings"
  ON telegram_settings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
