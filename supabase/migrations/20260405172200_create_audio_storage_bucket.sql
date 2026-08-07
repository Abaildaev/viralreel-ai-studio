/*
  # Create audio storage bucket

  1. Storage
    - Create `audio` bucket for background audio files
    - Public read access for renderer to fetch audios
    - Authenticated upload/delete scoped to user's folder

  2. Policies
    - Anyone can read audio (needed for video rendering)
    - Authenticated users can upload to their own folder
    - Authenticated users can delete their own files
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read audio"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'audio');

CREATE POLICY "Users can upload to own audio folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own audio files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
