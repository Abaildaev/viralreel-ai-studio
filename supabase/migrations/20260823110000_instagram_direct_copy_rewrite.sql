/*
  New Instagram copy for the prompt funnel: the Direct message and the public
  comment reply.

  Both fields are arrays the sender picks from at random, and both are read by
  people who see several of our replies in a row — the same words under every
  comment is what a spam filter is looking for. So the sets below are written
  to differ in wording, not only in punctuation.

  The five Direct variants split into two groups on purpose. Three of them say
  nothing about the channel and promise the catalogue outright; two name the
  subscription as a step on the way to it. Which group converts better is a
  question about this audience that only running both can answer.

  One caveat worth writing down: `button_text` is a single column, so every
  variant ships the same button. The wording chosen below is the one that fits
  under all five — it names both halves of the offer, the catalogue and the
  test, without contradicting a variant that leads with either.
*/

UPDATE lead_magnets magnet
SET
  direct_reply_variants = ARRAY[
    E'Забирай 1000+ готовых промптов для генерации картинок в нейросетях!\n\nВнутри — формулы под рекламу, людей, предметку и свет. Главное: там же ты сможешь сразу протестировать любой промпт и забрать результат за пару кликов.\n\nЖми кнопку ниже 👇',
    E'Хватит мучиться с генерацией картинок в нейросетях.\n\nЯ собрал 1000+ готовых промптов для идеального визуала (свет, ракурсы, стили) и настроил место, где ты сразу протестируешь их в один клик без танцев с бубном.\n\nЗабирай доступ 👇',
    E'Твой чит-код для сочного визуала в нейросетях!\n\nВ базе — 1000+ промптов для генерации фото, товаров и рекламы. Копируешь готовый текст, там же сразу запускаешь генерацию и получаешь топ-кадр за 60 секунд.\n\nЖми кнопку 👇',
    E'Лови 1000+ промптов для визуала в нейросетях!\n\nВнутри — формулы для картинок и место для их мгновенного теста. Схема: жми кнопку, подпишись на мой канал с AI-разборами — и бот моментально выдаст доступ к базе.\n\nЗабирай по кнопке 👇',
    E'Делай студийные картинки в нейросетях с 1-й попытки!\n\nЯ упаковал 1000+ промптов для сочного визуала и подключил движок для быстрого теста. Подпишись на канал — и бот сразу пришлет базу и откроет генерации.\n\nЖми кнопку ниже 👇'
  ],
  /* The fallback for a rule whose variants are all blank. Kept in step with
     the list above so a cleared array cannot resurrect last month's promise. */
  reply_text = E'Забирай 1000+ готовых промптов для генерации картинок в нейросетях!\n\nВнутри — формулы под рекламу, людей, предметку и свет. Главное: там же ты сможешь сразу протестировать любой промпт и забрать результат за пару кликов.\n\nЖми кнопку ниже 👇',
  button_text = 'Забрать базу и тест',
  public_reply_variants = ARRAY[
    'Отправил в Direct! Если не видишь — проверь вкладку "Запросы", Инста часто туда прячет 📩',
    'Закинул в личку! Лови. Если уведомление не пришло — глянь в скрытых запросах или спаме 🤝',
    'Уже скинул! Проверяй Direct (и папку "Запросы", если во входящих пусто) 🔥',
    'Материал уже у тебя в личке! Забирай. Если не всплыло — 100% упало в запросы 🚀',
    'Лови в директе! Обязательно проверь скрытые сообщения, Инстаграм любит туда спамить 👀',
    'Отправил! Если в основных нет — посмотри в запросах на переписку, всё там 📨'
  ],
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
