/*
  Two blind spots in the Telegram funnel.

  A funnel that stops working stops quietly. If the bot is demoted in the
  channel, `getChatMember` starts failing, every visitor is treated as
  unsubscribed, and nobody receives the material — while the interface still
  reports a healthy bot. `health_alert_at` lets the fault be reported to the
  owner once rather than on every incoming message.

  And churn was invisible. The webhook recorded people joining the channel but
  ignored the update that says they left, so someone who took the lead magnet
  and walked away still counted as a subscriber forever. `channel_left_at`
  records the departure without erasing `subscribed_at` — both facts are true,
  and the funnel's history should keep saying so.
*/

ALTER TABLE telegram_bots
  ADD COLUMN IF NOT EXISTS health_alert_at timestamptz;

GRANT SELECT (health_alert_at) ON TABLE telegram_bots TO authenticated;

ALTER TABLE telegram_subscribers
  ADD COLUMN IF NOT EXISTS channel_left_at timestamptz;

/* The churn query: people who confirmed a subscription and later left. */
CREATE INDEX IF NOT EXISTS telegram_subscribers_channel_left_idx
  ON telegram_subscribers (telegram_bot_id, channel_left_at)
  WHERE channel_left_at IS NOT NULL;

CREATE OR REPLACE VIEW telegram_funnel_stats
WITH (security_invoker = true) AS
SELECT
  funnel.id AS funnel_id,
  funnel.user_id,
  funnel.telegram_bot_id,
  funnel.name,
  funnel.slug,
  count(subscriber.id) AS started_count,
  count(subscriber.subscribed_at) AS subscribed_count,
  count(subscriber.delivered_at) AS delivered_count,
  count(subscriber.signed_up_at) AS signed_up_count,
  count(subscriber.id) FILTER (WHERE subscriber.source = 'instagram') AS from_instagram_count,
  count(subscriber.id) FILTER (WHERE subscriber.is_blocked) AS blocked_count,
  max(subscriber.created_at) AS last_subscriber_at,
  /* Appended rather than slotted in beside the other counts: CREATE OR REPLACE
     VIEW may only add columns at the end, and renaming an existing one — which
     is what inserting in the middle looks like to Postgres — is rejected. */
  count(subscriber.channel_left_at) AS channel_left_count
FROM telegram_funnels funnel
LEFT JOIN telegram_subscribers subscriber ON subscriber.funnel_id = funnel.id
GROUP BY funnel.id, funnel.user_id, funnel.telegram_bot_id, funnel.name, funnel.slug;

GRANT SELECT ON telegram_funnel_stats TO authenticated;
