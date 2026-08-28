/*
  # Отметка: текст Direct написала модель

  Персонализированная доставка теперь уходит в форме quick reply — первое
  сообщение без ссылки, адрес выдаётся после нажатия. Нажатие обрабатывает тот
  же код, что и вариант A/B: родителя он узнаёт по `experiment_variant`, а
  CHECK на колонке допускает только control / quick_reply / profile_link.
  Поэтому такие события помечаются как `quick_reply` — иначе тап вернул бы
  «Quick Reply не относится к активному A/B-событию», и человек не получил бы
  ничего.

  1. Изменения
    - `instagram_automation_events.direct_ai_written` (boolean, false) — писала
      ли текст модель.

  2. Зачем отдельная колонка
    Чтобы пометка ради работающего нажатия не съела аналитику: в срезе по
    `experiment_variant` сообщения от модели иначе смешались бы с рукописным
    вариантом эксперимента, и сравнить их стало бы нечем.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'instagram_automation_events'
      AND column_name = 'direct_ai_written'
  ) THEN
    ALTER TABLE public.instagram_automation_events
      ADD COLUMN direct_ai_written boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS instagram_automation_events_ai_written_idx
  ON public.instagram_automation_events (direct_ai_written, created_at DESC)
  WHERE direct_ai_written;
