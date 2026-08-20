/*
  Attachments: a photo, a video or a file on any message the product sends.

  Until now every outgoing message was text plus one link button, which made
  the lead magnet a URL and nothing else. That is the wrong shape for most of
  what people actually promise under a Reel — a PDF, a checklist, a short
  video. Sending the file itself converts better than sending a link to it, and
  in Telegram it costs one API call.

  One shape, three places: a funnel step, a broadcast, and the Instagram Direct
  reply. The columns are identical so the editor, the senders and the preview
  can share a single notion of "an attachment" instead of three near-copies.

  Files live in a private bucket and travel to Telegram and Meta as a
  short-lived signed URL minted at send time — never at upload time. A drip
  step can go out a week after the author uploaded its video, so a URL signed
  in the browser would be long expired; the sender holds the service role and
  signs it fresh.
*/

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('funnel-media', 'funnel-media', false)
ON CONFLICT (id) DO NOTHING;

/*
  Own folder only, on every verb. The other buckets in this project let any
  authenticated user read any object because the renderer needed it; nothing
  needs that here, so this one is scoped properly from the start.
*/
DROP POLICY IF EXISTS "Users can read own funnel media" ON storage.objects;
CREATE POLICY "Users can read own funnel media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can upload own funnel media" ON storage.objects;
CREATE POLICY "Users can upload own funnel media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can replace own funnel media" ON storage.objects;
CREATE POLICY "Users can replace own funnel media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own funnel media" ON storage.objects;
CREATE POLICY "Users can delete own funnel media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

/*
  `attachment_` rather than `media_`: lead_magnets already spends `media_scope`
  and `media_ids` on something else entirely — which Instagram posts a rule
  watches — and two unrelated meanings of "media" on one row is how the wrong
  column gets read a year from now.

  The paired CHECK is the point of splitting type from path: half an
  attachment — a type with no file, or a file the sender does not know how to
  send — would fail at send time, days later, in a worker nobody is watching.
  Here it fails at the write instead.
*/
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['telegram_funnel_steps', 'telegram_broadcasts', 'lead_magnets']
  LOOP
    EXECUTE format(
      'ALTER TABLE %I
         ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT ''none'',
         ADD COLUMN IF NOT EXISTS attachment_path text NOT NULL DEFAULT '''',
         ADD COLUMN IF NOT EXISTS attachment_name text NOT NULL DEFAULT ''''',
      target
    );

    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      target, target || '_attachment_type_check'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I
         CHECK (attachment_type IN (''none'', ''photo'', ''video'', ''document''))',
      target, target || '_attachment_type_check'
    );

    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      target, target || '_attachment_pair_check'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I
         CHECK ((attachment_type = ''none'') = (attachment_path = ''''))',
      target, target || '_attachment_pair_check'
    );
  END LOOP;
END $$;
