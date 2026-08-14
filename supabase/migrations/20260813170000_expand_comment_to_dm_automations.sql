/*
  Turn keyword rules into complete Instagram comment-to-DM scenarios.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS public_reply_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_reply_variants text[] NOT NULL DEFAULT ARRAY['Отправил в Direct 🙌']::text[],
  ADD COLUMN IF NOT EXISTS media_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS media_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS repeat_delay_hours integer NOT NULL DEFAULT 24;

UPDATE lead_magnets
SET keywords = ARRAY[codeword]
WHERE cardinality(keywords) = 0 AND codeword <> '';

ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_media_scope_check,
  DROP CONSTRAINT IF EXISTS lead_magnets_repeat_delay_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_media_scope_check
    CHECK (media_scope IN ('all', 'selected')),
  ADD CONSTRAINT lead_magnets_repeat_delay_check
    CHECK (repeat_delay_hours BETWEEN 0 AND 8760);

ALTER TABLE instagram_automation_events
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS commenter_username text,
  ADD COLUMN IF NOT EXISTS public_reply_status text NOT NULL DEFAULT 'skipped',
  ADD COLUMN IF NOT EXISTS public_reply_id text,
  ADD COLUMN IF NOT EXISTS dm_status text NOT NULL DEFAULT 'pending';

ALTER TABLE instagram_automation_events
  DROP CONSTRAINT IF EXISTS instagram_automation_events_public_reply_status_check,
  DROP CONSTRAINT IF EXISTS instagram_automation_events_dm_status_check;

ALTER TABLE instagram_automation_events
  ADD CONSTRAINT instagram_automation_events_public_reply_status_check
    CHECK (public_reply_status IN ('pending', 'sent', 'skipped', 'failed')),
  ADD CONSTRAINT instagram_automation_events_dm_status_check
    CHECK (dm_status IN ('pending', 'sent', 'skipped', 'failed'));

CREATE INDEX IF NOT EXISTS instagram_automation_events_sender_rule_created_idx
  ON instagram_automation_events (sender_igsid, lead_magnet_id, created_at DESC);
