/*
  Button titles short enough to survive either reading of Meta's limit.

  The limit is documented in characters, and the sender now measures it that
  way. But the code measured bytes until today, nobody outside Meta can say
  which of the two the platform enforces, and the cost of being wrong is the
  message failing to send at the one moment the reader is ready to tap.

  Ten Cyrillic letters is twenty bytes, so a title of that length passes under
  both readings at once. Digits and latin cost a byte each rather than two,
  which is why «1000+ схем» fits at ten characters and fourteen bytes.

  Shorter titles also lose something: «Тестировать промпты» said what would
  happen, «1000+ схем» only names the prize. Naming the prize is the half
  worth keeping when only half fits.
*/

UPDATE lead_magnets magnet
SET
  direct_reply_buttons = ARRAY[
    '1000+ схем',
    'Хочу базу',
    'Хочу чит',
    'Забрать',
    'К формулам'
  ],
  /* The fallback for a variant left without its own title, kept under the
     same ceiling — it is the one that ships when someone clears a field. */
  button_text = 'Забрать',
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
