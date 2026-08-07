/*
  # Schedule cleanup-storage cron job

  1. Changes
    - Creates a daily cron schedule to call the `cleanup-storage` Edge Function.
*/

SELECT cron.schedule(
  'cleanup-archived-video-reels-daily',
  '0 3 * * *', -- Run every day at 3:00 AM
  $$
    SELECT net.http_post(
      url:=nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/cleanup-storage',
      headers:=jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
      body:='{}'::jsonb
    )
  $$
);
