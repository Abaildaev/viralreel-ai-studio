/*
  Instagram keyword automations:
  - extend lead magnets with an automated reply and trigger settings;
  - record webhook processing for idempotency and diagnostics;
  - track account-level webhook subscription status.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS reply_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS response_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS match_mode text NOT NULL DEFAULT 'contains',
  ADD COLUMN IF NOT EXISTS trigger_dm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trigger_comments boolean NOT NULL DEFAULT true;

ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_match_mode_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_match_mode_check
  CHECK (match_mode IN ('exact', 'contains'));

ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS webhook_subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_error text;

CREATE TABLE IF NOT EXISTS instagram_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  lead_magnet_id uuid REFERENCES lead_magnets(id) ON DELETE SET NULL,
  meta_event_id text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('dm', 'comment')),
  sender_igsid text,
  incoming_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'ignored', 'sent', 'failed')),
  response_message_id text,
  error_message text,
  raw_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (instagram_account_id, meta_event_id)
);

CREATE INDEX IF NOT EXISTS instagram_automation_events_account_created_idx
  ON instagram_automation_events (instagram_account_id, created_at DESC);

ALTER TABLE instagram_automation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own instagram automation events"
  ON instagram_automation_events;

CREATE POLICY "Users can view own instagram automation events"
  ON instagram_automation_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM instagram_accounts account
      WHERE account.id = instagram_automation_events.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );
