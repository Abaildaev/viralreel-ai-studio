/*
  The remaining three prompts folded the same way, and the instruction that
  described the old behaviour brought in line with the new one.

  A folded prompt costs one extra tap: the first opens the quote, the second
  copies. "Скопируется в один клик" was accurate while the prompt lay open and
  is not any more — and an instruction that describes something the reader
  does not see is worse than no instruction, because they stop trusting the
  rest of the list.

  Both edits are `replace` on the stored text rather than a rewrite: the
  prompts have to survive untouched, and the instruction line is identical in
  all four steps that carry it, so one substitution reaches every copy.

  Guarded against a second run — a prompt already inside a quote is skipped
  rather than wrapped twice.
*/

UPDATE telegram_funnel_steps step
SET
  body = replace(
    replace(step.body, '<code>', '<blockquote expandable><code>'),
    '</code>',
    '</code></blockquote>'
  ),
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
  AND step.position IN (3, 5, 9)
  AND step.body LIKE '%<code>%'
  AND step.body NOT LIKE '%<blockquote%';

UPDATE telegram_funnel_steps step
SET
  body = replace(
    step.body,
    '1. Нажми на промпт в следующем сообщении — он скопируется в один клик.',
    '1. Разверни промпт в следующем сообщении и нажми на текст — он скопируется целиком.'
  ),
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
  AND step.position IN (2, 4, 6, 8);
