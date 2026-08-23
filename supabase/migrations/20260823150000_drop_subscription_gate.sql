/*
  The catalogue stops costing a subscription.

  Everything downstream was built around the gate: the reader arrived from
  Instagram wanting prompts and was met with a condition, two steps after the
  promise and before anything had been handed over. That is the most expensive
  place in the funnel to ask for something, and the ask was mandatory.

  `require_subscription` is all it takes — `handleStart` reads it, and with the
  gate down the reader goes straight to `deliver`. The funnel's picture moves
  with them: the greeting is empty, so the file rides on the first step of the
  sequence instead of on the subscription request it used to open.

  The gate's own copy is left in place rather than cleared. It holds the best
  paragraph anyone wrote for this funnel — why a neural network returns the
  wrong picture — and it costs nothing to keep against the day the gate comes
  back. It simply stops being shown.
*/

UPDATE telegram_funnels
SET
  require_subscription = false,
  updated_at = now()
WHERE slug = 'prompts'
  AND (
    name ILIKE '10 пром%'
    OR name ILIKE '10 готов%'
    OR name ILIKE '1000+ пром%'
    OR name ILIKE '1000+ готов%'
  );

/*
  Two of the five Direct variants sold the subscription as the step that opened
  the catalogue. With no gate to describe they would be promising a hoop that
  no longer exists — the one kind of copy that costs more than it earns, since
  the reader who braced for a condition and met none still remembers being
  asked. Both are rewritten to say what now actually happens; the other three
  never mentioned it and are left alone.
*/
UPDATE lead_magnets magnet
SET
  direct_reply_variants = ARRAY[
    direct_reply_variants[1],
    direct_reply_variants[2],
    direct_reply_variants[3],
    E'Лови 1000+ промптов для визуала в нейросетях!\n\nВнутри — формулы для картинок и место для их мгновенного теста. Схема простая: жмёшь кнопку — и бот сразу отдаёт доступ к базе. Без условий и регистраций.\n\nЗабирай по кнопке 👇',
    E'Делай студийные картинки в нейросетях с 1-й попытки!\n\nЯ упаковал 1000+ промптов для сочного визуала и подключил движок для быстрого теста. Бот отдаёт базу сразу, делать ничего не нужно.\n\nЖми кнопку ниже 👇'
  ],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND (
      funnel.name ILIKE '10 пром%'
      OR funnel.name ILIKE '10 готов%'
      OR funnel.name ILIKE '1000+ пром%'
      OR funnel.name ILIKE '1000+ готов%'
    )
    AND funnel.lead_magnet_id IS NOT NULL
)
  AND array_length(magnet.direct_reply_variants, 1) = 5;
