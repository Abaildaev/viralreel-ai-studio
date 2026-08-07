/*
  # Create templates storage bucket

  1. Storage
    - Create `templates` bucket for background video files (подложки)
    - Public read access for renderer to fetch videos
    - Authenticated upload/delete scoped to user's folder

  2. Policies
    - Anyone can read templates (needed for video rendering)
    - Authenticated users can upload to their own folder
    - Authenticated users can delete their own files
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read templates"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'templates');

CREATE POLICY "Users can upload to own template folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'templates'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own template files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'templates'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
