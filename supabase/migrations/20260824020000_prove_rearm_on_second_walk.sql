/*
  Puts the reader back at the top of the sequence with every later step still
  marked sent — the exact state that used to end the funnel after one message.

  With the scheduler fixed, sending step one is enough: the step that follows
  is re-armed from its own finished row instead of being silently skipped, and
  the walk carries on by itself.
*/

UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute',
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL
FROM telegram_subscribers subscriber, telegram_funnel_steps step, telegram_funnels funnel
WHERE delivery.subscriber_id = subscriber.id
  AND delivery.step_id = step.id
  AND step.funnel_id = funnel.id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND step.position = 1;
