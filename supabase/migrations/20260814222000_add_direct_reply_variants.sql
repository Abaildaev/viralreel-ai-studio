/* Multiple Direct messages per lead magnet, selected randomly for each trigger. */
ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS direct_reply_variants text[] NOT NULL DEFAULT '{}'::text[];

UPDATE lead_magnets
SET direct_reply_variants = ARRAY[reply_text]
WHERE cardinality(direct_reply_variants) = 0
  AND btrim(reply_text) <> '';
