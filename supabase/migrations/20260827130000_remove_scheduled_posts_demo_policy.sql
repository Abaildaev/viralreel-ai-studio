/*
  Close the legacy demo access path on scheduled_posts.

  The owner-scoped authenticated policies already exist, but an old permissive
  policy survived in production and made those restrictions ineffective.
  Revoking anon privileges as well as dropping the policy provides a second
  layer of protection against future policy drift.
*/

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for demo"
  ON public.scheduled_posts;

REVOKE ALL PRIVILEGES ON TABLE public.scheduled_posts FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.scheduled_posts
  TO authenticated;

GRANT ALL PRIVILEGES
  ON TABLE public.scheduled_posts
  TO service_role;
