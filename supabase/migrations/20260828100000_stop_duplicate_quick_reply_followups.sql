/*
  Quick Reply creates a child DM event for the same person and funnel as the
  original comment event. The daily uniqueness index must protect only root
  deliveries; otherwise the child cannot be marked sent after Graph accepted
  it and the worker retries the same irreversible send every claim timeout.
*/
DROP INDEX IF EXISTS public.instagram_automation_events_one_send_per_day_idx;

CREATE UNIQUE INDEX instagram_automation_events_one_send_per_day_idx
  ON public.instagram_automation_events (
    lead_magnet_id,
    sender_igsid,
    ((created_at AT TIME ZONE 'UTC')::date)
  )
  WHERE status = 'sent'
    AND lead_magnet_id IS NOT NULL
    AND sender_igsid IS NOT NULL
    AND experiment_parent_event_id IS NULL;

/*
  Repair deliveries that Instagram already accepted before this migration.
  The parent conversion timestamp is written immediately after the Graph send,
  so it is the durable proof that the child must be completed without sending.
*/
WITH delivered_followups AS (
  SELECT
    child.id,
    parent.id AS parent_id,
    parent.lead_magnet_id
  FROM public.instagram_automation_events AS parent
  JOIN public.instagram_automation_events AS child
    ON child.id = parent.experiment_conversion_event_id
  WHERE parent.experiment_variant = 'quick_reply'
    AND parent.experiment_converted_at IS NOT NULL
    AND child.status IN ('received', 'ignored')
)
UPDATE public.instagram_automation_events AS child
SET
  lead_magnet_id = delivered.lead_magnet_id,
  experiment_variant = 'quick_reply',
  experiment_parent_event_id = delivered.parent_id,
  status = 'sent',
  dm_status = 'sent',
  public_reply_status = 'skipped',
  processed_at = now(),
  claimed_at = NULL,
  error_message = 'Quick Reply уже доставлен; повторная отправка остановлена'
FROM delivered_followups AS delivered
WHERE child.id = delivered.id;
