/*
  The opening message, rewritten.

  It keeps the two things the old one got right — the first line closes the
  promise the reader came here for, and the last one warns that two more
  messages follow, so they read as the promised continuation rather than as a
  bot talking to itself.

  What it gains is the reason to open the catalogue at all: every formula
  carries an example of what it produces. That is the difference between this
  and any list of prompts, and it was the one argument the opening never made.

  The number stays. It is in the Reels card, in the caption and in the Direct
  message, and an opening that answered «1000+» with «десятки» would read as a
  climbdown at the exact moment the reader is checking whether they were told
  the truth.

  Five hundred characters, which leaves room under Telegram's caption limit:
  this message carries the funnel's cover, and a caption over the limit would
  be split away from it.
*/

UPDATE telegram_funnel_steps step
SET
  body = E'Ты на месте! Доступ к 1000+ промптам открыт ✦\n\nФото, видео, дизайн, Reels, персонажи, реклама — под каждую задачу готовая формула, и к каждой пример результата. Видно, что получится, ещё до того, как ты нажмёшь «создать».\n\nНе нужно часами придумывать запрос с нуля: выбираешь то, что нравится → копируешь промпт → создаёшь своё.\n\nЖми кнопку, чтобы открыть каталог с фильтрами — и сразу сохрани его в закладки.\n\nА следующим сообщением пришлю первый промпт дня и инструмент, где его можно тут же протестировать 👇',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND step.position = 1;
