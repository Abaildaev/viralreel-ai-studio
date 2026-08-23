/*
  One replay of the whole sequence for the account that owns it.

  Two reasons to do this by hand rather than by pressing /start. The first is
  that /start cannot: the steps were rewritten in place, so their ids survived,
  and this reader's delivery rows from the old funnel still hold the unique
  claim on them — the scheduler tries to claim the next step, loses to the row
  that is already there, and the chain stops after the immediate ones.

  The second is the file cache. Every photo travels from Supabase Storage the
  first time and by Telegram's own file_id every time after, keyed on bot and
  object path. Walking the sequence once warms that cache for everyone who
  arrives later, which is worth an evening of messages to one person.

  Scoped to a single username on purpose. "The most recent subscriber" would
  have been enough while the funnel is quiet, and would have meant nine
  messages — four of them walls of prompt — to a stranger the moment it is not.

  The due times are staggered a second apart in step order rather than set to
  one instant. The worker takes its batch ordered by due_at, so equal times
  would leave the order to chance, and a prompt arriving before the
  instructions that explain it reads as a bug.
*/

INSERT INTO telegram_step_deliveries (
  telegram_bot_id, subscriber_id, step_id, due_at, status, attempts, error_message, sent_at
)
SELECT
  subscriber.telegram_bot_id,
  subscriber.id,
  step.id,
  now() - interval '10 minutes' + (step.position * interval '1 second'),
  'pending',
  0,
  NULL,
  NULL
FROM telegram_subscribers subscriber
JOIN telegram_funnels funnel
  ON funnel.telegram_bot_id = subscriber.telegram_bot_id
JOIN telegram_funnel_steps step
  ON step.funnel_id = funnel.id
 AND step.is_active
WHERE lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
ON CONFLICT (subscriber_id, step_id) DO UPDATE
SET
  due_at = EXCLUDED.due_at,
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL;

/*
  The sequence is walked from the top, so the two marks that say it already
  happened are cleared as well. Left in place, `sequence_done_at` would make
  the reader look finished while nine messages were still on the way.
*/
UPDATE telegram_subscribers subscriber
SET
  delivered_at = NULL,
  sequence_done_at = NULL,
  updated_at = now()
FROM telegram_funnels funnel
WHERE funnel.telegram_bot_id = subscriber.telegram_bot_id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  );
