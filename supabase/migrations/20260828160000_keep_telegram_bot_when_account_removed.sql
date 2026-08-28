/*
  # Удаление Instagram-аккаунта не должно уносить Telegram-бота

  Привязка бота к аккаунту приехала с `ON DELETE CASCADE`, и это слишком
  дорогая расплата за не то действие. Бот тянет за собой каскадом воронки,
  подписчиков и рассылки: человек отключает Instagram-аккаунт, потому что
  протух токен, — и вместе с ним молча теряет всю собранную в Telegram базу,
  которую восстановить неоткуда.

  1. Изменения
    - `telegram_bots.instagram_account_id` → `ON DELETE SET NULL`. Бот
      переживает удаление аккаунта и становится общим: продолжает отвечать,
      сохраняет подписчиков, и его можно закрепить за другим аккаунтом или
      отключить руками.

  Так же ведут себя `lead_magnets`, `scheduled_posts` и `video_templates` —
  всё, что хранит работу пользователя, а не производный от аккаунта кэш.
*/

ALTER TABLE public.telegram_bots
  DROP CONSTRAINT IF EXISTS telegram_bots_instagram_account_id_fkey;

ALTER TABLE public.telegram_bots
  ADD CONSTRAINT telegram_bots_instagram_account_id_fkey
  FOREIGN KEY (instagram_account_id)
  REFERENCES public.instagram_accounts(id)
  ON DELETE SET NULL;
