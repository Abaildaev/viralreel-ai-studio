/*
  Keep retained automation history in Postgres. The browser receives compact
  aggregates for the dashboard and one bounded page of CRM contacts instead of
  downloading every event in 1000-row windows.
*/

CREATE OR REPLACE FUNCTION public.get_automation_analytics(
  p_days integer DEFAULT 30,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_timezone text;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_timezone
  FROM pg_timezone_names
  WHERE name = p_timezone
  LIMIT 1;
  v_timezone := coalesce(v_timezone, 'UTC');

  WITH owned_events AS MATERIALIZED (
    SELECT
      event.id,
      event.trigger_type,
      event.status,
      event.dm_status,
      event.media_id,
      event.created_at,
      coalesce(magnet.codeword, 'ДРУГИЕ') AS codeword,
      coalesce(magnet.title, 'Лид-магнит') AS magnet_title,
      (event.status = 'sent' OR event.dm_status = 'sent') AS was_sent,
      (event.status = 'failed' OR event.dm_status = 'failed') AS was_failed
    FROM public.instagram_automation_events event
    JOIN public.instagram_accounts account
      ON account.id = event.instagram_account_id
     AND account.user_id = v_user_id
    LEFT JOIN public.lead_magnets magnet ON magnet.id = event.lead_magnet_id
  ),
  totals AS (
    SELECT
      count(*)::bigint AS total_triggers,
      count(*) FILTER (WHERE trigger_type = 'comment')::bigint AS total_comments,
      count(*) FILTER (WHERE trigger_type = 'dm')::bigint AS total_dms,
      count(*) FILTER (WHERE was_sent)::bigint AS sent_dms,
      count(*) FILTER (WHERE was_failed)::bigint AS failed_dms
    FROM owned_events
  ),
  days AS (
    SELECT generate_series(
      (now() AT TIME ZONE v_timezone)::date - (v_days - 1),
      (now() AT TIME ZONE v_timezone)::date,
      interval '1 day'
    )::date AS day
  ),
  daily_counts AS (
    SELECT
      (created_at AT TIME ZONE v_timezone)::date AS day,
      count(*) FILTER (WHERE trigger_type = 'comment')::bigint AS comments,
      count(*) FILTER (WHERE was_sent)::bigint AS sent,
      count(*)::bigint AS total
    FROM owned_events
    WHERE created_at >= (((now() AT TIME ZONE v_timezone)::date - (v_days - 1))::timestamp AT TIME ZONE v_timezone)
    GROUP BY 1
  ),
  daily AS (
    SELECT
      days.day,
      coalesce(daily_counts.comments, 0) AS comments,
      coalesce(daily_counts.sent, 0) AS sent,
      coalesce(daily_counts.total, 0) AS total
    FROM days
    LEFT JOIN daily_counts USING (day)
  ),
  codewords AS (
    SELECT
      upper(codeword) AS codeword,
      max(magnet_title) AS title,
      count(*)::bigint AS triggers_count,
      count(*) FILTER (WHERE was_sent)::bigint AS sent_count
    FROM owned_events
    GROUP BY upper(codeword)
    ORDER BY triggers_count DESC, codeword
    LIMIT 20
  ),
  media AS (
    SELECT
      media_id,
      count(*)::bigint AS leads_count,
      max(created_at) AS last_trigger
    FROM owned_events
    WHERE media_id IS NOT NULL AND media_id <> ''
    GROUP BY media_id
    ORDER BY leads_count DESC, last_trigger DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'total_triggers', totals.total_triggers,
    'total_comments', totals.total_comments,
    'total_dms', totals.total_dms,
    'sent_dms', totals.sent_dms,
    'failed_dms', totals.failed_dms,
    'daily', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'date', daily.day,
        'comments', daily.comments,
        'sent', daily.sent,
        'total', daily.total
      ) ORDER BY daily.day)
      FROM daily
    ), '[]'::jsonb),
    'codewords', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'codeword', codewords.codeword,
        'title', codewords.title,
        'triggers_count', codewords.triggers_count,
        'sent_count', codewords.sent_count
      ) ORDER BY codewords.triggers_count DESC, codewords.codeword)
      FROM codewords
    ), '[]'::jsonb),
    'media', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'media_id', media.media_id,
        'leads_count', media.leads_count,
        'last_trigger', media.last_trigger
      ) ORDER BY media.leads_count DESC, media.last_trigger DESC)
      FROM media
    ), '[]'::jsonb)
  ) INTO v_result
  FROM totals;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_automation_analytics(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_automation_analytics(integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_automation_leads(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT '',
  p_status text DEFAULT 'all'
)
RETURNS TABLE (
  id uuid,
  trigger_type text,
  incoming_text text,
  commenter_username text,
  sender_igsid text,
  status text,
  public_reply_status text,
  dm_status text,
  error_message text,
  created_at timestamptz,
  media_id text,
  lead_magnet_title text,
  lead_magnet_codeword text,
  lead_magnet_response_url text,
  instagram_username text,
  interaction_count bigint,
  sent_count bigint,
  failed_count bigint,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS MATERIALIZED (
    SELECT
      event.id,
      event.trigger_type,
      event.incoming_text,
      event.commenter_username,
      event.sender_igsid,
      event.status,
      event.public_reply_status,
      event.dm_status,
      event.error_message,
      event.created_at,
      event.media_id,
      magnet.title AS lead_magnet_title,
      magnet.codeword AS lead_magnet_codeword,
      magnet.response_url AS lead_magnet_response_url,
      account.username AS instagram_username,
      coalesce(
        CASE WHEN event.sender_igsid IS NOT NULL THEN 'id:' || event.sender_igsid END,
        CASE WHEN event.commenter_username IS NOT NULL THEN 'username:' || lower(event.commenter_username) END,
        'event:' || event.id::text
      ) AS contact_key,
      lower(concat_ws(' ', event.commenter_username, event.sender_igsid, event.incoming_text, magnet.codeword)) AS search_text,
      (event.status = 'sent' OR event.dm_status = 'sent') AS was_sent,
      (event.status = 'failed' OR event.dm_status = 'failed') AS was_failed
    FROM public.instagram_automation_events event
    JOIN public.instagram_accounts account
      ON account.id = event.instagram_account_id
     AND account.user_id = auth.uid()
    LEFT JOIN public.lead_magnets magnet ON magnet.id = event.lead_magnet_id
  ),
  grouped AS (
    SELECT
      base.contact_key,
      count(*)::bigint AS interaction_count,
      count(*) FILTER (WHERE base.was_sent)::bigint AS sent_count,
      count(*) FILTER (WHERE base.was_failed)::bigint AS failed_count
    FROM base
    GROUP BY base.contact_key
    HAVING
      (coalesce(trim(p_search), '') = '' OR bool_or(base.search_text LIKE '%' || lower(trim(p_search)) || '%'))
      AND (
        coalesce(p_status, 'all') = 'all'
        OR (p_status = 'sent' AND bool_or(base.was_sent))
        OR (p_status = 'failed' AND bool_or(base.was_failed))
      )
  ),
  latest AS (
    SELECT DISTINCT ON (base.contact_key)
      base.*
    FROM base
    JOIN grouped USING (contact_key)
    ORDER BY base.contact_key, base.created_at DESC, base.id DESC
  ),
  contacts AS (
    SELECT
      latest.*,
      grouped.interaction_count,
      grouped.sent_count,
      grouped.failed_count
    FROM latest
    JOIN grouped USING (contact_key)
  )
  SELECT
    contacts.id,
    contacts.trigger_type,
    contacts.incoming_text,
    contacts.commenter_username,
    contacts.sender_igsid,
    contacts.status,
    contacts.public_reply_status,
    contacts.dm_status,
    contacts.error_message,
    contacts.created_at,
    contacts.media_id,
    contacts.lead_magnet_title,
    contacts.lead_magnet_codeword,
    contacts.lead_magnet_response_url,
    contacts.instagram_username,
    contacts.interaction_count,
    contacts.sent_count,
    contacts.failed_count,
    count(*) OVER ()::bigint AS total_count
  FROM contacts
  ORDER BY contacts.created_at DESC, contacts.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.get_automation_leads(integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_automation_leads(integer, integer, text, text) TO authenticated;
