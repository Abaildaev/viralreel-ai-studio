/*
  One message at the entrance, two at the delivery.

  The funnel used to greet, then ask for the subscription in a second message —
  two bubbles saying almost the same thing before the reader had been given
  anything. The greeting and the ask are now a single message: hook, what the
  catalogue is, why the channel is worth the tap, and one instruction.

  The webhook already skips the greeting when it is empty and carries no file
  (`handleStart` in telegram-bot), so clearing `welcome_text` is all it takes —
  no code path changes. Both delivery steps are immediate, so the catalogue and
  the partner bot arrive back to back while the reader is still in the chat:
  `planSequence` sends consecutive zero-delay steps in one pass.

  Deliberately timestamped after `..._update_prompt_funnel_pack_count`, which
  rewrites the same rows back to the partner-bot-only copy. Running before it
  would leave that migration with the last word. For the same reason the funnel
  is matched on every name it has carried rather than on the current one: the
  rename to «1000+ готовых промптов для визуала» may or may not have reached
  this database yet, and this has to land either way.

  The funnel's own attachment columns are deliberately left untouched. They
  hold the picture of what is being promised, and with the greeting gone the
  webhook now hangs it on the subscription request instead — so clearing them
  here would silently strip the image off the one message everybody sees. The
  step attachments below are a different matter: those steps hand over links,
  not files.
*/

UPDATE telegram_funnels
SET
  welcome_text = '',
  not_subscribed_text = E'Промпты из Reels — забирайте 🎁\n\nНейросеть выдаёт слабую картинку не потому, что она плохая. Просто ей не сказали, какой нужен свет, ракурс, фактура и стиль. Всё это и есть промпт — и придумывать его самому больше не нужно.\n\nЯ открываю вам доступ к каталогу из 1000+ готовых промптов. Портрет, предметная съёмка, реклама, интерьеры, фоны — под каждую задачу уже собрана рабочая формула. Копируете, меняете героя или продукт под себя и получаете результат с первой попытки, а не с двадцатой.\n\nУсловие одно: подпишитесь на канал 👇\n\nКак только подпишетесь, бот сам пришлёт каталог.',
  subscribe_button_text = 'Подписаться и забрать промпты',
  check_button_text = '',
  updated_at = now()
WHERE slug = 'prompts'
  AND (
    name ILIKE '10 пром%'
    OR name ILIKE '10 готов%'
    OR name ILIKE '1000+ пром%'
    OR name ILIKE '1000+ готов%'
  );

/* First delivery: the thing that was promised. */
UPDATE telegram_funnel_steps step
SET
  title = 'Каталог 1000+ промптов',
  body = E'Готово — каталог ваш 🎁\n\nВнутри 1000+ промптов, разложенных по задачам: портрет, предметная съёмка, реклама, интерьер, фон, свет и стиль. В каждой формуле уже прописаны те детали, из-за которых обычно и получается «не то».\n\nКак пользоваться:\n\n1. Выберите категорию под свою задачу.\n2. Скопируйте промпт целиком, без сокращений.\n3. Замените только героя, продукт или деталь — остальное уже настроено за вас.\n\nСохраните ссылку в закладки. Это не разовый файл: каталог будет под рукой каждый раз, когда нужна картинка, и начинать с чистого листа вам больше не придётся.',
  button_text = 'Открыть 1000+ промптов',
  button_url = 'https://nanobanana-prompts.netlify.app/',
  delay_minutes = 0,
  is_active = true,
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
  AND step.position = 1;

/* Second delivery, immediately after: where to run what they just got. */
UPDATE telegram_funnel_steps step
SET
  title = 'Где запускать промпты',
  body = E'И ещё кое-что 👇\n\nПромпт сам по себе картинку не нарисует — его нужно где-то запустить. Чтобы вам не регистрироваться в пяти сервисах и не платить за каждый отдельно, вот бот, где основные нейросети для изображений и видео собраны в одном месте.\n\nИ 2 генерации в нём — бесплатно, в подарок от меня. Ровно столько, чтобы проверить промпт из каталога и увидеть результат своими глазами.\n\nСделайте прямо сейчас, пока не отложилось:\n\nПервую генерацию запустите промптом как есть — увидите, каким должен быть результат. Во второй замените героя на свой продукт. На этой паре сразу видно, как формула работает под вашу задачу.',
  button_text = 'Забрать 2 генерации бесплатно',
  button_url = 'https://t.me/Integer_ai_bot?start=REF00009284',
  delay_minutes = 0,
  is_active = true,
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
  AND step.position = 2;

/*
  The Direct message is the same promise one step earlier, so it names the same
  thing. Promising a «пак промптов» in Instagram and handing over a catalogue in
  Telegram is the break that costs the subscription.
*/
UPDATE lead_magnets magnet
SET
  title = 'Каталог 1000+ промптов для нейросетей',
  description = 'Готовые формулы под портрет, предметку, рекламу и интерьеры. Напишите «промпт» — пришлю доступ к каталогу.',
  reply_text = E'Готово 🎁\n\nПереходите в Telegram — там открывается доступ к каталогу из 1000+ готовых промптов под любую визуальную задачу.',
  direct_reply_variants = ARRAY[
    E'Готово 🎁\n\nПереходите в Telegram — там открывается доступ к каталогу из 1000+ готовых промптов под любую визуальную задачу.',
    E'Держите 🎁\n\nКаталог из 1000+ промптов ждёт в Telegram — выбирайте формулу под свою задачу и копируйте.'
  ],
  button_text = 'Забрать промпты',
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND (
      funnel.name ILIKE '10 пром%'
      OR funnel.name ILIKE '10 готов%'
      OR funnel.name ILIKE '1000+ пром%'
      OR funnel.name ILIKE '1000+ готов%'
    )
    AND funnel.lead_magnet_id IS NOT NULL
);

/*
  The follow-ups.

  The catalogue is handed over in seconds; the partner bot is where the reader
  has to do something, and doing something is what almost nobody does on the
  first evening. So three nudges over two days, each from a different angle —
  friction, then usefulness, then a plain last call. Repeating one angle three
  times reads as nagging and gets the bot blocked.

  Delays are counted from the previous step, so 180 / 1260 / 1440 lands them at
  roughly three hours, one day and two days after the material arrives.

  Written as an upsert on (funnel_id, position) because these steps may not
  exist yet on one database and may already exist on another. Existing
  subscribers who have finished the sequence will not receive them: nothing
  wakes a funnel that has already run out, and only new arrivals walk the new
  path.
*/
INSERT INTO telegram_funnel_steps (
  user_id, funnel_id, position, title, body, button_text, button_url, delay_minutes, is_active
)
SELECT
  funnel.user_id,
  funnel.id,
  followup.position,
  followup.title,
  followup.body,
  followup.button_text,
  'https://t.me/Integer_ai_bot?start=REF00009284',
  followup.delay_minutes,
  true
FROM telegram_funnels funnel
CROSS JOIN (VALUES
  (
    3,
    'Дожим 1 · две минуты',
    E'Загляните на минуту 👀\n\nЕсли каталог ушёл в закладки — это нормально, так делают почти все. И почти все потом к нему не возвращаются.\n\nПоэтому давайте сейчас, пока помните. Не «изучить каталог», а один промпт: откройте бота, вставьте первый попавшийся, нажмите отправить. Две минуты.\n\nПервая картинка — это момент, после которого промпты перестают быть теорией. Пока её нет, каталог остаётся просто ссылкой.',
    'Вставить промпт в бота',
    180
  ),
  (
    4,
    'Дожим 2 · одна деталь за раз',
    E'Небольшая хитрость 🧠\n\nОдин промпт из каталога — это не одна картинка. Это десяток, если менять в нём по одной детали за раз.\n\nВозьмите любую формулу и попробуйте так:\n\n1. Запустите как есть.\n2. Поменяйте только фон — та же сцена окажется в другом месте.\n3. Поменяйте только свет — «утро» вместо «студии».\n4. Поменяйте героя на свой продукт.\n\nКаждый раз меняйте одну вещь. За пару минут станет понятно, какая часть промпта за что отвечает, — и дальше вы будете собирать свои формулы сами, уже без инструкции.\n\nПодарочные генерации на месте, если вы их ещё не тратили.',
    'Попробовать в боте',
    1260
  ),
  (
    5,
    'Дожим 3 · последнее напоминание',
    E'Последнее напоминание, и я отстану 🙌\n\nДва дня назад вы забрали каталог. Дальше есть два варианта.\n\nПервый: ссылка так и лежит в закладках, а визуал вы делаете как раньше — или не делаете вовсе.\n\nВторой: вы тратите десять минут, прогоняете два-три промпта и оставляете себе рабочий инструмент, к которому будете возвращаться каждый раз, когда нужна картинка.\n\nВся разница — один клик по кнопке ниже. Подарочные генерации ждут там же.',
    'Открыть бота',
    1440
  )
) AS followup(position, title, body, button_text, delay_minutes)
WHERE funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
ON CONFLICT (funnel_id, position) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  button_text = EXCLUDED.button_text,
  button_url = EXCLUDED.button_url,
  delay_minutes = EXCLUDED.delay_minutes,
  is_active = true,
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now();
