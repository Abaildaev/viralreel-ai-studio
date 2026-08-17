/*
  Make the Instagram automation survive a burst.

  The webhook did all its work inside the request: it walked the batch of
  events one at a time and slept up to sixty seconds before each reply, to make
  the bot look human. That is fine at a trickle and fails exactly when it
  matters. An Edge Function worker lives 150 seconds on the free plan, so a
  batch of more than two or three delayed events is cut off mid-flight — and
  because the event row is inserted before processing, Meta's retry is
  deduplicated by the unique constraint and the lost events are lost for good.
  Silently. Precisely when a Reel takes off.

  So the webhook becomes what a webhook should be: validate, write down, answer
  200. A cron worker does the work, with retries, and the humanising delay
  becomes a timestamp to wait for rather than a sleep inside a request.

  Three columns carry the queue:
  - `attempts`        how many times the worker has tried;
  - `next_attempt_at` when it may try again — this is also where the reply
                      delay lives, so waiting costs nothing;
  - `claimed_at`      guards against two overlapping ticks taking the same row.
*/

ALTER TABLE instagram_automation_events
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

/*
  The worker's pickup query. Partial, because processed events vastly outnumber
  pending ones and only the pending ones are ever scanned.
*/
CREATE INDEX IF NOT EXISTS instagram_automation_events_queue_idx
  ON instagram_automation_events (next_attempt_at)
  WHERE status = 'received';

/* Counting an account's recent sends, for the hourly throttle. */
CREATE INDEX IF NOT EXISTS instagram_automation_events_account_sent_idx
  ON instagram_automation_events (instagram_account_id, created_at)
  WHERE status = 'sent';

/*
  The repeat guard used to be a read-then-write: count recent sends for this
  person and this rule, then send if there were none. Two comments arriving in
  the same second both read zero and both send, so the one thing the setting
  promises — that nobody is messaged twice — was not actually guaranteed.

  A unique index cannot express "within N hours", but it can express the case
  that matters: one successful delivery per person per rule per day. The worker
  still applies the configured window on top; this is the backstop that holds
  when two workers race.

  The day is pinned to UTC. Casting a timestamptz to date directly reads the
  session's TimeZone, which makes the expression merely STABLE and therefore
  illegal in an index — and would also mean the boundary moved with whoever
  happened to be connected.
*/
CREATE UNIQUE INDEX IF NOT EXISTS instagram_automation_events_one_send_per_day_idx
  ON instagram_automation_events (
    lead_magnet_id,
    sender_igsid,
    ((created_at AT TIME ZONE 'UTC')::date)
  )
  WHERE status = 'sent' AND lead_magnet_id IS NOT NULL AND sender_igsid IS NOT NULL;

/*
  The delay is no longer served by sleeping inside a request, so the sixty
  second ceiling that existed to fit the worker's lifetime can go. Fifteen
  minutes is a far more human pause, and it now costs nothing but a later
  `next_attempt_at`.
*/
ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_reply_delay_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_reply_delay_check
    CHECK (reply_delay_seconds BETWEEN 0 AND 900);

-- ---------------------------------------------------------------------------
-- Atomic claim
-- ---------------------------------------------------------------------------

/*
  Claiming work, done properly.

  PostgREST cannot express `UPDATE ... LIMIT`, nor `attempts = attempts + 1`,
  so doing this from the client means select-then-update — two statements with
  a gap between them where a second worker can claim the same rows. At a
  trickle that gap never opens; during the burst this whole change exists to
  survive, it opens constantly, and the symptom is someone receiving the lead
  magnet twice.

  `FOR UPDATE SKIP LOCKED` is the standard answer: each caller takes rows no
  other caller holds, in one statement, with the attempt counter incremented in
  the same breath.
*/
CREATE OR REPLACE FUNCTION claim_instagram_events(
  batch_size integer,
  claim_timeout interval DEFAULT interval '5 minutes'
)
RETURNS SETOF instagram_automation_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE instagram_automation_events AS event
  SET claimed_at = now(),
      attempts = event.attempts + 1
  WHERE event.id IN (
    SELECT candidate.id
    FROM instagram_automation_events AS candidate
    WHERE candidate.status = 'received'
      AND candidate.next_attempt_at <= now()
      AND (candidate.claimed_at IS NULL OR candidate.claimed_at < now() - claim_timeout)
    ORDER BY candidate.next_attempt_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING event.*;
END;
$$;

/* Only the service role runs the worker; nothing in the browser may claim. */
REVOKE ALL ON FUNCTION claim_instagram_events(integer, interval) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Worker schedule
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('instagram-automation-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'instagram-automation-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/instagram-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
