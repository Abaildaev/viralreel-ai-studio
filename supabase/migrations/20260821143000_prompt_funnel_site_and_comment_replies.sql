/* Send the prompt site from the Telegram funnel and add delivery hints to comments. */

UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nПосле подписки бот отправит ссылку на сайт с 2000+ готовых промптов для любых визуальных задач.',
  subscribe_button_text = 'Подписаться и открыть 2000+ промптов',
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = '2000+ готовых промптов',
  body = E'Промпты готовы 🎁\n\nНа сайте — 2000+ готовых промптов для нейросетей под любые визуальные задачи: стиль, свет, композиция и детали уже собраны в понятные структуры.\n\nОткрывайте каталог, выбирайте нужную формулу и меняйте детали под свою идею.',
  button_text = 'Открыть 2000+ промптов',
  button_url = 'https://nanobanana-prompts.netlify.app/',
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Вернуться к промптам',
  body = E'Сохраните сайт, чтобы не искать слова для нейросети с нуля.\n\nВ каталоге уже собраны 2000+ формул для стиля, света и композиции — меняйте только героя, продукт или нужные детали под свою задачу.',
  button_text = 'Вернуться к промптам',
  button_url = 'https://nanobanana-prompts.netlify.app/',
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;

UPDATE lead_magnets magnet
SET
  public_reply_variants = ARRAY[
    'Отправил в Direct! Проверяйте сообщения 🚀',
    'Ссылка уже у вас в Direct 🙌',
    'Материал отправлен в личные сообщения!',
    'Если сообщение не пришло, проверьте папку «Запросы» в Direct 📩',
    'Не видите сообщение? Загляните в папку «Запросы» — иногда оно попадает туда 👀',
    'Проверьте папку «Запросы» в Direct, если сообщение не появилось сразу 🔎'
  ],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
    AND funnel.lead_magnet_id IS NOT NULL
);
