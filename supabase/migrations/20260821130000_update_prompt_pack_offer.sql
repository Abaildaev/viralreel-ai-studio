/*
  Make the prompt pack the single offer everywhere.

  The old copy sold two free generations, while the Instagram CTA promised a
  ready-made pack. Keep the funnel and its captions aligned: the code word is
  «промпт», and the promised result is a pack that can be adapted to any task.
*/

UPDATE telegram_funnels
SET
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит готовый пак промптов под любые задачи. Возвращаться и нажимать «Проверить» не нужно.',
  subscribe_button_text = 'Подписаться и забрать пак промптов',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = 'Готовый пак промптов',
  body = E'Промпты готовы 🎁\n\nВ PDF — готовый пак промптов под любые задачи: стиль, свет, композиция и детали уже собраны в понятные структуры.\n\nВыберите нужную формулу, скопируйте её целиком и замените детали под свою идею.\n\nПИШИ «промпт» — и я отправлю готовый пак промптов под любые задачи.',
  button_text = 'Забрать пак промптов',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Как адаптировать пак',
  body = E'Сохраните пак, чтобы не искать слова для нейросети с нуля.\n\nВ каждой формуле уже заданы стиль, свет и композиция — меняйте только героя, продукт или нужные детали под свою задачу.',
  button_text = 'Использовать готовые промпты',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;
