/*
  The whole path again, in its finished state.

  Since the last full run every one of the nine changed: a new opening, four
  prompts folded into quotes, and four instructions rewritten to describe the
  fold. Judging that as a conversation needs it in order, from the top.
*/

INSERT INTO telegram_step_deliveries (
  telegram_bot_id, subscriber_id, step_id, due_at, status, attempts, error_message, sent_at
)
SELECT
  subscriber.telegram_bot_id,
  subscriber.id,
  step.id,
  now() - interval '10 minutes' + (step.position * interval '1 second'),
  'pending',
  0,
  NULL,
  NULL
FROM telegram_subscribers subscriber
JOIN telegram_funnels funnel
  ON funnel.telegram_bot_id = subscriber.telegram_bot_id
JOIN telegram_funnel_steps step
  ON step.funnel_id = funnel.id
 AND step.is_active
WHERE lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
ON CONFLICT (subscriber_id, step_id) DO UPDATE
SET
  due_at = EXCLUDED.due_at,
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL;

UPDATE telegram_subscribers subscriber
SET
  delivered_at = NULL,
  sequence_done_at = NULL,
  updated_at = now()
FROM telegram_funnels funnel
WHERE funnel.telegram_bot_id = subscriber.telegram_bot_id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts';
