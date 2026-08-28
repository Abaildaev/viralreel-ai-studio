/*
  Add a third comment-to-Direct experiment arm.

  Control keeps the existing attributed button. Quick Reply keeps the two-step
  flow that opens the messaging window. The new profile-link arm is deliberately
  plain text, matching the common Instagram pattern that sends people to the
  link in the account bio.
*/

ALTER TABLE public.lead_magnets
  ADD COLUMN IF NOT EXISTS ab_profile_reply_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ab_profile_reply_text text NOT NULL DEFAULT
    E'Вижу твой комментарий 👊\n\nСсылка на базу промптов — в шапке моего профиля.';

ALTER TABLE public.lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_ab_profile_reply_percent_check,
  DROP CONSTRAINT IF EXISTS lead_magnets_ab_experiment_total_check;

ALTER TABLE public.lead_magnets
  ADD CONSTRAINT lead_magnets_ab_profile_reply_percent_check
    CHECK (ab_profile_reply_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT lead_magnets_ab_experiment_total_check
    CHECK (ab_quick_reply_percent + ab_profile_reply_percent <= 100);

ALTER TABLE public.instagram_automation_events
  DROP CONSTRAINT IF EXISTS instagram_automation_events_experiment_variant_check;

ALTER TABLE public.instagram_automation_events
  ADD CONSTRAINT instagram_automation_events_experiment_variant_check
    CHECK (
      experiment_variant IS NULL
      OR experiment_variant IN ('control', 'quick_reply', 'profile_link')
    );

/* Restore both earlier delivery variants and add the profile-link arm at 20%. */
UPDATE public.lead_magnets magnet
SET
  reply_text = E'Забирай 1000+ готовых промптов для генерации картинок в нейросетях!\n\nВнутри — формулы под рекламу, людей, предметку и свет. Главное: там же ты сможешь сразу протестировать любой промпт и забрать результат за пару кликов.\n\nЖми кнопку ниже 👇',
  direct_reply_variants = ARRAY[
    E'Забирай 1000+ готовых промптов для генерации картинок в нейросетях!\n\nВнутри — формулы под рекламу, людей, предметку и свет. Главное: там же ты сможешь сразу протестировать любой промпт и забрать результат за пару кликов.\n\nЖми кнопку ниже 👇',
    E'Хватит мучиться с генерацией картинок в нейросетях.\n\nЯ собрал 1000+ готовых промптов для идеального визуала (свет, ракурсы, стили) и настроил место, где ты сразу протестируешь их в один клик без танцев с бубном.\n\nЗабирай доступ 👇',
    E'Твой чит-код для сочного визуала в нейросетях!\n\nВ базе — 1000+ промптов для генерации фото, товаров и рекламы. Копируешь готовый текст, там же сразу запускаешь генерацию и получаешь топ-кадр за 60 секунд.\n\nЖми кнопку 👇',
    E'Лови 1000+ промптов для визуала в нейросетях!\n\nВнутри — формулы для картинок и место для их мгновенного теста. Схема простая: жмёшь кнопку — и бот сразу отдаёт доступ к базе. Без условий и регистраций.\n\nЗабирай по кнопке 👇',
    E'Делай студийные картинки в нейросетях с 1-й попытки!\n\nЯ упаковал 1000+ промптов для сочного визуала и подключил движок для быстрого теста. Бот отдаёт базу сразу, делать ничего не нужно.\n\nЖми кнопку ниже 👇'
  ],
  direct_reply_buttons = ARRAY['1000+ схем', 'Хочу базу', 'Хочу чит', 'Забрать', 'К формулам'],
  response_url = 'https://t.me/daily_prompt_hub_bot?start=prompts',
  button_text = 'Забрать',
  ab_quick_reply_percent = 20,
  ab_quick_reply_text = 'Готово 🙌 База из 1000+ промптов уже ждёт. Нажми кнопку ниже — и я сразу пришлю доступ.',
  ab_quick_reply_button = 'Забрать базу',
  ab_profile_reply_percent = 20,
  ab_profile_reply_text = E'Вижу твой комментарий 👊\n\nЯ собрал базу из 1000+ готовых промптов для генерации изображений в нейросетях — для рекламы, людей, предметки, света и разных стилей.\n\nЕсли хочешь забрать базу, переходи по ссылке в шапке моего профиля — я оставил её там.',
  is_active = true,
  public_reply_enabled = false,
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM public.telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);
