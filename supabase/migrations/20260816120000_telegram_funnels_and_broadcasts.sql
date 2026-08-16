/*
  Telegram: funnels, subscribers and broadcasts.

  The Instagram side already turns a codeword into a Direct message with a
  button. That button can point anywhere, and pointing it at a Telegram bot
  solves the platform's hardest limit: Instagram only allows messaging someone
  within 24 hours of their last message, while a Telegram subscriber stays
  reachable indefinitely. This migration gives that destination somewhere to
  live.

  Five tables:
  - `telegram_bots`      one bot per user, token encrypted at rest;
  - `telegram_funnels`   the /start scenario: greet, gate on a channel
                         subscription, deliver the lead magnet, offer the CTA;
  - `telegram_subscribers` one row per person, carrying attribution back to the
                         Instagram comment that produced them;
  - `telegram_broadcasts` a composed message plus its audience segment;
  - `telegram_broadcast_recipients` the send queue, one row per person, so a
                         broadcast survives a worker restart and can be resumed.

  Attribution is the point of the whole design. The Direct button carries
  `?start=<slug>_<automation_event_id>`, the bot writes that event id onto the
  subscriber, and `telegram_funnel_stats` can then answer "which codeword under
  which Reel produced these subscribers" rather than only "how many arrived".
*/

-- ---------------------------------------------------------------------------
-- Bots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /* AES-GCM, same scheme as user_ai_credentials. A bot token is full control
     over the bot, so it never travels back to the browser. */
  bot_token_encrypted text NOT NULL,
  /* Random per-bot value echoed by Telegram in X-Telegram-Bot-Api-Secret-Token,
     so the webhook can reject forged updates the way instagram-webhook rejects
     unsigned payloads. */
  webhook_secret text NOT NULL,
  bot_username text NOT NULL DEFAULT '',
  bot_name text NOT NULL DEFAULT '',
  /* The channel a funnel may require a subscription to. Set through the setup
     function, which verifies the bot is actually an administrator there. */
  channel_id text NOT NULL DEFAULT '',
  channel_title text NOT NULL DEFAULT '',
  channel_username text NOT NULL DEFAULT '',
  channel_invite_url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  webhook_set_at timestamptz,
  last_error text,
  /* Shown as a progress target on the analytics tab. */
  subscriber_goal integer NOT NULL DEFAULT 1000
    CHECK (subscriber_goal BETWEEN 1 AND 10000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE telegram_bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram bot" ON telegram_bots;
CREATE POLICY "Users can view own telegram bot"
  ON telegram_bots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram bot" ON telegram_bots;
CREATE POLICY "Users can update own telegram bot"
  ON telegram_bots FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram bot" ON telegram_bots;
CREATE POLICY "Users can delete own telegram bot"
  ON telegram_bots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  Column grants hide both secrets from the browser, the same treatment
  instagram_accounts.access_token got in 20260814120500. `SELECT *` on this
  table fails for the frontend by design — clients list the columns they need.

  There is no INSERT grant: rows are created only by the telegram-setup
  function, which holds the token and runs with the service role.
*/
REVOKE ALL PRIVILEGES ON TABLE telegram_bots FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  bot_username,
  bot_name,
  channel_id,
  channel_title,
  channel_username,
  channel_invite_url,
  is_active,
  webhook_set_at,
  last_error,
  subscriber_goal,
  created_at,
  updated_at
) ON TABLE telegram_bots TO authenticated;

GRANT UPDATE (is_active, subscriber_goal, updated_at) ON TABLE telegram_bots TO authenticated;
GRANT DELETE ON TABLE telegram_bots TO authenticated;

-- ---------------------------------------------------------------------------
-- Funnels
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  /* Links the funnel back to the Instagram codeword that feeds it, so the
     rules page and this page describe one journey rather than two features. */
  lead_magnet_id uuid REFERENCES lead_magnets(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  /*
    The deep-link payload prefix. Telegram allows 64 characters of
    [A-Za-z0-9_-] after `?start=`, and the payload we build is
    `<slug>_<automation_event_id>` — 36 characters of UUID plus a separator,
    which is why the slug is capped at 24 and forbidden from containing the
    underscore that splits the two halves.
  */
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]{2,24}$'),
  welcome_text text NOT NULL DEFAULT '',
  /* The subscription gate. Off means the material is handed over immediately. */
  require_subscription boolean NOT NULL DEFAULT true,
  subscribe_button_text text NOT NULL DEFAULT 'Подписаться на канал',
  check_button_text text NOT NULL DEFAULT 'Я подписался',
  not_subscribed_text text NOT NULL DEFAULT 'Пока не вижу подписки. Подпишитесь и нажмите кнопку ещё раз 🙌',
  delivery_text text NOT NULL DEFAULT '',
  delivery_url text NOT NULL DEFAULT '',
  delivery_button_text text NOT NULL DEFAULT 'Забрать материал',
  /* The second ask, after the material is already in their hands. */
  cta_text text NOT NULL DEFAULT '',
  cta_url text NOT NULL DEFAULT '',
  cta_button_text text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  /* Answers a bare /start with no payload, and anyone arriving from a plain
     link. At most one per bot. */
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_bot_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_funnels_one_default_idx
  ON telegram_funnels (telegram_bot_id)
  WHERE is_default;

ALTER TABLE telegram_funnels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can view own telegram funnels"
  ON telegram_funnels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can insert own telegram funnels"
  ON telegram_funnels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can update own telegram funnels"
  ON telegram_funnels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can delete own telegram funnels"
  ON telegram_funnels FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Subscribers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  funnel_id uuid REFERENCES telegram_funnels(id) ON DELETE SET NULL,
  /* The Instagram comment that started it all. NULL for people who found the
     bot some other way. */
  automation_event_id uuid REFERENCES instagram_automation_events(id) ON DELETE SET NULL,
  instagram_sender_igsid text,
  telegram_user_id text NOT NULL,
  username text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  language_code text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'link'
    CHECK (source IN ('instagram', 'link', 'channel')),
  /*
    The funnel, as timestamps. Each NULL is a person who stopped at that step,
    which is what makes per-step drop-off a query rather than a guess.
  */
  started_at timestamptz NOT NULL DEFAULT now(),
  subscribed_at timestamptz,
  delivered_at timestamptz,
  signed_up_at timestamptz,
  unsubscribed_at timestamptz,
  /* Telegram reports 403 when someone blocks the bot. Recording it keeps
     broadcasts from burning quota on people who cannot receive them. */
  is_blocked boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_bot_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS telegram_subscribers_bot_created_idx
  ON telegram_subscribers (telegram_bot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_subscribers_funnel_idx
  ON telegram_subscribers (funnel_id);

CREATE INDEX IF NOT EXISTS telegram_subscribers_event_idx
  ON telegram_subscribers (automation_event_id);

ALTER TABLE telegram_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram subscribers" ON telegram_subscribers;
CREATE POLICY "Users can view own telegram subscribers"
  ON telegram_subscribers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram subscribers" ON telegram_subscribers;
CREATE POLICY "Users can update own telegram subscribers"
  ON telegram_subscribers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram subscribers" ON telegram_subscribers;
CREATE POLICY "Users can delete own telegram subscribers"
  ON telegram_subscribers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Broadcasts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  message_text text NOT NULL DEFAULT '',
  button_text text NOT NULL DEFAULT '',
  button_url text NOT NULL DEFAULT '',
  disable_notification boolean NOT NULL DEFAULT false,
  segment text NOT NULL DEFAULT 'all'
    CHECK (segment IN ('all', 'subscribed', 'delivered', 'not_delivered', 'from_instagram', 'funnel')),
  segment_funnel_id uuid REFERENCES telegram_funnels(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_broadcasts_bot_created_idx
  ON telegram_broadcasts (telegram_bot_id, created_at DESC);

/* The worker's pickup query. */
CREATE INDEX IF NOT EXISTS telegram_broadcasts_due_idx
  ON telegram_broadcasts (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

ALTER TABLE telegram_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can view own telegram broadcasts"
  ON telegram_broadcasts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can insert own telegram broadcasts"
  ON telegram_broadcasts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can update own telegram broadcasts"
  ON telegram_broadcasts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can delete own telegram broadcasts"
  ON telegram_broadcasts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  The send queue. Materialising the audience when a broadcast starts — rather
  than re-running the segment query on every batch — means the worker can be
  killed mid-send and resume exactly where it stopped, and that nobody receives
  the same message twice because they happened to match the segment again.
*/
CREATE TABLE IF NOT EXISTS telegram_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES telegram_broadcasts(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES telegram_subscribers(id) ON DELETE CASCADE,
  telegram_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  sent_at timestamptz,
  UNIQUE (broadcast_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS telegram_broadcast_recipients_pending_idx
  ON telegram_broadcast_recipients (broadcast_id, status)
  WHERE status = 'pending';

ALTER TABLE telegram_broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own broadcast recipients" ON telegram_broadcast_recipients;
CREATE POLICY "Users can view own broadcast recipients"
  ON telegram_broadcast_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM telegram_broadcasts broadcast
      WHERE broadcast.id = telegram_broadcast_recipients.broadcast_id
        AND broadcast.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Funnel statistics
-- ---------------------------------------------------------------------------

/*
  Per-funnel counts for the analytics tab. `security_invoker` makes the view run
  under the caller's privileges, so the RLS policy on telegram_subscribers
  applies here too and a view cannot become a way around it.
*/
CREATE OR REPLACE VIEW telegram_funnel_stats
WITH (security_invoker = true) AS
SELECT
  funnel.id AS funnel_id,
  funnel.user_id,
  funnel.telegram_bot_id,
  funnel.name,
  funnel.slug,
  count(subscriber.id) AS started_count,
  count(subscriber.subscribed_at) AS subscribed_count,
  count(subscriber.delivered_at) AS delivered_count,
  count(subscriber.signed_up_at) AS signed_up_count,
  count(subscriber.id) FILTER (WHERE subscriber.source = 'instagram') AS from_instagram_count,
  count(subscriber.id) FILTER (WHERE subscriber.is_blocked) AS blocked_count,
  max(subscriber.created_at) AS last_subscriber_at
FROM telegram_funnels funnel
LEFT JOIN telegram_subscribers subscriber ON subscriber.funnel_id = funnel.id
GROUP BY funnel.id, funnel.user_id, funnel.telegram_bot_id, funnel.name, funnel.slug;

GRANT SELECT ON telegram_funnel_stats TO authenticated;

-- ---------------------------------------------------------------------------
-- Broadcast worker schedule
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-broadcast-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'telegram-broadcast-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/telegram-broadcast',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
