/*
  # Один Telegram-бот на Instagram-аккаунт

  `telegram_bots` держал `UNIQUE (user_id)`: один бот на пользователя, а
  воронки, подписчики и рассылки висят на боте. Поэтому владелец двух
  Instagram-аккаунтов видел на обоих одни и те же воронки — данные общие не по
  ошибке в запросе, а по схеме.

  1. Изменения
    - `telegram_bots.instagram_account_id` (uuid, nullable, FK) — к какому
      Instagram-аккаунту привязан бот. NULL = общий бот для всех аккаунтов, та
      же договорённость, что у `lead_magnets` и `ai_sales_agents`.
    - `UNIQUE (user_id)` заменён на `UNIQUE NULLS NOT DISTINCT
      (user_id, instagram_account_id)`: свой бот на каждый аккаунт плюс один
      общий.

  2. Совместимость
    Существующий бот остаётся с `instagram_account_id = NULL`, то есть общим:
    его воронки, ссылки `?start=` и подписчики продолжают работать для всех
    аккаунтов. Как только для аккаунта подключён свой бот, интерфейс показывает
    его вместо общего.

  3. Безопасность
    - `GRANT SELECT` на новую колонку — токен и секрет вебхука по-прежнему
      браузеру не видны.
    - Триггер не даёт привязать бота к чужому Instagram-аккаунту.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'telegram_bots'
      AND column_name = 'instagram_account_id'
  ) THEN
    ALTER TABLE public.telegram_bots
      ADD COLUMN instagram_account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE CASCADE;
  END IF;
END $$;

/* Found by shape rather than by name: the old constraint was declared inline
   in CREATE TABLE, so its name is whatever Postgres generated. */
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.telegram_bots'::regclass
    AND contype = 'u'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.telegram_bots'::regclass AND attname = 'user_id'
    )]::smallint[];

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.telegram_bots DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.telegram_bots'::regclass
      AND conname = 'telegram_bots_user_account_uq'
  ) THEN
    ALTER TABLE public.telegram_bots
      ADD CONSTRAINT telegram_bots_user_account_uq
      UNIQUE NULLS NOT DISTINCT (user_id, instagram_account_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS telegram_bots_account_idx
  ON public.telegram_bots (instagram_account_id);

GRANT SELECT (instagram_account_id) ON TABLE public.telegram_bots TO authenticated;

/*
  Строки создаёт только telegram-setup под service_role, то есть в обход RLS —
  проверка принадлежности аккаунта живёт в триггере, как у scheduled_posts и
  lead_magnets.
*/
CREATE OR REPLACE FUNCTION public.enforce_telegram_bot_account_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.instagram_account_id IS NOT NULL
     AND NOT public.owns_instagram_account(NEW.instagram_account_id, NEW.user_id) THEN
    RAISE EXCEPTION 'instagram_account_id must belong to telegram_bots.user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_bots_account_owner ON public.telegram_bots;
CREATE TRIGGER telegram_bots_account_owner
  BEFORE INSERT OR UPDATE OF user_id, instagram_account_id ON public.telegram_bots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_telegram_bot_account_owner();
