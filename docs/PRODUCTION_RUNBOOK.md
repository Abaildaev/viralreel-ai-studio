# Production runbook

## Release checks

Run `npm ci && npm test` before merging. Netlify builds `dist` with Node 20;
only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in its environment.

Apply database migrations before deploying workers, then deploy the workers. A
worker release is incomplete until its cron endpoint returns `401` without the
cron secret and a signed-in smoke test can load Automations and Telegram.

## Queue health

In Supabase SQL Editor, inspect the delivery queues with:

```sql
select status, count(*)
from public.telegram_step_deliveries
group by status
order by status;

select status, count(*)
from public.telegram_broadcast_recipients
group by status
order by status;

select count(*) as stale_processing
from public.telegram_step_deliveries
where status = 'processing'
  and claimed_at < now() - interval '5 minutes';
```

Alert when `stale_processing` is non-zero for two consecutive minutes, when
`failed` grows between checks, or when the oldest pending row is more than one
scheduled interval late. Do not manually mark rows as sent: use the stored
`telegram_message_id` and the Edge Function logs to reconcile a suspected
Telegram/API crash first.

## Credential rotation

Rotate exposed Supabase access tokens immediately. Rotate `CRON_SECRET` and
`CREDENTIALS_ENCRYPTION_KEY` only with a planned maintenance window: the latter
requires re-encrypting existing credentials before old ciphertext is discarded.
