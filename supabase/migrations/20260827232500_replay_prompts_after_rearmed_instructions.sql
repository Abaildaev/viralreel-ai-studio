/*
  A repeated /start re-armed the delayed instruction but its zero-delay prompt
  kept the `sent` row from the reader's earlier walk. The instruction therefore
  arrived again while the prompt it explicitly promised did not.

  Requeue only fresh broken hand-offs. Older historical walks are left alone so
  a repair cannot dump several days of prompts into somebody's chat at once.
*/

WITH prompt_steps AS (
  SELECT step.id, step.position
  FROM public.telegram_funnel_steps step
  JOIN public.telegram_funnels funnel ON funnel.id = step.funnel_id
  WHERE funnel.slug = 'prompts'
),
fresh_misses AS (
  SELECT prompt_delivery.id
  FROM public.telegram_step_deliveries instruction_delivery
  JOIN prompt_steps instruction_step
    ON instruction_step.id = instruction_delivery.step_id
   AND instruction_step.position IN (2, 4, 6, 8)
  JOIN prompt_steps prompt_step
    ON prompt_step.position = instruction_step.position + 1
  JOIN public.telegram_step_deliveries prompt_delivery
    ON prompt_delivery.subscriber_id = instruction_delivery.subscriber_id
   AND prompt_delivery.step_id = prompt_step.id
  JOIN public.telegram_subscribers subscriber
    ON subscriber.id = instruction_delivery.subscriber_id
  WHERE instruction_delivery.status = 'sent'
    AND instruction_delivery.sent_at >= now() - interval '30 minutes'
    AND instruction_delivery.sent_at > coalesce(prompt_delivery.sent_at, '-infinity'::timestamptz)
    AND prompt_delivery.status IN ('sent', 'cancelled', 'failed')
    AND subscriber.is_blocked = false
    AND subscriber.unsubscribed_at IS NULL
)
UPDATE public.telegram_step_deliveries delivery
SET
  status = 'pending',
  due_at = now(),
  attempts = 0,
  error_message = null,
  sent_at = null,
  telegram_message_id = null,
  claimed_at = null,
  claim_token = null
FROM fresh_misses
WHERE delivery.id = fresh_misses.id;
