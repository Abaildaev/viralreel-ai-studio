/*
  Keep the Instagram access token on the server.

  RLS scoped `instagram_accounts` rows to their owner, but every column was
  readable — including `access_token`, a long-lived credential that can publish
  to the account. Any XSS, malicious extension, or shoulder-surf on the accounts
  page leaked it.

  Column-level grants now hide the token from `anon` and `authenticated`.
  Edge Functions use the service role, which is unaffected by these grants, so
  publishing, verification and webhooks keep working.

  Note: `SELECT *` on this table now fails for the frontend by design — clients
  must list the columns they need.
*/

REVOKE ALL PRIVILEGES ON TABLE instagram_accounts FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  account_name,
  username,
  ig_user_id,
  profile_picture_url,
  is_active,
  token_expires_at,
  webhook_subscribed_at,
  webhook_error,
  created_at,
  updated_at
) ON TABLE instagram_accounts TO authenticated;

GRANT UPDATE (account_name, is_active, updated_at)
  ON TABLE instagram_accounts TO authenticated;

GRANT DELETE ON TABLE instagram_accounts TO authenticated;

-- Accounts are created exclusively by the connect-instagram-account function,
-- which holds the token and runs with the service role.
DROP POLICY IF EXISTS "Users can create own instagram accounts" ON instagram_accounts;
