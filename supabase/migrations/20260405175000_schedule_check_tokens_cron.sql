/*
  # Schedule check-tokens cron job

  1. Changes
    - Creates a daily cron schedule to call the `check-tokens` Edge Function.
*/

SELECT cron.schedule(
  'check-instagram-tokens-daily',
  '0 12 * * *', -- Run every day at 12:00 PM
  $$
    SELECT net.http_post(
      url:=nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/check-tokens',
      headers:=jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
      body:='{}'::jsonb
    )
  $$
);
