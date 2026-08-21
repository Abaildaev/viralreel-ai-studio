/* Align the Instagram keyword rule that feeds the prompt Telegram funnel. */

UPDATE lead_magnets magnet
SET
  title = 'Готовый пак промптов под любые задачи',
  description = 'Чёткие структуры промптов для стиля, света и композиции. Напишите «промпт» — и я отправлю готовый пак под вашу задачу.',
  codeword = 'промпт',
  keywords = ARRAY['промпт'],
  reply_text = E'Готово 🎁\n\nПереходите в Telegram — там вас ждёт готовый пак промптов под любые задачи.',
  direct_reply_variants = ARRAY[E'Готово 🎁\n\nПереходите в Telegram — там вас ждёт готовый пак промптов под любые задачи.'],
  button_text = 'Забрать пак промптов',
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
    AND funnel.lead_magnet_id IS NOT NULL
);
