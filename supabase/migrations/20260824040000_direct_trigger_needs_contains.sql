/*
  The keyword has to be findable inside a sentence now.

  With the call to action moved from comments to Direct, `exact` stops being a
  reasonable rule: under a post people type the code word and nothing else,
  but in a private message they write to a person — «привет, промпт»,
  «промпт пожалуйста». Every one of those was being dropped.

  `contains` matches the word anywhere in the message and allows up to three
  letters of Russian inflection after it. «ПРОМПТ» was checked against the
  ordinary things people write and stays clean: it catches «промпты»,
  «промптом» and «а какой промпт?» — all of them requests — and does not fire
  on any common word that merely starts the same way.
*/

UPDATE lead_magnets magnet
SET
  match_mode = 'contains',
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);
