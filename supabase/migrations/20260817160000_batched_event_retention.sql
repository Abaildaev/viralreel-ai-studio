/*
  Retention that stays cheap as the log grows.

  The nightly cleanup was a single `DELETE ... WHERE created_at < now() - 90
  days`. At a handful of events a day that is instant. At a thousand a day the
  table holds ninety thousand rows, each carrying the full webhook payload as
  jsonb, and one statement has to find and remove a day's worth in a single
  transaction — holding locks and writing one large WAL record while the
  workers are trying to claim from the same table.

  Two changes, both about the payload rather than the row.

  `raw_event` is the bulky part and the part that stops being useful first. It
  exists to diagnose "why did this comment behave oddly", which is a question
  asked within days, not months. So it is emptied after two weeks while the
  event itself — status, timings, which rule matched — survives the full ninety
  days for the analytics that read it.

  And both passes run in bounded batches with a commit between them, so the
  job never holds a long transaction against a table the workers are using.
*/

CREATE OR REPLACE FUNCTION prune_automation_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_size constant integer := 2000;
  /* Enough headroom for a very busy day without ever becoming unbounded: if
     there is more to do, tomorrow's run picks it up. */
  max_batches constant integer := 100;
  trimmed integer := 0;
  deleted integer := 0;
  affected integer;
BEGIN
  FOR i IN 1..max_batches LOOP
    UPDATE instagram_automation_events
    SET raw_event = '{}'::jsonb
    WHERE id IN (
      SELECT id
      FROM instagram_automation_events
      WHERE created_at < now() - interval '14 days'
        AND raw_event <> '{}'::jsonb
      LIMIT batch_size
    );

    GET DIAGNOSTICS affected = ROW_COUNT;
    trimmed := trimmed + affected;
    EXIT WHEN affected = 0;
  END LOOP;

  FOR i IN 1..max_batches LOOP
    DELETE FROM instagram_automation_events
    WHERE id IN (
      SELECT id
      FROM instagram_automation_events
      WHERE created_at < now() - interval '90 days'
      LIMIT batch_size
    );

    GET DIAGNOSTICS affected = ROW_COUNT;
    deleted := deleted + affected;
    EXIT WHEN affected = 0;
  END LOOP;

  RETURN jsonb_build_object('trimmed', trimmed, 'deleted', deleted);
END;
$$;

REVOKE ALL ON FUNCTION prune_automation_events() FROM public, anon, authenticated;

/* Supports both passes: finding old rows, and old rows that still carry a
   payload. */
CREATE INDEX IF NOT EXISTS instagram_automation_events_created_idx
  ON instagram_automation_events (created_at);

SELECT cron.schedule(
  'cleanup-automation-events-daily',
  '30 3 * * *',
  $$SELECT prune_automation_events()$$
);
