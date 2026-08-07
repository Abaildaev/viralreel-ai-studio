/*
  # Update auto-publish cron to every minute

  1. Changes
    - Changed cron schedule from every 2 minutes to every 1 minute
    - This ensures posts are published faster after their scheduled time

  2. Notes
    - The edge function still processes one post per invocation
    - Stuck posts are auto-recovered after 10 minutes
*/

DO $$
BEGIN
  PERFORM cron.unschedule('auto-publish-reels');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-publish-reels',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/auto-publish',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
