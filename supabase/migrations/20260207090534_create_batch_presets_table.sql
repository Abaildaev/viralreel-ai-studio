/*
  # Create batch_presets table

  1. New Tables
    - `batch_presets` - Configuration for automatic batch content generation
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users)
      - `instagram_account_id` (uuid, FK to instagram_accounts, nullable)
      - `name` (text) - preset name for display
      - `topics` (jsonb) - array of topic strings for AI generation
      - `tone` (text) - tone for AI: provocative, educational, etc.
      - `cta_type` (text) - 'telegram' or 'codeword'
      - `audio_mode` (text) - 'from_video', 'random', 'specific', 'none'
      - `audio_file_id` (uuid, FK to audio_files, nullable) - for 'specific' mode
      - `variations_count` (integer) - how many videos to generate per run
      - `text_style` (jsonb) - font settings preset
      - `schedule_interval_minutes` (integer) - interval between scheduled posts
      - `is_active` (boolean)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `batch_presets` table
    - CRUD policies for authenticated users on own data
*/

CREATE TABLE IF NOT EXISTS batch_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  tone text NOT NULL DEFAULT 'provocative',
  cta_type text NOT NULL DEFAULT 'telegram',
  audio_mode text NOT NULL DEFAULT 'from_video',
  audio_file_id uuid REFERENCES audio_files(id) ON DELETE SET NULL,
  variations_count integer NOT NULL DEFAULT 5,
  text_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_interval_minutes integer NOT NULL DEFAULT 120,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_presets_user_id ON batch_presets(user_id);

ALTER TABLE batch_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own presets"
  ON batch_presets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own presets"
  ON batch_presets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presets"
  ON batch_presets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own presets"
  ON batch_presets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
