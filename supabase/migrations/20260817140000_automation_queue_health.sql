/*
  Make the state of the automation queue visible.

  Now that comments are processed from a queue rather than inside the webhook,
  a backlog is a real state the account can be in: Meta throttling the account,
  an expired token, a worker that stopped. All of those look identical from the
  interface today — events simply stop appearing — and the owner finds out from
  a customer who never got their guide.

  One view answers the questions worth asking at a glance: how many are
  waiting, how long the oldest has waited, and how many gave up. Aggregated per
  account, so it stays cheap no matter how large the log grows.

  `security_invoker` keeps the caller's RLS in force, so an account's queue is
  visible only to the person who owns it.
*/

CREATE OR REPLACE VIEW instagram_queue_health
WITH (security_invoker = true) AS
SELECT
  account.id AS instagram_account_id,
  account.user_id,
  account.username,
  count(event.id) FILTER (WHERE event.status = 'received') AS pending_count,
  /* Waiting on a delay or a backoff rather than on the worker — normal, and
     worth separating so a healthy pause does not read as a stall. */
  count(event.id) FILTER (
    WHERE event.status = 'received' AND event.next_attempt_at > now()
  ) AS waiting_count,
  min(event.next_attempt_at) FILTER (WHERE event.status = 'received') AS next_due_at,
  min(event.created_at) FILTER (WHERE event.status = 'received') AS oldest_pending_at,
  count(event.id) FILTER (
    WHERE event.status = 'failed' AND event.created_at > now() - interval '24 hours'
  ) AS failed_24h,
  count(event.id) FILTER (
    WHERE event.status = 'sent' AND event.processed_at > now() - interval '1 hour'
  ) AS sent_last_hour,
  count(event.id) FILTER (
    WHERE event.status = 'sent' AND event.processed_at > now() - interval '24 hours'
  ) AS sent_24h,
  max(event.attempts) FILTER (WHERE event.status = 'received') AS max_attempts_pending
FROM instagram_accounts account
LEFT JOIN instagram_automation_events event
  ON event.instagram_account_id = account.id
WHERE account.is_active
GROUP BY account.id, account.user_id, account.username;

GRANT SELECT ON instagram_queue_health TO authenticated;
