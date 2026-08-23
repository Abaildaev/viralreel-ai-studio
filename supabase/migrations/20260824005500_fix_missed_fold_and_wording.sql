/*
  The two statements that quietly matched nothing.

  Folding the Istanbul prompt and rewording the four instruction steps both
  reported success and changed no rows — an UPDATE that matches nothing is not
  an error. The rows carry their proof: every step except 3, 5 and 9 still
  showed the timestamp of the migration that created it.

  Rewritten as plainly as the statement allows, with no commentary inside the
  WHERE clause and the funnel found by slug alone. Verified afterwards by
  reading the rows back rather than by trusting the word "applied".
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
  AND step.position = 7
  AND step.body LIKE '%<code>%'
  AND step.body NOT LIKE '%<blockquote%';

UPDATE telegram_funnel_steps step
SET
  body = replace(
    step.body,
    'Нажми на промпт в следующем сообщении — он скопируется в один клик.',
    'Разверни промпт в следующем сообщении и нажми на текст — он скопируется целиком.'
  ),
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND step.body LIKE '%скопируется в один клик%';
