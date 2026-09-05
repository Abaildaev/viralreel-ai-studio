/*
  # A/B считается только по дням, где плечи работали рядом

  Функция брала все доставки за окно и делила их по плечам, не проверяя, шли
  ли плечи одновременно. На боевых данных это дало прямо ложный вывод:
  контроль набрал весь свой объём 27–28 августа, когда публичные ответы были
  выключены и воронка лежала на 18 %, а Quick Reply — уже после починки. Панель
  показала 13 % против 21 % и назвала победителем Quick Reply, хотя на общих
  днях он был позади: 12.9 % против 10.6 %.

  1. Изменения
    - `experiment_days` — дни, в которые работало хотя бы два разных плеча.
      Выборка эксперимента сведена к ним.
    - `comparable_days` в выдаче: сколько дней вошло в сравнение. Ноль или
      один означает, что сравнивать нечего, и интерфейс должен так и сказать.
    - `last_at` — когда эксперимент последний раз набирал данные.
    - `profile_link_exposures` и `profile_link_telegram_starts`: третье плечо
      перестало быть невидимым.

  Остальные разделы аналитики не тронуты: они не сравнивают плечи между
  собой, и фильтровать их по общим дням значило бы терять данные.
*/

DROP FUNCTION IF EXISTS public.get_automation_analytics(integer, text, uuid);

CREATE OR REPLACE FUNCTION public.get_automation_analytics(
  p_days integer DEFAULT 30,
  p_timezone text DEFAULT 'UTC',
  p_instagram_account_id uuid DEFAULT NULL
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
      event.experiment_variant,
      event.experiment_clicked_at,
      event.experiment_converted_at,
      EXISTS (
        SELECT 1 FROM public.telegram_subscribers subscriber
        WHERE subscriber.automation_event_id = event.id
      ) AS telegram_started,
      coalesce(magnet.codeword, 'ДРУГИЕ') AS codeword,
      coalesce(magnet.title, 'Лид-магнит') AS magnet_title,
      (event.status = 'sent' OR event.dm_status = 'sent') AS was_sent,
      (event.status = 'failed' OR event.dm_status = 'failed') AS was_failed
    FROM public.instagram_automation_events event
    JOIN public.instagram_accounts account
      ON account.id = event.instagram_account_id
     AND account.user_id = v_user_id
    LEFT JOIN public.lead_magnets magnet ON magnet.id = event.lead_magnet_id
    WHERE p_instagram_account_id IS NULL
       OR event.instagram_account_id = p_instagram_account_id
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
  ),
  experiment_days AS (
    SELECT (created_at AT TIME ZONE v_timezone)::date AS day
    FROM owned_events
    WHERE trigger_type = 'comment'
      AND experiment_variant IS NOT NULL
      AND created_at >= (((now() AT TIME ZONE v_timezone)::date - (v_days - 1))::timestamp AT TIME ZONE v_timezone)
    GROUP BY 1
    HAVING count(DISTINCT experiment_variant) >= 2
  ),
  experiment AS (
    SELECT
      count(*) FILTER (
        WHERE experiment_variant = 'control' AND was_sent
      )::bigint AS control_exposures,
      count(*) FILTER (
        WHERE experiment_variant = 'control'
          AND was_sent
          AND telegram_started
      )::bigint AS control_telegram_starts,
      count(*) FILTER (
        WHERE experiment_variant = 'quick_reply' AND was_sent
      )::bigint AS quick_reply_exposures,
      count(*) FILTER (
        WHERE experiment_variant = 'quick_reply' AND experiment_clicked_at IS NOT NULL
      )::bigint AS quick_reply_clicks,
      count(*) FILTER (
        WHERE experiment_variant = 'quick_reply' AND experiment_converted_at IS NOT NULL
      )::bigint AS quick_reply_link_deliveries,
      count(*) FILTER (
        WHERE experiment_variant = 'quick_reply'
          AND telegram_started
      )::bigint AS quick_reply_telegram_starts,
      count(*) FILTER (
        WHERE experiment_variant = 'profile_link' AND was_sent
      )::bigint AS profile_link_exposures,
      count(*) FILTER (
        WHERE experiment_variant = 'profile_link' AND telegram_started
      )::bigint AS profile_link_telegram_starts,
      min(created_at) FILTER (WHERE experiment_variant IS NOT NULL) AS started_at,
      max(created_at) FILTER (WHERE experiment_variant IS NOT NULL) AS last_at
    FROM owned_events
    WHERE trigger_type = 'comment'
      AND experiment_variant IS NOT NULL
      AND (created_at AT TIME ZONE v_timezone)::date IN (SELECT day FROM experiment_days)
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
    ), '[]'::jsonb),
    'ab_test', jsonb_build_object(
      'started_at', experiment.started_at,
      'last_at', experiment.last_at,
      'comparable_days', (SELECT count(*) FROM experiment_days),
      'profile_link_exposures', experiment.profile_link_exposures,
      'profile_link_telegram_starts', experiment.profile_link_telegram_starts,
      'control_exposures', experiment.control_exposures,
      'control_telegram_starts', experiment.control_telegram_starts,
      'quick_reply_exposures', experiment.quick_reply_exposures,
      'quick_reply_clicks', experiment.quick_reply_clicks,
      'quick_reply_link_deliveries', experiment.quick_reply_link_deliveries,
      'quick_reply_telegram_starts', experiment.quick_reply_telegram_starts
    )
  ) INTO v_result
  FROM totals CROSS JOIN experiment;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_automation_analytics(integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_automation_analytics(integer, text, uuid) TO authenticated;
