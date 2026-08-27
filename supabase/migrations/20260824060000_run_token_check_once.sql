/*
  Intentionally empty.

  Token checks are operational work and must not run while schema migrations
  are being applied. A fresh project configures Vault only after `db push`, and
  a migration must never depend on network access or an Edge Function being
  deployed. The scheduled `check-instagram-tokens` cron job performs the first
  check after Vault and the functions have been configured.
*/
