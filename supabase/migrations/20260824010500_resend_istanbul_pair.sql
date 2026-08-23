/*
  The instruction and the prompt it explains, sent as a pair.

  Both halves changed since the reader last saw them — the wording on one, the
  fold on the other — and each only makes sense against the other: an
  instruction that says "разверни" is right or wrong depending on whether the
  message under it is folded.
*/

UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute' + (step.position * interval '1 second'),
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
  AND step.position IN (6, 7);
