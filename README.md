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
   npx supabase functions deploy auto-publish publish-reels publish-telegram verify-instagram-token check-tokens cleanup-storage
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

- Ключ DeepSeek вводится пользователем в разделе «Настройки» — он не хранится в репозитории.
- Для публикации нужно подключить собственный Instagram Professional account и настроить приложение Meta.
- До подключения Meta можно пользоваться генерацией, рендером, черновиками и планировщиком.

## Проверка проекта

```bash
npm test
npm test --prefix video-renderer
```

## Лицензия

MIT
