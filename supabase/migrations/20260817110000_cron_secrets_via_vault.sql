/*
  Give the scheduled jobs a working way to reach the Edge Functions.

  Every cron job built its request from `current_setting('app.settings.…')`,
  which the README asks the operator to populate with `ALTER DATABASE … SET`.
  Two things go wrong with that. It is a manual step nobody remembers, and on a
  Supabase project the `postgres` role is not a superuser, so the ALTER is
  simply refused — the setting can never be applied by the person following the
  instructions.

  The result is a null URL, an insert into pg_net's queue that violates a
  NOT NULL constraint, and a job that fails on its first line. Failures land in
  `cron.job_run_details`, which nothing reads, so the jobs look active and
  scheduled forever while doing nothing at all.

  Supabase Vault is the supported place for this, and it needs no elevated
  role. One helper reads both values and raises if either is missing, so a
  misconfigured project fails loudly on the first tick instead of silently
  forever.
*/

CREATE OR REPLACE FUNCTION invoke_edge_function(function_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE EXCEPTION
      'Vault secrets "project_url" and "cron_secret" are required before scheduled jobs can run';
  END IF;

  SELECT net.http_post(
    url := base_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', secret
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RETURN request_id;
END;
$$;

/*
  This function holds the cron secret and will call any Edge Function named.
  Only the scheduler needs it; nothing reachable from the browser may.
*/
REVOKE ALL ON FUNCTION invoke_edge_function(text) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Re-point every scheduled job
-- ---------------------------------------------------------------------------

/* cron.schedule upserts by job name, so this replaces the commands in place. */
SELECT cron.schedule('auto-publish-reels', '* * * * *',
  $$SELECT invoke_edge_function('auto-publish')$$);

SELECT cron.schedule('check-instagram-tokens-daily', '0 12 * * *',
  $$SELECT invoke_edge_function('check-tokens')$$);

SELECT cron.schedule('cleanup-archived-video-reels-daily', '0 3 * * *',
  $$SELECT invoke_edge_function('cleanup-storage')$$);

SELECT cron.schedule('telegram-broadcast-worker', '* * * * *',
  $$SELECT invoke_edge_function('telegram-broadcast')$$);

SELECT cron.schedule('telegram-drip-worker', '* * * * *',
  $$SELECT invoke_edge_function('telegram-drip')$$);

SELECT cron.schedule('instagram-automation-worker', '* * * * *',
  $$SELECT invoke_edge_function('instagram-worker')$$);
