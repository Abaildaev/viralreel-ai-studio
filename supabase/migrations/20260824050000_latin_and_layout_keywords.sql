/*
  Two more ways people type the same word.

  `prompt` for the ones who write it in English, and `ghjvgn` / `ghjvn` for the
  ones who type «промпт» without switching the keyboard — those six letters are
  what the Russian word turns into on a QWERTY layout, and it is the single
  most common way a code word arrives unrecognised.

  Neither can collide with anything. In `contains` mode the match allows three
  letters of inflection after the word, so `prompt` also catches «prompts»,
  «prompted» and «prompting» — every one of them a request — and no ordinary
  English word begins with it. The layout pair is nonsense in both languages.

  This matters more now than it did a day ago: under a post people copy the
  word off the screen, and in a private message they type it from memory.
*/

UPDATE lead_magnets magnet
SET
  keywords = ARRAY['промпт', 'промт', 'prompt', 'ghjvgn', 'ghjvn'],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);
