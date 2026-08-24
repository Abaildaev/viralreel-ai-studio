/*
  The word «спам» out of the public replies.

  Two of the six told readers to look for the message in their spam folder,
  which labelled our own message as spam in public, under our own post. The
  fact behind it is real and worth keeping: Instagram files messages from
  accounts you do not follow in the Requests tab, for everyone, always — a
  reader who has never heard of that tab simply never sees the Direct.

  What changed is the framing. «Отфильтровали как мусор» and «Instagram кладёт
  письма от неподписанных отдельно» describe the same event, and only one of
  them costs the account anything. The first variant now explains why it
  happens, which turns an apology into an instruction.

  Three variants rather than six: the account owner picked the ones that carry
  the tip. Rotation is thinner, which matters only under a post with many
  comments in a row.
*/

UPDATE lead_magnets magnet
SET
  public_reply_variants = ARRAY[
    'Отправил в Direct! Если во входящих пусто — загляни во вкладку «Запросы»: туда Instagram кладёт сообщения от тех, на кого ты не подписан 📩',
    'Уже в личке! Не видно — проверь «Запросы» в Direct 👀',
    'Отправил! Если не всплыло — сообщение ждёт в «Запросах» 📨'
  ],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);
