/*
  Enable pg_net, without which every scheduled job is a no-op.

  All the cron jobs in this project call `net.http_post` to invoke an Edge
  Function. That schema comes from the pg_net extension, and pg_net is not
  enabled by default on a Supabase project — so on a database where nobody
  turned it on, every job fails with `schema "net" does not exist` and the
  failure is only visible in `cron.job_run_details`, which nothing reads.

  The symptom is the worst kind: everything looks configured, the jobs are
  listed and active, and nothing runs. On the project this was found on, it had
  been silently disabling scheduled publishing since the very first cron
  migration — `auto-publish-reels` had never once executed.

  Placed before nothing in particular, because the jobs themselves are created
  by earlier migrations: pg_cron stores the command as text and only resolves
  `net.http_post` when the job fires, so enabling the extension afterwards
  fixes the jobs already scheduled.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;

/*
  pg_net keeps its functions in its own `net` schema regardless of any
  requested target, and the job commands are written against that name. This is
  a guard rail: if a future Postgres or Supabase release changes the default,
  the migration fails loudly here rather than leaving every scheduled job
  quietly broken again.
*/
DO $$
BEGIN
  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION
      'pg_net is installed but net.http_post is missing — cron jobs invoke Edge Functions through it';
  END IF;
END $$;
