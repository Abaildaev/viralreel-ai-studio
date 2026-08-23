/*
  One prompt folded into an expandable quote, to see how it reads.

  The Istanbul prompt is the longest of the four — three and a half thousand
  characters — and it pushes the button that the whole message exists for two
  screens below the fold. Wrapped in `<blockquote expandable>` it collapses to
  a few lines with a "show more", and the button comes back into view.

  Done with `replace` rather than by restating the text: the prompt is the one
  thing in this funnel that must survive rewriting unaltered, and retyping
  three and a half thousand characters to add forty is how a stray character
  gets in.

  The tags cost nothing against Telegram's limit — the ceiling is measured on
  the parsed text, and markup is stripped before it counts.

  Left deliberately as a single step. If the fold reads well the other three
  follow, and the line that promises a one-tap copy has to change with them:
  the first tap will open the quote, and only the second will copy.
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
  AND step.position = 7
  /* Only if it has not already been folded, so re-running cannot nest one
     quote inside another. */
  AND step.body LIKE '%<code>%'
  AND step.body NOT LIKE '%<blockquote%';

/*
  Send that one step again to the account that has to look at it. Only this
  step: the message after it waits a day, so nothing cascades.
*/
UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute',
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
  AND step.position = 7;
