# ViralReel AI Studio

Открытый учебный проект для генерации, рендера и планирования Instagram Reels. Использует React, Vite, Supabase и пользовательский ключ DeepSeek (BYOK).

Каждый студент разворачивает **свой** Supabase-проект и добавляет **свои** ключи. В репозитории нет рабочих токенов, аккаунтов или доступа к чужому проекту.

## Возможности

- обычный генератор хуков и описаний;
- AI Showcase с разными визуальными композициями;
- Budget Reels и пакетная генерация;
- визуальная и аудио-уникализация при рендере;
- черновики, планировщик и публикация через Instagram Graph API;
- Supabase Edge Functions для публикации и обслуживания.

## Быстрый запуск

Требуются Node.js 20+, npm и аккаунт в [Supabase](https://supabase.com).

```bash
git clone https://github.com/Abaildaev/viralreel-ai-studio.git
cd viralreel-ai-studio
npm ci
cp .env.example .env.local
```

В `.env.local` укажите URL и anon key **вашего** Supabase-проекта. Их можно взять в Supabase Dashboard → Project Settings → API.

```bash
npm run dev
```

Приложение откроется на `http://localhost:3000`.

## Развертывание Supabase

1. Установите Supabase CLI и войдите в аккаунт:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

2. Примените схему и миграции:

   ```bash
   npx supabase db push
   ```

3. Разверните Edge Functions:

   ```bash
   npx supabase functions deploy auto-publish publish-reels publish-telegram verify-instagram-token check-tokens cleanup-storage connect-instagram-account instagram-webhook list-instagram-media subscribe-instagram-webhooks test-automation meta-legal
   ```

4. Для cron-задач создайте случайный секрет и выполните в SQL Editor:

   ```sql
   alter database postgres set app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
   alter database postgres set app.settings.cron_secret = 'YOUR_LONG_RANDOM_SECRET';
   ```

   Затем добавьте этот же секрет в Edge Functions:

   ```bash
   npx supabase secrets set CRON_SECRET=YOUR_LONG_RANDOM_SECRET
   ```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` и `SUPABASE_SERVICE_ROLE_KEY` доступны Edge Functions в среде Supabase. Никогда не добавляйте service role key в `.env.local` или в клиентский код.

## Настройка ключей и публикации

- Ключ DeepSeek вводится пользователем в разделе «Настройки» — он не хранится в репозитории. Этот ключ используется только браузером: генератором и симулятором ИИ-продавца.
- **Чтобы ИИ-продавец отвечал в реальном Direct**, тот же ключ нужно отдельно положить в секреты Edge Functions — браузерный ключ серверу недоступен и не должен быть:

  ```bash
  npx supabase secrets set DEEPSEEK_API_KEY=sk-...
  ```

  Без этого секрета агент останется песочницей: вебхук просто не отправит ответ и запишет причину в журнал событий. Сам агент дополнительно выключен по умолчанию — включается галочкой на вкладке «ИИ Продавец».
- Для публикации нужно подключить собственный Instagram Professional account и настроить приложение Meta.
- До подключения Meta можно пользоваться генерацией, рендером, черновиками и планировщиком.
- Для передачи проекта новому клиенту приложите к новой ИИ-сессии файл [`public/CLIENT_AI_SETUP_PROMPT_RU.md`](public/CLIENT_AI_SETUP_PROMPT_RU.md). Он требует создать отдельные клиентские Supabase и Meta App и не переносит секреты текущего владельца.

## Известные незавершённые места

- **Публикация в Telegram настраивается, но не выполняется.** В «Настройках» можно ввести токен бота и Chat ID, кнопка «Проверить подключение» работает (она обращается к Telegram напрямую), и функция `publish-telegram` развёрнута. Но её никто не вызывает: ни фронтенд, ни cron. Пока не появится вызов, посты в канал уходить не будут.

## Проверка проекта

```bash
npm test
npm test --prefix video-renderer
```

`npm test` — это проверка типов, сверка `supabase/full_schema.sql` с миграциями и сборка.

`supabase/full_schema.sql` генерируется из `supabase/migrations/` и нужен только для ручного bootstrap через SQL Editor, когда недоступен CLI. Руками его не правят — после добавления миграции выполните:

```bash
npm run schema:build
```

## Лицензия

MIT
