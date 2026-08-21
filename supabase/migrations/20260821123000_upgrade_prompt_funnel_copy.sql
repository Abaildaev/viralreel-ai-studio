/*
  The live Nano Banana prompt funnel predates the conversion-focused template.
  Rewrite only that funnel's copy while deliberately preserving its uploaded
  PDF and partner-bot URLs.
*/

UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nВнутри — 10 готовых промптов для Nano Banana Pro с наглядными примерами. Их можно скопировать, заменить детали под свою идею и сразу протестировать.',
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит PDF. Возвращаться и нажимать «Проверить» не нужно.',
  subscribe_button_text = 'Подписаться и забрать промпты',
  check_button_text = '',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = 'Промпты и бесплатный тест',
  body = E'Промпты готовы 🎁\n\nВ PDF — 10 готовых формул для изображений и видео.\n\nКак протестировать:\n\n1. Выберите промпт в PDF.\n2. Скопируйте его без сокращений.\n3. Откройте бота по кнопке ниже.\n4. Выберите нейросеть и вставьте промпт.\n\nВ боте собраны основные нейросети, а новым пользователям доступны 2 бесплатные генерации.',
  button_text = 'Протестировать — 2 генерации бесплатно',
  delay_minutes = 0,
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Две попытки с пользой',
  body = E'Если ещё не запускали промпт — не откладывайте его в сохранённые.\n\nПервую генерацию сделайте без изменений — так вы увидите исходный результат.\n\nВо второй замените только героя или свой продукт. Так сразу будет видно, как формула работает под вашу задачу.',
  button_text = 'Использовать 2 бесплатные генерации',
  delay_minutes = 60,
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;
