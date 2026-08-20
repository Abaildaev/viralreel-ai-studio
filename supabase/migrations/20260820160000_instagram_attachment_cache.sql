/*
  Upload the lead magnet's file to Meta once, not once per delivery.

  Today every firing of a rule hands Instagram a fresh signed URL, and
  Instagram fetches the file again — so a Reel that brings a thousand people
  moves the same PDF a thousand times, out of storage the owner pays for and
  through an API that rate-limits.

  Meta's answer is a reusable attachment: send it once with `is_reusable`, keep
  the id it hands back, and every later message references the id instead of a
  URL. Whether Instagram's messaging API returns that id the way Messenger's
  does is not something the documentation is clear about, so the worker treats
  it as a bonus — it caches an id when one arrives and falls back to the URL
  when none does. Nothing breaks if the answer turns out to be "never".

  Keyed by account as well as path because an attachment id belongs to the
  account that uploaded it, and by path so replacing the file invalidates the
  cache by simply not matching any more.
*/

CREATE TABLE IF NOT EXISTS instagram_attachment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  /* The object in `funnel-media`, not a URL: the URL is signed per send and
     is different every time. */
  attachment_path text NOT NULL,
  attachment_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, attachment_path)
);

ALTER TABLE instagram_attachment_cache ENABLE ROW LEVEL SECURITY;

/*
  Written only by the worker, which holds the service role. The owner may read
  their own rows — useful when explaining why a file stopped re-uploading —
  but there is nothing here for the browser to write.
*/
DROP POLICY IF EXISTS "Users can view own instagram attachment cache"
  ON instagram_attachment_cache;
CREATE POLICY "Users can view own instagram attachment cache"
  ON instagram_attachment_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM instagram_accounts account
      WHERE account.id = instagram_attachment_cache.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );
