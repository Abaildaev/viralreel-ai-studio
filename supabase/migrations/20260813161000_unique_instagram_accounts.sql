/* Prevent duplicate connections of the same Instagram account per app user. */

CREATE UNIQUE INDEX IF NOT EXISTS instagram_accounts_user_ig_unique_idx
  ON instagram_accounts (user_id, ig_user_id);
