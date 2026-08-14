/*
  Give the AI sales agent somewhere to live.

  Until now the agent existed only in the browser: its configuration sat in
  localStorage and the simulator called DeepSeek from the page. Nothing about it
  reached the server, so it never answered a real Direct message — the webhook
  had no idea it existed.

  Two tables:
  - `ai_sales_agents` holds one configuration per Instagram account (or one
    account-agnostic fallback per user, with a NULL account id).
  - `ai_sales_messages` is the conversation transcript, which the agent needs
    both as prompt context and to enforce its own reply limit.

  The DeepSeek key is deliberately NOT stored here. Edge Functions read it from
  the `DEEPSEEK_API_KEY` secret, the same way they already read META_APP_SECRET
  and CRON_SECRET. Migration 20260814121000 removed the key from the database on
  purpose, and nothing below puts it back.
*/

CREATE TABLE IF NOT EXISTS ai_sales_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  agent_name text NOT NULL DEFAULT 'Ассистент',
  tone text NOT NULL DEFAULT 'friendly_expert'
    CHECK (tone IN ('friendly_expert', 'energetic_mentor', 'concise_consultant', 'premium_concierge')),
  goal text NOT NULL DEFAULT 'consultation'
    CHECK (goal IN ('consultation', 'direct_sale', 'collect_contact', 'lead_qualification')),
  business_description text NOT NULL DEFAULT '',
  custom_instructions text NOT NULL DEFAULT '',
  target_action_prompt text NOT NULL DEFAULT '',
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  objections jsonb NOT NULL DEFAULT '[]'::jsonb,
  handoff_keywords text[] NOT NULL DEFAULT ARRAY['человек', 'менеджер', 'оператор']::text[],
  /* Cap on how many times the agent answers one person before it stands down
     and waits for a human. Zero would disable it entirely, which `is_enabled`
     already expresses more clearly. */
  max_consecutive_replies integer NOT NULL DEFAULT 5
    CHECK (max_consecutive_replies BETWEEN 1 AND 20),
  /* Off by default. Turning this on makes the account start messaging real
     people unattended, so it has to be a deliberate act. */
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/*
  One config per account, and one account-agnostic fallback per user. A plain
  UNIQUE constraint would not enforce the second case, because NULLs never
  compare equal — hence the partial index.
*/
CREATE UNIQUE INDEX IF NOT EXISTS ai_sales_agents_account_idx
  ON ai_sales_agents (user_id, instagram_account_id)
  WHERE instagram_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_sales_agents_default_idx
  ON ai_sales_agents (user_id)
  WHERE instagram_account_id IS NULL;

ALTER TABLE ai_sales_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can view own sales agents"
  ON ai_sales_agents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can insert own sales agents"
  ON ai_sales_agents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can update own sales agents"
  ON ai_sales_agents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can delete own sales agents"
  ON ai_sales_agents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_sales_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  sender_igsid text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'agent')),
  content text NOT NULL,
  detected_intent text,
  /* Set on the agent turn that hands the conversation to a human. Its presence
     anywhere in a thread is what stops the agent answering again. */
  handed_off boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_sales_messages_thread_idx
  ON ai_sales_messages (instagram_account_id, sender_igsid, created_at DESC);

ALTER TABLE ai_sales_messages ENABLE ROW LEVEL SECURITY;

/*
  Transcripts are reachable through the account that owns them; Edge Functions
  write with the service role and bypass this.
*/
DROP POLICY IF EXISTS "Users can view own sales messages" ON ai_sales_messages;
CREATE POLICY "Users can view own sales messages"
  ON ai_sales_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM instagram_accounts account
      WHERE account.id = ai_sales_messages.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );

/*
  Same retention as the automation event log: transcripts are diagnostic, and
  they contain other people's messages, so they should not accumulate forever.
*/
CREATE OR REPLACE FUNCTION prune_ai_sales_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM ai_sales_messages WHERE created_at < now() - interval '90 days';
$$;
