/*
  Keep Telegram media inside Telegram after its first delivery.

  Sending a Storage URL makes Telegram download the same image again for every
  /start. Telegram's returned file_id is durable for the bot that uploaded it,
  so cache it by bot + object path + media type and reuse it directly.
*/

CREATE TABLE IF NOT EXISTS telegram_attachment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  attachment_path text NOT NULL,
  attachment_type text NOT NULL
    CHECK (attachment_type IN ('photo', 'video', 'document')),
  telegram_file_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_bot_id, attachment_path, attachment_type)
);

ALTER TABLE telegram_attachment_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram attachment cache"
  ON telegram_attachment_cache;
CREATE POLICY "Users can view own telegram attachment cache"
  ON telegram_attachment_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM telegram_bots bot
      WHERE bot.id = telegram_attachment_cache.telegram_bot_id
        AND bot.user_id = auth.uid()
    )
  );

GRANT SELECT ON TABLE telegram_attachment_cache TO authenticated;
