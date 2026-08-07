/*
  Production hardening:
  - add the key column used by the frontend;
  - create the reels bucket used by all generation flows;
  - allow cleanup to null the stored path while retaining history rows;
  - scope Storage writes and deletes to the user's folder.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deepseek_api_key text NOT NULL DEFAULT '';

ALTER TABLE scheduled_posts
  ALTER COLUMN video_path DROP NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reels', 'reels', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Anyone can read reels" ON storage.objects;
CREATE POLICY "Anyone can read reels"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'reels');

DROP POLICY IF EXISTS "Users can upload own reels" ON storage.objects;
CREATE POLICY "Users can upload own reels"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own reels" ON storage.objects;
CREATE POLICY "Users can update own reels"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own reels" ON storage.objects;
CREATE POLICY "Users can delete own reels"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
