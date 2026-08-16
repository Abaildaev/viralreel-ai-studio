/*
  Turn the funnel from a fixed shape into a sequence.

  Until now a funnel could say exactly two things after the subscription gate:
  hand over the material, then make one follow-up ask. That is the right shape
  for a single lead magnet and the wrong shape for the thing people actually
  want to build — a free course delivered over a week, a lesson a day, each one
  earning the next.

  So the tail of the funnel becomes an ordered list of steps with a delay
  before each. The head does not change: the greeting and the channel gate are
  the entry protocol, not content, and they stay on the funnel itself.

  `telegram_step_deliveries` is the schedule, one row per person per step. Its
  unique constraint is the important part — it is what guarantees that lesson
  four is never sent twice, no matter how many times a worker retries or how
  many times the reader restarts the bot.
*/

CREATE TABLE IF NOT EXISTS telegram_funnel_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES telegram_funnels(id) ON DELETE CASCADE,
  /* Contiguity is not enforced: reordering in the editor renumbers freely, and
     only the relative order matters to the sender. */
  position integer NOT NULL,
  /* Internal label — "Урок 3". Never sent, only shown in the editor. */
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  button_text text NOT NULL DEFAULT '',
  button_url text NOT NULL DEFAULT '',
  /*
    Wait before this step, measured from the previous one. Zero means it goes
    out in the same breath, which is what the first step almost always wants.
    Capped at a year — anything longer is a mistake, not a campaign.
  */
  delay_minutes integer NOT NULL DEFAULT 0
    CHECK (delay_minutes BETWEEN 0 AND 525600),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_id, position)
);

CREATE INDEX IF NOT EXISTS telegram_funnel_steps_funnel_idx
  ON telegram_funnel_steps (funnel_id, position);

ALTER TABLE telegram_funnel_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can view own funnel steps"
  ON telegram_funnel_steps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can insert own funnel steps"
  ON telegram_funnel_steps FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can update own funnel steps"
  ON telegram_funnel_steps FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can delete own funnel steps"
  ON telegram_funnel_steps FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  The schedule.

  Materialised one step ahead rather than all at once: a course whose later
  lessons are still being written should not have its schedule frozen the
  moment the first subscriber arrives.
*/
CREATE TABLE IF NOT EXISTS telegram_step_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES telegram_subscribers(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES telegram_funnel_steps(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  /* One lesson, one person, once. This is the constraint the whole engine
     leans on, so a retry can never turn into a duplicate. */
  UNIQUE (subscriber_id, step_id)
);

/* The worker's pickup query. */
CREATE INDEX IF NOT EXISTS telegram_step_deliveries_due_idx
  ON telegram_step_deliveries (due_at)
  WHERE status = 'pending';

ALTER TABLE telegram_step_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own step deliveries" ON telegram_step_deliveries;
CREATE POLICY "Users can view own step deliveries"
  ON telegram_step_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM telegram_bots bot
      WHERE bot.id = telegram_step_deliveries.telegram_bot_id
        AND bot.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Move the existing fixed copy into the sequence
-- ---------------------------------------------------------------------------

/*
  The material a funnel already promised becomes step one, and the follow-up
  ask becomes step two. Ordering by id keeps the insert deterministic.
*/
INSERT INTO telegram_funnel_steps (user_id, funnel_id, position, title, body, button_text, button_url, delay_minutes)
SELECT
  funnel.user_id,
  funnel.id,
  1,
  'Выдача материала',
  funnel.delivery_text,
  funnel.delivery_button_text,
  funnel.delivery_url,
  0
FROM telegram_funnels funnel
WHERE funnel.delivery_text <> '' OR funnel.delivery_url <> ''
ON CONFLICT (funnel_id, position) DO NOTHING;

INSERT INTO telegram_funnel_steps (user_id, funnel_id, position, title, body, button_text, button_url, delay_minutes)
SELECT
  funnel.user_id,
  funnel.id,
  2,
  'Целевое действие',
  funnel.cta_text,
  funnel.cta_button_text,
  funnel.cta_url,
  0
FROM telegram_funnels funnel
WHERE funnel.cta_text <> ''
ON CONFLICT (funnel_id, position) DO NOTHING;

/*
  Dropped rather than left in place. Two descriptions of what a funnel sends
  would drift the moment someone edits one of them, and the step list is now
  the only one the sender reads.
*/
ALTER TABLE telegram_funnels
  DROP COLUMN IF EXISTS delivery_text,
  DROP COLUMN IF EXISTS delivery_url,
  DROP COLUMN IF EXISTS delivery_button_text,
  DROP COLUMN IF EXISTS cta_text,
  DROP COLUMN IF EXISTS cta_url,
  DROP COLUMN IF EXISTS cta_button_text;

-- ---------------------------------------------------------------------------
-- Sequence progress, per subscriber
-- ---------------------------------------------------------------------------

/*
  `delivered_at` used to mean "received the one thing this funnel sends". With a
  sequence it keeps its original meaning — the first step landed, the promise
  was kept — and `sequence_done_at` records reaching the end.
*/
ALTER TABLE telegram_subscribers
  ADD COLUMN IF NOT EXISTS sequence_done_at timestamptz;

-- ---------------------------------------------------------------------------
-- Drip worker schedule
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-drip-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'telegram-drip-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/telegram-drip',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
