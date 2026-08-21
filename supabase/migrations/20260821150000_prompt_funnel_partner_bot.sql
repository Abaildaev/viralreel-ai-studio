/* Route the prompt funnel to the partner bot that can test the full pack. */

UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nПосле подписки бот отправит ссылку на партнёрского бота, где можно протестировать все промпты.',
  subscribe_button_text = 'Подписаться и тестировать промпты',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnels
SET
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит ссылку на партнёрского бота, где можно протестировать все промпты. Возвращаться и нажимать «Проверить» не нужно.',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = 'Тестировать промпты в боте',
  body = E'Промпты готовы 🎁\n\nПереходите в партнёрского бота — там можно протестировать все промпты для любых визуальных задач и сразу увидеть результат.',
  button_text = 'Тестировать промпты в боте',
  button_url = 'https://t.me/Integer_ai_bot?start=REF00009284',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Протестировать ещё промпты',
  body = E'В партнёрском боте можно протестировать все промпты и подобрать формулу под свою визуальную задачу.',
  button_text = 'Открыть бота',
  button_url = 'https://t.me/Integer_ai_bot?start=REF00009284',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;
