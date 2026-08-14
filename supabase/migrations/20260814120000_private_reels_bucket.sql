/*
  Close public read access to the reels bucket.

  Previously the bucket was public and `storage.objects` allowed SELECT to the
  `public` role for every object in it, so anyone holding the anon key (it ships
  in the frontend bundle) could list and download every user's videos, including
  unpublished drafts.

  The bucket is now private:
  - the frontend signs short-lived URLs for its own folder only;
  - Edge Functions sign a URL with the service role right before handing it to
    Instagram or Telegram.
*/

UPDATE storage.buckets SET public = false WHERE id = 'reels';

DROP POLICY IF EXISTS "Anyone can read reels" ON storage.objects;

DROP POLICY IF EXISTS "Users can read own reels" ON storage.objects;
CREATE POLICY "Users can read own reels"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
