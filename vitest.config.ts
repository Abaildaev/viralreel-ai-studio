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
    include: [
      'supabase/functions/_shared/**/*.test.ts',
      'hooks/**/*.test.ts',
      'utils/**/*.test.ts',
    ],
    environment: 'node',
  },
});
