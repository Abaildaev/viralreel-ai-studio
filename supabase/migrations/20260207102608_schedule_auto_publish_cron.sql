/*
  # Schedule auto-publish cron job

  1. New cron job
    - `auto-publish-reels` runs every 2 minutes
    - Calls the `auto-publish` edge function via pg_net HTTP POST
    - The edge function finds pending posts whose scheduled time has passed
      and publishes them to Instagram automatically

  2. How it works
    - pg_cron triggers every 2 minutes
    - pg_net makes an async HTTP POST to the auto-publish edge function
    - The edge function picks the oldest due post, claims it atomically,
      uploads to Instagram, and updates the status
    - Stuck posts (in "publishing" > 10 min) are auto-recovered to "pending"

  3. Notes
    - No browser tab needs to be open for this to work
    - Posts will be published within ~2 minutes of their scheduled time
    - One post is processed per invocation to stay within edge function timeout
*/

DO $$
BEGIN
  PERFORM cron.unschedule('auto-publish-reels');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-publish-reels',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/auto-publish',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
