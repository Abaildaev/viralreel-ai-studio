/*
  Enforce ownership across foreign-key relationships and make Telegram
  delivery queues safe for overlapping cron invocations.

  RLS checks the owner of a row, but it does not automatically check the owner
  of a referenced row. These helpers and triggers close that gap for both
  browser writes and service-role workers.
*/

CREATE OR REPLACE FUNCTION public.owns_instagram_account(
  p_account_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_account_id IS NULL OR EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = p_account_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_telegram_bot(
  p_bot_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.telegram_bots
    WHERE id = p_bot_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_telegram_funnel(
  p_funnel_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.telegram_funnels
    WHERE id = p_funnel_id AND user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.owns_instagram_account(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_telegram_bot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_telegram_funnel(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_instagram_account(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_telegram_bot(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_telegram_funnel(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_scheduled_post_account_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.instagram_account_id IS NOT NULL
     AND NOT public.owns_instagram_account(NEW.instagram_account_id, NEW.user_id) THEN
    RAISE EXCEPTION 'instagram_account_id must belong to scheduled_posts.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scheduled_posts_account_owner ON public.scheduled_posts;
CREATE TRIGGER scheduled_posts_account_owner
  BEFORE INSERT OR UPDATE OF user_id, instagram_account_id ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_scheduled_post_account_owner();

CREATE OR REPLACE FUNCTION public.enforce_template_account_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.instagram_account_id IS NOT NULL
     AND NOT public.owns_instagram_account(NEW.instagram_account_id, NEW.user_id) THEN
    RAISE EXCEPTION 'instagram_account_id must belong to video_templates.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_templates_account_owner ON public.video_templates;
CREATE TRIGGER video_templates_account_owner
  BEFORE INSERT OR UPDATE OF user_id, instagram_account_id ON public.video_templates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_template_account_owner();

CREATE OR REPLACE FUNCTION public.enforce_lead_magnet_account_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.instagram_account_id IS NOT NULL
     AND NOT public.owns_instagram_account(NEW.instagram_account_id, NEW.user_id) THEN
    RAISE EXCEPTION 'instagram_account_id must belong to lead_magnets.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_magnets_account_owner ON public.lead_magnets;
CREATE TRIGGER lead_magnets_account_owner
  BEFORE INSERT OR UPDATE OF user_id, instagram_account_id ON public.lead_magnets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_magnet_account_owner();

CREATE OR REPLACE FUNCTION public.enforce_batch_preset_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audio_owner uuid;
BEGIN
  IF NEW.instagram_account_id IS NOT NULL
     AND NOT public.owns_instagram_account(NEW.instagram_account_id, NEW.user_id) THEN
    RAISE EXCEPTION 'instagram_account_id must belong to batch_presets.user_id';
  END IF;

  IF NEW.audio_file_id IS NOT NULL THEN
    SELECT user_id INTO audio_owner FROM public.audio_files WHERE id = NEW.audio_file_id;
    IF audio_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'audio_file_id must belong to batch_presets.user_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS batch_presets_owner ON public.batch_presets;
CREATE TRIGGER batch_presets_owner
  BEFORE INSERT OR UPDATE OF user_id, instagram_account_id, audio_file_id ON public.batch_presets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_preset_owner();

/* Telegram ownership checks. */
CREATE OR REPLACE FUNCTION public.enforce_telegram_funnel_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_telegram_bot(NEW.telegram_bot_id, NEW.user_id) THEN
    RAISE EXCEPTION 'telegram_bot_id must belong to telegram_funnels.user_id';
  END IF;
  IF NEW.lead_magnet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lead_magnets WHERE id = NEW.lead_magnet_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'lead_magnet_id must belong to telegram_funnels.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_funnels_owner ON public.telegram_funnels;
CREATE TRIGGER telegram_funnels_owner
  BEFORE INSERT OR UPDATE OF user_id, telegram_bot_id, lead_magnet_id ON public.telegram_funnels
  FOR EACH ROW EXECUTE FUNCTION public.enforce_telegram_funnel_owner();

CREATE OR REPLACE FUNCTION public.enforce_telegram_broadcast_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_telegram_bot(NEW.telegram_bot_id, NEW.user_id) THEN
    RAISE EXCEPTION 'telegram_bot_id must belong to telegram_broadcasts.user_id';
  END IF;
  IF NEW.segment_funnel_id IS NOT NULL
     AND NOT public.owns_telegram_funnel(NEW.segment_funnel_id, NEW.user_id) THEN
    RAISE EXCEPTION 'segment_funnel_id must belong to telegram_broadcasts.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_broadcasts_owner ON public.telegram_broadcasts;
CREATE TRIGGER telegram_broadcasts_owner
  BEFORE INSERT OR UPDATE OF user_id, telegram_bot_id, segment_funnel_id ON public.telegram_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_telegram_broadcast_owner();

CREATE OR REPLACE FUNCTION public.enforce_telegram_step_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_telegram_funnel(NEW.funnel_id, NEW.user_id) THEN
    RAISE EXCEPTION 'funnel_id must belong to telegram_funnel_steps.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_funnel_steps_owner ON public.telegram_funnel_steps;
CREATE TRIGGER telegram_funnel_steps_owner
  BEFORE INSERT OR UPDATE OF user_id, funnel_id ON public.telegram_funnel_steps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_telegram_step_owner();

CREATE OR REPLACE FUNCTION public.enforce_telegram_subscriber_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_telegram_bot(NEW.telegram_bot_id, NEW.user_id) THEN
    RAISE EXCEPTION 'telegram_bot_id must belong to telegram_subscribers.user_id';
  END IF;
  IF NEW.funnel_id IS NOT NULL AND NOT public.owns_telegram_funnel(NEW.funnel_id, NEW.user_id) THEN
    RAISE EXCEPTION 'funnel_id must belong to telegram_subscribers.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_subscribers_owner ON public.telegram_subscribers;
CREATE TRIGGER telegram_subscribers_owner
  BEFORE INSERT OR UPDATE OF user_id, telegram_bot_id, funnel_id ON public.telegram_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_telegram_subscriber_owner();

CREATE OR REPLACE FUNCTION public.enforce_telegram_recipient_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.telegram_broadcasts broadcast
    JOIN public.telegram_subscribers subscriber ON subscriber.user_id = broadcast.user_id
      AND subscriber.id = NEW.subscriber_id
    WHERE broadcast.id = NEW.broadcast_id
      AND subscriber.telegram_user_id = NEW.telegram_user_id
  ) THEN
    RAISE EXCEPTION 'broadcast recipient must belong to the broadcast owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_broadcast_recipients_owner ON public.telegram_broadcast_recipients;
CREATE TRIGGER telegram_broadcast_recipients_owner
  BEFORE INSERT OR UPDATE OF broadcast_id, subscriber_id, telegram_user_id
  ON public.telegram_broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_telegram_recipient_owner();

CREATE OR REPLACE FUNCTION public.enforce_telegram_step_delivery_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.telegram_bots bot
    JOIN public.telegram_subscribers subscriber
      ON subscriber.id = NEW.subscriber_id
     AND subscriber.user_id = bot.user_id
     AND subscriber.telegram_bot_id = bot.id
    JOIN public.telegram_funnel_steps step
      ON step.id = NEW.step_id
     AND step.user_id = bot.user_id
    JOIN public.telegram_funnels funnel
      ON funnel.id = step.funnel_id
     AND funnel.user_id = bot.user_id
     AND funnel.telegram_bot_id = bot.id
    WHERE bot.id = NEW.telegram_bot_id
      AND subscriber.funnel_id = funnel.id
  ) THEN
    RAISE EXCEPTION 'step delivery bot, subscriber and step must have the same owner and funnel';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_step_deliveries_owner ON public.telegram_step_deliveries;
CREATE TRIGGER telegram_step_deliveries_owner
  BEFORE INSERT OR UPDATE OF telegram_bot_id, subscriber_id, step_id
  ON public.telegram_step_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_telegram_step_delivery_owner();

/* The browser can only create linked rows for its own resources. */
DROP POLICY IF EXISTS "Users can insert own posts" ON public.scheduled_posts;
CREATE POLICY "Users can insert own posts"
  ON public.scheduled_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can update own posts" ON public.scheduled_posts;
CREATE POLICY "Users can update own posts"
  ON public.scheduled_posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own templates" ON public.video_templates;
CREATE POLICY "Users can insert own templates"
  ON public.video_templates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can update own templates" ON public.video_templates;
CREATE POLICY "Users can update own templates"
  ON public.video_templates FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own lead magnets" ON public.lead_magnets;
CREATE POLICY "Users can insert own lead magnets"
  ON public.lead_magnets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can update own lead magnets" ON public.lead_magnets;
CREATE POLICY "Users can update own lead magnets"
  ON public.lead_magnets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own presets" ON public.batch_presets;
CREATE POLICY "Users can insert own presets"
  ON public.batch_presets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can update own presets" ON public.batch_presets;
CREATE POLICY "Users can update own presets"
  ON public.batch_presets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.owns_instagram_account(instagram_account_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own telegram funnels" ON public.telegram_funnels;
CREATE POLICY "Users can insert own telegram funnels"
  ON public.telegram_funnels FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.owns_telegram_bot(telegram_bot_id, auth.uid())
    AND (lead_magnet_id IS NULL OR EXISTS (
      SELECT 1 FROM public.lead_magnets WHERE id = lead_magnet_id AND user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Users can update own telegram funnels" ON public.telegram_funnels;
CREATE POLICY "Users can update own telegram funnels"
  ON public.telegram_funnels FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.owns_telegram_bot(telegram_bot_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own telegram broadcasts" ON public.telegram_broadcasts;
CREATE POLICY "Users can insert own telegram broadcasts"
  ON public.telegram_broadcasts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.owns_telegram_bot(telegram_bot_id, auth.uid())
    AND (segment_funnel_id IS NULL OR public.owns_telegram_funnel(segment_funnel_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update own telegram broadcasts" ON public.telegram_broadcasts;
CREATE POLICY "Users can update own telegram broadcasts"
  ON public.telegram_broadcasts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.owns_telegram_bot(telegram_bot_id, auth.uid())
    AND (segment_funnel_id IS NULL OR public.owns_telegram_funnel(segment_funnel_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert own funnel steps" ON public.telegram_funnel_steps;
CREATE POLICY "Users can insert own funnel steps"
  ON public.telegram_funnel_steps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_telegram_funnel(funnel_id, auth.uid()));

DROP POLICY IF EXISTS "Users can update own funnel steps" ON public.telegram_funnel_steps;
CREATE POLICY "Users can update own funnel steps"
  ON public.telegram_funnel_steps FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.owns_telegram_funnel(funnel_id, auth.uid()));

/* Private buckets must be readable only from the owner's folder. */
DROP POLICY IF EXISTS "Anyone can read templates" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own templates" ON storage.objects;
CREATE POLICY "Users can read own templates"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'templates' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Anyone can read audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own audio" ON storage.objects;
CREATE POLICY "Users can read own audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);

/* Delivery claims: processing rows are leased and reclaimed after a crash. */
ALTER TABLE public.telegram_broadcast_recipients
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_token text;

ALTER TABLE public.telegram_step_deliveries
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_token text;

ALTER TABLE public.telegram_broadcast_recipients
  DROP CONSTRAINT IF EXISTS telegram_broadcast_recipients_status_check;
ALTER TABLE public.telegram_broadcast_recipients
  ADD CONSTRAINT telegram_broadcast_recipients_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));

ALTER TABLE public.telegram_step_deliveries
  DROP CONSTRAINT IF EXISTS telegram_step_deliveries_status_check;
ALTER TABLE public.telegram_step_deliveries
  ADD CONSTRAINT telegram_step_deliveries_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'));

/* Quarantine inconsistent queue rows created before these checks existed. */
UPDATE public.telegram_broadcast_recipients recipient
SET status = 'failed',
    error_message = 'Ownership mismatch detected during security migration',
    claimed_at = NULL,
    claim_token = NULL
WHERE recipient.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1
    FROM public.telegram_broadcasts broadcast
    JOIN public.telegram_subscribers subscriber
      ON subscriber.id = recipient.subscriber_id
     AND subscriber.user_id = broadcast.user_id
     AND subscriber.telegram_bot_id = broadcast.telegram_bot_id
    WHERE broadcast.id = recipient.broadcast_id
      AND subscriber.telegram_user_id = recipient.telegram_user_id
  );

UPDATE public.telegram_step_deliveries delivery
SET status = 'failed',
    error_message = 'Ownership mismatch detected during security migration',
    claimed_at = NULL,
    claim_token = NULL
WHERE delivery.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1
    FROM public.telegram_bots bot
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
    WHERE bot.id = delivery.telegram_bot_id
      AND subscriber.funnel_id = funnel.id
  );

CREATE INDEX IF NOT EXISTS telegram_broadcast_recipients_claim_idx
  ON public.telegram_broadcast_recipients (broadcast_id, status, claimed_at);
CREATE INDEX IF NOT EXISTS telegram_step_deliveries_claim_idx
  ON public.telegram_step_deliveries (status, due_at, claimed_at);

CREATE OR REPLACE FUNCTION public.claim_telegram_broadcast_recipients(
  p_broadcast_id uuid,
  p_limit integer,
  p_claim_token text
)
RETURNS TABLE(id uuid, telegram_user_id text, subscriber_id uuid, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT recipient.id
    FROM public.telegram_broadcast_recipients recipient
    JOIN public.telegram_broadcasts broadcast
      ON broadcast.id = recipient.broadcast_id
    JOIN public.telegram_subscribers subscriber
      ON subscriber.id = recipient.subscriber_id
     AND subscriber.user_id = broadcast.user_id
     AND subscriber.telegram_bot_id = broadcast.telegram_bot_id
     AND subscriber.telegram_user_id = recipient.telegram_user_id
    WHERE recipient.broadcast_id = p_broadcast_id
      AND recipient.attempts < 3
      AND (
        recipient.status = 'pending'
        OR (recipient.status = 'processing' AND recipient.claimed_at < now() - interval '5 minutes')
      )
    ORDER BY recipient.id
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
    FOR UPDATE OF recipient SKIP LOCKED
  )
  UPDATE public.telegram_broadcast_recipients recipient
  SET status = 'processing', claimed_at = now(), claim_token = p_claim_token
  FROM candidates
  WHERE recipient.id = candidates.id
  RETURNING recipient.id, recipient.telegram_user_id, recipient.subscriber_id, recipient.attempts;
END;
$$;

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
    ORDER BY delivery.due_at, delivery.id
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

REVOKE ALL ON FUNCTION public.claim_telegram_broadcast_recipients(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telegram_step_deliveries(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_broadcast_recipients(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telegram_step_deliveries(integer, text) TO service_role;
