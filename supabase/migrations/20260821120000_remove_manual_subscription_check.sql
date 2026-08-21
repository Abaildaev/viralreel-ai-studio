/*
  Channel membership updates now unlock the material automatically. Keeping a
  manual "I subscribed" default creates the two-button gate shown by older
  deployments and gives the reader one instruction too many.

  The column remains for old messages whose callback may still arrive, but new
  rows and existing funnels no longer advertise that obsolete action.
*/

ALTER TABLE telegram_funnels
  ALTER COLUMN check_button_text SET DEFAULT '';

UPDATE telegram_funnels
SET
  check_button_text = '',
  updated_at = now()
WHERE check_button_text IN ('Я подписался', 'Проверить подписку');

/* Refresh the prompt funnel that shipped with the old wall-of-text copy. */
UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nВнутри — 10 готовых формул для AI-изображений и видео. Их можно скопировать, заменить детали под свою идею и сразу протестировать.',
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит PDF. Возвращаться и нажимать «Проверить» не нужно.',
  subscribe_button_text = 'Подписаться и забрать промпты',
  check_button_text = '',
  updated_at = now()
WHERE welcome_text ILIKE 'Вы пришли за паком промптов из Reels%'
   OR not_subscribed_text ILIKE 'Подпишитесь на канал «Промты & Нейросети»%';

/*
  The screenshot also contains two identical immediate PDF steps. Preserve the
  first as delivery, turn the second into a useful three-hour reminder without
  a second attachment, and switch off any further identical copies.
*/
WITH legacy_prompt_steps AS (
  SELECT
    step.id,
    row_number() OVER (
      PARTITION BY step.funnel_id
      ORDER BY step.position, step.created_at, step.id
    ) AS copy_number
  FROM telegram_funnel_steps step
  WHERE step.body ILIKE 'Готово — ваш лид-магнит прикреплён к этому сообщению%'
)
UPDATE telegram_funnel_steps step
SET
  title = CASE legacy.copy_number
    WHEN 1 THEN 'Промпты и бесплатный тест'
    ELSE 'Две попытки с пользой'
  END,
  body = CASE legacy.copy_number
    WHEN 1 THEN E'Промпты готовы 🎁\n\nВ PDF — 10 готовых формул для изображений и видео.\n\nКак протестировать:\n\n1. Выберите промпт в PDF.\n2. Скопируйте его без сокращений.\n3. Откройте бота по кнопке ниже.\n4. Выберите нейросеть и вставьте промпт.\n\nВ боте собраны разные нейросети, а новым пользователям доступны 2 бесплатные генерации.'
    ELSE E'Если ещё не запускали промпт — не откладывайте его в сохранённые.\n\nПервую генерацию сделайте без изменений — так вы увидите исходный результат.\n\nВо второй замените только героя или свой продукт. Так сразу будет видно, как формула работает под вашу задачу.'
  END,
  button_text = CASE legacy.copy_number
    WHEN 1 THEN 'Протестировать — 2 генерации бесплатно'
    ELSE 'Использовать 2 бесплатные генерации'
  END,
  delay_minutes = CASE legacy.copy_number WHEN 1 THEN 0 ELSE 180 END,
  is_active = legacy.copy_number <= 2,
  attachment_type = CASE legacy.copy_number WHEN 1 THEN step.attachment_type ELSE 'none' END,
  attachment_path = CASE legacy.copy_number WHEN 1 THEN step.attachment_path ELSE '' END,
  attachment_name = CASE legacy.copy_number WHEN 1 THEN step.attachment_name ELSE '' END,
  updated_at = now()
FROM legacy_prompt_steps legacy
WHERE step.id = legacy.id;
