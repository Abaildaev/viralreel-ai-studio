/*
  A button of its own for every Direct variant.

  One rule used to carry several ways of saying the same thing and exactly one
  button under all of them, so a variant that opened with «Хватит мучиться»
  and one that opened with «Твой чит-код» had to share a caption written for
  neither. The titles live in a second array beside the words, matched by
  index: a position left empty falls back to `button_text`, which is what every
  rule written before this column did and keeps doing.

  Parallel arrays rather than a column of pairs, because the variants are
  already in production and rewriting them into objects would need a data
  migration for something the reader never sees.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS direct_reply_buttons text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN lead_magnets.direct_reply_buttons IS
  'Надписи на кнопке для direct_reply_variants, по индексу. Пустое место — берётся button_text.';

/*
  The prompt funnel's own set, in the order its variants are stored. The first
  three promise the catalogue outright, the last two name the subscription on
  the way to it, and the buttons follow that split: «тестировать» where the
  copy leads with the test, «забрать» where it leads with the base.
*/
UPDATE lead_magnets magnet
SET
  direct_reply_buttons = ARRAY[
    'Тестировать промпты',
    'Забрать базу и тест',
    'Забрать 1000+ схем',
    'Забрать базу и тест',
    'Тестировать формулы'
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
);
