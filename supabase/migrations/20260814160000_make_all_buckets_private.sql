/*
  Close public read access to templates and audio buckets and drop obsolete gemini_api_key.

  Previously `templates` and `audio` were public, allowing any anon client
  to list and download user templates and audio tracks.

  Now:
  - `templates` and `audio` are private (public = false).
  - Authenticated users read objects via short-lived signed URLs.
  - Drop obsolete `gemini_api_key` column from `profiles`.
*/

UPDATE storage.buckets SET public = false WHERE id IN ('templates', 'audio');

DROP POLICY IF EXISTS "Anyone can read templates" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own templates" ON storage.objects;
CREATE POLICY "Users can read own templates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'templates'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.uid() IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Anyone can read audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own audio" ON storage.objects;
CREATE POLICY "Users can read own audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'audio'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.uid() IS NOT NULL
    )
  );

-- Drop obsolete gemini_api_key from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS gemini_api_key;
