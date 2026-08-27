/*
  Keep a Telegram funnel strictly sequential even when old/backfilled rows
  make more than one step due at the same time. The worker may claim only the
  earliest active step whose predecessors are terminal.

  Telegram has no idempotency key for sendMessage, so retaining the returned
  message id gives us a durable audit trail and lets operators reconcile a
  crash that happened after Telegram accepted a message.
*/

ALTER TABLE public.telegram_step_deliveries
  ADD COLUMN IF NOT EXISTS telegram_message_id text;

ALTER TABLE public.telegram_broadcast_recipients
  ADD COLUMN IF NOT EXISTS telegram_message_id text;

CREATE OR REPLACE FUNCTION public.claim_telegram_step_deliveries(
  p_limit integer,
  p_claim_token text
)
RETURNS TABLE(id uuid, attempts integer, telegram_bot_id uuid, subscriber_id uuid, step_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.telegram_step_deliveries delivery
    JOIN public.telegram_bots bot
      ON bot.id = delivery.telegram_bot_id
    JOIN public.telegram_subscribers subscriber
      ON subscriber.id = delivery.subscriber_id
     AND subscriber.user_id = bot.user_id
     AND subscriber.telegram_bot_id = bot.id
    JOIN public.telegram_funnel_steps step
      ON step.id = delivery.step_id
     AND step.user_id = bot.user_id
    JOIN public.telegram_funnels funnel
      ON funnel.id = step.funnel_id
     AND funnel.user_id = bot.user_id
     AND funnel.telegram_bot_id = bot.id
    WHERE delivery.due_at <= now()
      AND subscriber.funnel_id = funnel.id
      AND delivery.attempts < 4
      AND (
        delivery.status = 'pending'
        OR (delivery.status = 'processing' AND delivery.claimed_at < now() - interval '5 minutes')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.telegram_funnel_steps prior_step
        LEFT JOIN public.telegram_step_deliveries prior_delivery
          ON prior_delivery.step_id = prior_step.id
         AND prior_delivery.subscriber_id = delivery.subscriber_id
        WHERE prior_step.funnel_id = funnel.id
          AND prior_step.is_active
          AND prior_step.position < step.position
          AND (
            prior_delivery.id IS NULL
            OR prior_delivery.status NOT IN ('sent', 'cancelled', 'failed')
          )
      )
    ORDER BY delivery.due_at, step.position, delivery.id
    LIMIT greatest(1, least(coalesce(p_limit, 200), 500))
    FOR UPDATE OF delivery SKIP LOCKED
  )
  UPDATE public.telegram_step_deliveries delivery
  SET status = 'processing', claimed_at = now(), claim_token = p_claim_token
  FROM candidates
  WHERE delivery.id = candidates.id
  RETURNING delivery.id, delivery.attempts, delivery.telegram_bot_id,
    delivery.subscriber_id, delivery.step_id;
END;
$$;
