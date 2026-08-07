/*
  # Scheduled Posts for Instagram Auto-Publishing

  1. New Tables
    - `scheduled_posts`
      - `id` (uuid, primary key) - unique identifier
      - `video_path` (text) - path to video in storage bucket
      - `caption` (text) - post description/caption
      - `scheduled_at` (timestamptz) - when to publish
      - `status` (text) - pending, publishing, published, failed
      - `instagram_media_id` (text) - ID returned by Instagram after publishing
      - `error_message` (text) - error details if failed
      - `created_at` (timestamptz) - when post was scheduled
      - `published_at` (timestamptz) - actual publish time

  2. Security
    - Enable RLS on `scheduled_posts` table
    - Public access for demo (in production, add auth)

  3. Notes
    - Posts ordered by scheduled_at for queue processing
    - Status tracks the publishing lifecycle
*/

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_path text NOT NULL,
  caption text NOT NULL DEFAULT '',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
  instagram_media_id text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for demo"
  ON scheduled_posts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_scheduled 
  ON scheduled_posts (status, scheduled_at) 
  WHERE status = 'pending';
