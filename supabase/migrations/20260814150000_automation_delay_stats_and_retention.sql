/*
  Automation improvements:
  - an optional humanising delay before the bot answers;
  - per-scenario counters, so a dashboard with several rules is readable;
  - retention for the event log, which previously grew forever because every
    incoming comment and DM is stored with its full raw payload.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS reply_delay_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_reply_delay_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_reply_delay_check
    CHECK (reply_delay_seconds BETWEEN 0 AND 60);

/*
  security_invoker keeps the caller's RLS in force: without it the view would
  run as its owner and expose every user's counters.
*/
CREATE OR REPLACE VIEW lead_magnet_stats
WITH (security_invoker = on) AS
SELECT
  rule.id AS lead_magnet_id,
  rule.user_id,
  count(event.id) FILTER (WHERE event.status = 'sent') AS sent_count,
  count(event.id) FILTER (WHERE event.status = 'failed') AS failed_count,
  count(event.id) FILTER (WHERE event.status = 'ignored') AS ignored_count,
  max(event.created_at) FILTER (WHERE event.status = 'sent') AS last_sent_at
FROM lead_magnets rule
LEFT JOIN instagram_automation_events event ON event.lead_magnet_id = rule.id
GROUP BY rule.id, rule.user_id;

GRANT SELECT ON lead_magnet_stats TO authenticated;

/*
  Keeps the log useful for diagnostics without letting it grow without bound.
  cron.schedule upserts by job name, so re-running this migration is safe — and
  unlike touching cron.job directly, it works with the migration role's grants.
*/
SELECT cron.schedule(
  'cleanup-automation-events-daily',
  '30 3 * * *', -- Daily, half an hour after the storage cleanup.
  $$
    DELETE FROM instagram_automation_events
    WHERE created_at < now() - interval '90 days'
  $$
);
