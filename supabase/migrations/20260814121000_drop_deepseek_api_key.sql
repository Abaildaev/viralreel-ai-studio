/*
  Remove the plaintext DeepSeek key from the database.

  The BYOK model documented in the README means the key belongs to the user and
  never has to reach our storage: the frontend calls api.deepseek.com directly
  with the key held in localStorage. Mirroring it into `profiles` only created a
  second plaintext copy to protect.

  DESTRUCTIVE: any key currently stored in this column is deleted. Users whose
  browser localStorage no longer holds the key must re-enter it in «Настройки».
*/

ALTER TABLE profiles DROP COLUMN IF EXISTS deepseek_api_key;
