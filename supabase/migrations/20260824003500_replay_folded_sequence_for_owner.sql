/*
  The sequence again, from the top, for the account that has to approve it.

  Same shape as the first replay: every step becomes due a moment ago, a
  second apart in step order so the worker's batch keeps them in sequence, and
  the two marks that say this reader is finished are cleared so nothing counts
  them as done while nine messages are still on the way.

  Worth repeating in full rather than sending the four changed steps: what is
  being judged this time is the shape of the whole conversation — a folded
  prompt under an instruction that now describes folding — and that only reads
  properly in order.
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
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
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
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  );
