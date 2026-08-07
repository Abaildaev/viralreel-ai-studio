/*
  # Create video_templates table

  1. New Tables
    - `video_templates` (подложки - background videos for batch generation)
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users)
      - `name` (text) - display name
      - `file_path` (text) - path in Supabase storage
      - `duration` (real) - video duration in seconds
      - `file_size` (bigint) - file size in bytes
      - `has_audio` (boolean) - whether the video already has music
      - `is_active` (boolean) - soft toggle
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `video_templates` table
    - Add CRUD policies for authenticated users on own data
*/

CREATE TABLE IF NOT EXISTS video_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  duration real DEFAULT 0,
  file_size bigint DEFAULT 0,
  has_audio boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_templates_user_id ON video_templates(user_id);

ALTER TABLE video_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON video_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON video_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON video_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON video_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
