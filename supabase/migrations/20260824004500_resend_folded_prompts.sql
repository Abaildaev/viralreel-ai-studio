/*
  Fold the three remaining prompts if they somehow are not folded, then send
  those three again.

  The reader reported one of them arriving unfolded. The likeliest reading is
  that they were looking at the copy from the earlier replay, which went out
  before the fold — the chat now holds two of everything. But "likeliest" is a
  guess, and the same statement that would fix a real miss also proves the
  guess when it changes nothing.

  The fold is written to be safe to run twice: a prompt already inside a quote
  fails the guard and is left alone.
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

/* Only the three in question: the rest of the sequence is already in the chat
   twice, and a third copy of all nine teaches nothing. */
UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute' + (step.position * interval '1 second'),
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL
FROM telegram_subscribers subscriber, telegram_funnel_steps step, telegram_funnels funnel
WHERE delivery.subscriber_id = subscriber.id
  AND delivery.step_id = step.id
  AND step.funnel_id = funnel.id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
  AND step.position IN (3, 5, 9);
