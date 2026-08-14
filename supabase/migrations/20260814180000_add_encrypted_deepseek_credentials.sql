/*
  Per-user DeepSeek credentials for server-side automations.

  The browser never reads this table. The value is AES-GCM encrypted by the
  authenticated Edge Function with CREDENTIALS_ENCRYPTION_KEY before it gets
  here; the webhook decrypts it only while replying on behalf of that user.
*/

CREATE TABLE IF NOT EXISTS user_ai_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deepseek_api_key_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_ai_credentials ENABLE ROW LEVEL SECURITY;

/* No client policies on purpose: clients can set/status the credential only
   through the authenticated Edge Function and can never select its value. */
