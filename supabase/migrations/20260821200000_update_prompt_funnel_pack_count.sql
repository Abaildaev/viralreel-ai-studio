/* Align the live prompt funnel with the current Instagram offer. */

UPDATE telegram_funnels
SET
  name = '1000+ готовых промптов для визуала',
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nПосле подписки бот отправит ссылку на партнёрского бота, где можно протестировать все 1000+ промптов для визуала.',
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит ссылку на партнёрского бота, где можно протестировать все 1000+ промптов для визуала. Возвращаться и нажимать «Проверить» не нужно.',
  updated_at = now()
WHERE slug = 'prompts'
  AND (
    name ILIKE '10 пром%'
    OR name ILIKE '10 готов%'
    OR name ILIKE '1000+ пром%'
  );

UPDATE telegram_funnel_steps step
SET
  body = E'Промпты готовы 🎁\n\nПереходите в партнёрского бота — там можно протестировать все 1000+ готовых промптов для любых визуальных задач и сразу увидеть результат.',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name = '1000+ готовых промптов для визуала'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  body = E'В партнёрском боте можно протестировать все 1000+ промптов и подобрать формулу под свою визуальную задачу.',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name = '1000+ готовых промптов для визуала'
  AND step.position = 2;
