/*
  Back to six variants.

  Three carry the Requests tip and three do not. Identical text under every
  comment is the single loudest automation signal a post can carry, and three
  variants is the floor of what rotation needs — under a post with a run of
  comments the repeat starts showing.

  Mixing plain ones in also spares the readers who follow the account: their
  Direct arrives in the main inbox, and a note about where to dig for it is
  noise they do not need.
*/

UPDATE lead_magnets magnet
SET
  public_reply_variants = ARRAY[
    'Отправил в Direct! Если во входящих пусто — загляни во вкладку «Запросы»: туда Instagram кладёт сообщения от тех, на кого ты не подписан 📩',
    'Уже в личке! Не видно — проверь «Запросы» в Direct 👀',
    'Отправил! Если не всплыло — сообщение ждёт в «Запросах» 📨',
    'Отправил в Direct, лови 🙌',
    'Улетело в личку 🚀',
    'Готово, проверяй Direct 👇'
  ],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);
