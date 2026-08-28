import { defineConfig } from 'vitest/config';

/*
  Unit tests for the pure logic the funnel depends on.

  `supabase/functions` is excluded from tsconfig because those files run under
  Deno, but the modules tested here are deliberately dependency-free — no Deno
  APIs, no imports at all — so they load in Node exactly as they do in the Edge
  runtime. That is the point: the browser, the worker and these tests all read
  the same source.
*/
export default defineConfig({
  test: {
    /*
      `lib/supabase.ts` создаёт клиент на верхнем уровне модуля, и
      `createClient` падает на пустом URL прямо при импорте. Тестам здесь не
      нужен ни один запрос — но `scheduleUtils` и `telegramService` тянут этот
      модуль транзитивно, и без переменных весь прогон обрывался с
      «supabaseUrl is required».

      Локально этого не видно: Vite подхватывает .env.local. В CI файла нет,
      поэтому падало только там — и не падало нигде до первого запуска
      workflow, который срабатывает лишь на main и на pull request.

      Значения заведомо нерабочие: тест, который попробует сходить в сеть,
      должен сломаться громко, а не тихо постучаться в чужой проект.
    */
    env: {
      VITE_SUPABASE_URL: 'http://supabase.invalid',
      VITE_SUPABASE_ANON_KEY: 'anon-key-for-tests',
    },
    include: [
      'supabase/functions/_shared/**/*.test.ts',
      'hooks/**/*.test.ts',
      'services/**/*.test.ts',
      'utils/**/*.test.ts',
    ],
    environment: 'node',
  },
});
