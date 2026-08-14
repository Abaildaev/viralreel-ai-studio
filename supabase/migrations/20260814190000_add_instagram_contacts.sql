/* Cached public profile data for people who initiated an Instagram Direct chat. */
CREATE TABLE IF NOT EXISTS instagram_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  sender_igsid text NOT NULL,
  username text,
  display_name text,
  profile_picture_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, sender_igsid)
);

CREATE INDEX IF NOT EXISTS instagram_contacts_account_updated_idx
  ON instagram_contacts (instagram_account_id, updated_at DESC);

ALTER TABLE instagram_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own Instagram contacts" ON instagram_contacts;
CREATE POLICY "Users can view own Instagram contacts"
  ON instagram_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM instagram_accounts account
      WHERE account.id = instagram_contacts.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );
