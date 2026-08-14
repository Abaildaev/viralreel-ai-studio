#!/usr/bin/env node
/*
 * supabase/full_schema.sql is a convenience bootstrap for pasting into the
 * Supabase SQL editor when the CLI is not available. It used to be maintained
 * by hand next to the migrations and silently drifted from them, so it is now
 * generated from supabase/migrations/ instead.
 *
 *   node scripts/build-full-schema.mjs           regenerate the file
 *   node scripts/build-full-schema.mjs --check   fail if it is out of date
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(projectRoot, 'supabase', 'migrations');
const outputPath = join(projectRoot, 'supabase', 'full_schema.sql');
const separator = '-'.repeat(72);

const header = `/*
  GENERATED FILE — DO NOT EDIT BY HAND.

  Every migration in supabase/migrations/, concatenated in timestamp order, for
  bootstrapping a fresh database from the Supabase SQL editor. Prefer
  \`npx supabase db push\`; use this file only when the CLI is unavailable.

  After adding a migration run:  npm run schema:build
  \`npm test\` fails while this file is out of date.
*/
`;

function buildSchema() {
  const migrations = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();

  if (migrations.length === 0) {
    throw new Error(`No migrations found in ${migrationsDir}`);
  }

  const sections = migrations.map(name => {
    const body = readFileSync(join(migrationsDir, name), 'utf8').trimEnd();
    return `-- ${separator}\n-- ${name}\n-- ${separator}\n\n${body}\n`;
  });

  return `${header}\n${sections.join('\n')}`;
}

const schema = buildSchema();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outputPath, 'utf8');
  } catch {
    /* treated as out of date below */
  }

  if (current !== schema) {
    console.error(
      'supabase/full_schema.sql is out of date with supabase/migrations/.\n' +
      'Run `npm run schema:build` and commit the result.',
    );
    process.exit(1);
  }

  console.log('supabase/full_schema.sql is up to date.');
} else {
  writeFileSync(outputPath, schema);
  console.log(`Wrote ${outputPath}`);
}
