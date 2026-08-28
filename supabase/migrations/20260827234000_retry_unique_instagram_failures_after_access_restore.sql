/*
  The account owner restored Instagram messaging access and explicitly asked
  to retry everyone whose promised Direct message failed.

  Retry at most one event per person and lead magnet, exclude anyone who has a
  successful delivery anywhere in their history, and stagger the queue so the
  recovery looks like normal human-paced traffic rather than a burst. Public
  comment replies remain skipped; only the missing private message is retried.
*/

WITH eligible AS (
  SELECT
    event.id,
    row_number() OVER (
      PARTITION BY event.sender_igsid, event.lead_magnet_id
      ORDER BY event.created_at DESC, event.id
    ) AS recipient_rank
  FROM public.instagram_automation_events event
  JOIN public.instagram_accounts account
    ON account.id = event.instagram_account_id
  WHERE account.username = 'alym_digital'
    AND event.status = 'failed'
    AND event.trigger_type = 'comment'
    AND event.sender_igsid IS NOT NULL
    AND event.response_message_id IS NULL
    AND event.created_at >= now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1
      FROM public.instagram_automation_events delivered
      WHERE delivered.sender_igsid = event.sender_igsid
        AND delivered.lead_magnet_id = event.lead_magnet_id
        AND delivered.id <> event.id
        AND (delivered.status = 'sent' OR delivered.dm_status = 'sent')
    )
),
unique_recipients AS (
  SELECT
    eligible.id,
    row_number() OVER (ORDER BY md5(eligible.id::text)) - 1 AS queue_position
  FROM eligible
  WHERE eligible.recipient_rank = 1
)
UPDATE public.instagram_automation_events event
SET
  status = 'received',
  dm_status = 'pending',
  public_reply_status = 'skipped',
  public_reply_id = null,
  response_message_id = null,
  attempts = 0,
  next_attempt_at = now() + unique_recipients.queue_position * interval '45 seconds',
  claimed_at = null,
  processed_at = null,
  error_message = 'Повторная отправка после восстановления доступа к сообщениям'
FROM unique_recipients
WHERE event.id = unique_recipients.id;
