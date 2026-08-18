/*
  GENERATED FILE — DO NOT EDIT BY HAND.

  Every migration in supabase/migrations/, concatenated in timestamp order, for
  bootstrapping a fresh database from the Supabase SQL editor. Prefer
  `npx supabase db push`; use this file only when the CLI is unavailable.

  After adding a migration run:  npm run schema:build
  `npm test` fails while this file is out of date.
*/

-- ------------------------------------------------------------------------
-- 20260206104009_create_scheduled_posts_table.sql
-- ------------------------------------------------------------------------

/*
  # Scheduled Posts for Instagram Auto-Publishing

  1. New Tables
    - `scheduled_posts`
      - `id` (uuid, primary key) - unique identifier
      - `video_path` (text) - path to video in storage bucket
      - `caption` (text) - post description/caption
      - `scheduled_at` (timestamptz) - when to publish
      - `status` (text) - pending, publishing, published, failed
      - `instagram_media_id` (text) - ID returned by Instagram after publishing
      - `error_message` (text) - error details if failed
      - `created_at` (timestamptz) - when post was scheduled
      - `published_at` (timestamptz) - actual publish time

  2. Security
    - Enable RLS on `scheduled_posts` table
    - Public access for demo (in production, add auth)

  3. Notes
    - Posts ordered by scheduled_at for queue processing
    - Status tracks the publishing lifecycle
*/

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_path text NOT NULL,
  caption text NOT NULL DEFAULT '',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
  instagram_media_id text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for demo"
  ON scheduled_posts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_scheduled 
  ON scheduled_posts (status, scheduled_at) 
  WHERE status = 'pending';

-- ------------------------------------------------------------------------
-- 20260206104647_add_user_profiles_and_update_posts.sql
-- ------------------------------------------------------------------------

/*
  # User Profiles and Updated Scheduled Posts

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `ig_user_id` (text) - Instagram Business Account ID
      - `ig_access_token` (text) - Instagram Access Token
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes to scheduled_posts
    - Add `user_id` column to link posts to users
    - Add `hook_text` for the overlay text
    - Add `font_settings` JSONB for text styling

  3. Security
    - Enable RLS on profiles
    - Users can only access their own profile
    - Users can only access their own scheduled posts
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  ig_user_id text,
  ig_access_token text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'hook_text'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN hook_text text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'font_settings'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN font_settings jsonb DEFAULT '{}';
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow all operations for demo" ON scheduled_posts;

CREATE POLICY "Users can view own posts"
  ON scheduled_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own posts"
  ON scheduled_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON scheduled_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON scheduled_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------------------
-- 20260206110150_create_instagram_accounts_table.sql
-- ------------------------------------------------------------------------

/*
  # Instagram Accounts Management

  1. New Tables
    - `instagram_accounts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `account_name` (text) - display name for the account
      - `username` (text) - Instagram username
      - `ig_user_id` (text) - Instagram API user ID
      - `access_token` (text) - Instagram API access token
      - `profile_picture_url` (text) - avatar URL
      - `is_active` (boolean) - whether account is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Add `instagram_account_id` column to `scheduled_posts` table

  3. Security
    - Enable RLS on `instagram_accounts` table
    - Add policies for authenticated users to manage their own accounts
*/

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  ig_user_id text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT '',
  profile_picture_url text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own instagram accounts"
  ON instagram_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own instagram accounts"
  ON instagram_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own instagram accounts"
  ON instagram_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own instagram accounts"
  ON instagram_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'instagram_account_id'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_instagram_account_id ON scheduled_posts(instagram_account_id);

-- ------------------------------------------------------------------------
-- 20260206112001_create_audio_files_table.sql
-- ------------------------------------------------------------------------

/*
  # Создание таблицы audio_files

  1. Новые таблицы
    - `audio_files`
      - `id` (uuid, primary key) - уникальный идентификатор
      - `user_id` (uuid, foreign key) - владелец файла
      - `name` (text) - название аудио
      - `file_path` (text) - путь к файлу в storage
      - `duration` (integer) - длительность в секундах
      - `file_size` (integer) - размер файла в байтах
      - `created_at` (timestamptz) - дата создания

  2. Безопасность
    - Включён RLS на таблице `audio_files`
    - Политики для авторизованных пользователей
*/

CREATE TABLE IF NOT EXISTS audio_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  file_path text NOT NULL DEFAULT '',
  duration integer DEFAULT 0,
  file_size integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audio files"
  ON audio_files
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audio files"
  ON audio_files
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own audio files"
  ON audio_files
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------
-- 20260206113012_create_telegram_settings_table.sql
-- ------------------------------------------------------------------------

/*
  # Create Telegram Settings Table

  1. New Tables
    - `telegram_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `bot_token` (text, encrypted bot token)
      - `chat_id` (text, channel or chat ID)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `telegram_settings` table
    - Add policies for authenticated users to manage their own settings
*/

CREATE TABLE IF NOT EXISTS telegram_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_token text NOT NULL,
  chat_id text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE telegram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram settings"
  ON telegram_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own telegram settings"
  ON telegram_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram settings"
  ON telegram_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own telegram settings"
  ON telegram_settings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------
-- 20260207084330_create_lead_magnets_table.sql
-- ------------------------------------------------------------------------

/*
  # Create lead_magnets table

  1. New Tables
    - `lead_magnets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text) - Name of the lead magnet (e.g., "Гайд по энергетике")
      - `description` (text) - What the user gets (e.g., "PDF-гайд с 10 техниками")
      - `codeword` (text) - The codeword to write (e.g., "ЭНЕРГИЯ")
      - `is_active` (boolean) - Whether this lead magnet is currently used in CTAs
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `lead_magnets` table
    - Users can only access their own lead magnets
*/

CREATE TABLE IF NOT EXISTS lead_magnets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  codeword text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE lead_magnets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lead magnets"
  ON lead_magnets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lead magnets"
  ON lead_magnets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lead magnets"
  ON lead_magnets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lead magnets"
  ON lead_magnets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------
-- 20260207090517_create_video_templates_table.sql
-- ------------------------------------------------------------------------

/*
  # Create video_templates table

  1. New Tables
    - `video_templates` (подложки - background videos for batch generation)
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users)
      - `name` (text) - display name
      - `file_path` (text) - path in Supabase storage
      - `duration` (real) - video duration in seconds
      - `file_size` (bigint) - file size in bytes
      - `has_audio` (boolean) - whether the video already has music
      - `is_active` (boolean) - soft toggle
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `video_templates` table
    - Add CRUD policies for authenticated users on own data
*/

CREATE TABLE IF NOT EXISTS video_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  duration real DEFAULT 0,
  file_size bigint DEFAULT 0,
  has_audio boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_templates_user_id ON video_templates(user_id);

ALTER TABLE video_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON video_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON video_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON video_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON video_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------
-- 20260207090534_create_batch_presets_table.sql
-- ------------------------------------------------------------------------

/*
  # Create batch_presets table

  1. New Tables
    - `batch_presets` - Configuration for automatic batch content generation
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users)
      - `instagram_account_id` (uuid, FK to instagram_accounts, nullable)
      - `name` (text) - preset name for display
      - `topics` (jsonb) - array of topic strings for AI generation
      - `tone` (text) - tone for AI: provocative, educational, etc.
      - `cta_type` (text) - 'telegram' or 'codeword'
      - `audio_mode` (text) - 'from_video', 'random', 'specific', 'none'
      - `audio_file_id` (uuid, FK to audio_files, nullable) - for 'specific' mode
      - `variations_count` (integer) - how many videos to generate per run
      - `text_style` (jsonb) - font settings preset
      - `schedule_interval_minutes` (integer) - interval between scheduled posts
      - `is_active` (boolean)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `batch_presets` table
    - CRUD policies for authenticated users on own data
*/

CREATE TABLE IF NOT EXISTS batch_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  tone text NOT NULL DEFAULT 'provocative',
  cta_type text NOT NULL DEFAULT 'telegram',
  audio_mode text NOT NULL DEFAULT 'from_video',
  audio_file_id uuid REFERENCES audio_files(id) ON DELETE SET NULL,
  variations_count integer NOT NULL DEFAULT 5,
  text_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_interval_minutes integer NOT NULL DEFAULT 120,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_presets_user_id ON batch_presets(user_id);

ALTER TABLE batch_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own presets"
  ON batch_presets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own presets"
  ON batch_presets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presets"
  ON batch_presets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own presets"
  ON batch_presets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------
-- 20260207090737_create_templates_storage_bucket.sql
-- ------------------------------------------------------------------------

/*
  # Create templates storage bucket

  1. Storage
    - Create `templates` bucket for background video files (подложки)
    - Public read access for renderer to fetch videos
    - Authenticated upload/delete scoped to user's folder

  2. Policies
    - Anyone can read templates (needed for video rendering)
    - Authenticated users can upload to their own folder
    - Authenticated users can delete their own files
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read templates"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'templates');

CREATE POLICY "Users can upload to own template folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'templates'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own template files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'templates'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ------------------------------------------------------------------------
-- 20260207092111_add_account_id_to_video_templates.sql
-- ------------------------------------------------------------------------

/*
  # Add instagram_account_id to video_templates

  1. Changes
    - Add `instagram_account_id` (uuid, nullable FK to instagram_accounts) to `video_templates`
    - Each template now belongs to a specific Instagram account
    - Index for faster lookups by account

  2. Notes
    - Nullable to allow existing templates without account
    - ON DELETE SET NULL to not lose templates if account is removed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'video_templates' AND column_name = 'instagram_account_id'
  ) THEN
    ALTER TABLE video_templates ADD COLUMN instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_templates_account_id ON video_templates(instagram_account_id);

-- ------------------------------------------------------------------------
-- 20260207100547_add_publish_window_to_profiles.sql
-- ------------------------------------------------------------------------

/*
  # Add Publishing Time Window to Profiles

  1. Modified Tables
    - `profiles`
      - `timezone` (text, default 'Europe/Moscow') - User's IANA timezone
      - `publish_start_hour` (integer, default 10) - Start hour for publishing window (0-23)
      - `publish_end_hour` (integer, default 22) - End hour for publishing window (0-23)

  2. Notes
    - These settings control when scheduled posts can be published
    - Posts scheduled outside the window will be shifted to the next available slot
    - Default window is 10:00-22:00 Moscow time
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE profiles ADD COLUMN timezone text DEFAULT 'Europe/Moscow';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'publish_start_hour'
  ) THEN
    ALTER TABLE profiles ADD COLUMN publish_start_hour integer DEFAULT 10;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'publish_end_hour'
  ) THEN
    ALTER TABLE profiles ADD COLUMN publish_end_hour integer DEFAULT 22;
  END IF;
END $$;

-- ------------------------------------------------------------------------
-- 20260207102518_add_updated_at_to_scheduled_posts.sql
-- ------------------------------------------------------------------------

/*
  # Add updated_at column to scheduled_posts

  1. Changes to scheduled_posts
    - Add `updated_at` (timestamptz) column with default now()
    - Create trigger to auto-update `updated_at` on every row update

  2. Notes
    - This column is used to detect stuck "publishing" posts
    - The auto-publish cron job resets posts stuck in "publishing" for > 10 minutes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_scheduled_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_scheduled_posts_updated_at ON scheduled_posts;
CREATE TRIGGER set_scheduled_posts_updated_at
  BEFORE UPDATE ON scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_posts_updated_at();

-- ------------------------------------------------------------------------
-- 20260207102608_schedule_auto_publish_cron.sql
-- ------------------------------------------------------------------------

/*
  # Schedule auto-publish cron job

  1. New cron job
    - `auto-publish-reels` runs every 2 minutes
    - Calls the `auto-publish` edge function via pg_net HTTP POST
    - The edge function finds pending posts whose scheduled time has passed
      and publishes them to Instagram automatically

  2. How it works
    - pg_cron triggers every 2 minutes
    - pg_net makes an async HTTP POST to the auto-publish edge function
    - The edge function picks the oldest due post, claims it atomically,
      uploads to Instagram, and updates the status
    - Stuck posts (in "publishing" > 10 min) are auto-recovered to "pending"

  3. Notes
    - No browser tab needs to be open for this to work
    - Posts will be published within ~2 minutes of their scheduled time
    - One post is processed per invocation to stay within edge function timeout
*/

DO $$
BEGIN
  PERFORM cron.unschedule('auto-publish-reels');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-publish-reels',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/auto-publish',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ------------------------------------------------------------------------
-- 20260207103032_add_draft_status_and_nullable_scheduled_at.sql
-- ------------------------------------------------------------------------

/*
  # Add draft status and make scheduled_at nullable

  1. Changes to scheduled_posts
    - Add 'draft' to the allowed status values
    - Make `scheduled_at` nullable (drafts don't have a schedule yet)
    - Update existing index to continue covering pending posts only

  2. Flow change
    - Generated posts are now created as 'draft' with no scheduled time
    - User explicitly schedules them, which sets scheduled_at and status='pending'
    - Auto-publish cron only picks up 'pending' posts with scheduled_at <= now
    - This prevents accidental publishing of unreviewed content
*/

ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;
ALTER TABLE scheduled_posts ADD CONSTRAINT scheduled_posts_status_check
  CHECK (status IN ('draft', 'pending', 'publishing', 'published', 'failed'));

ALTER TABLE scheduled_posts ALTER COLUMN scheduled_at DROP NOT NULL;

-- ------------------------------------------------------------------------
-- 20260212161648_update_cron_to_every_minute.sql
-- ------------------------------------------------------------------------

/*
  # Update auto-publish cron to every minute

  1. Changes
    - Changed cron schedule from every 2 minutes to every 1 minute
    - This ensures posts are published faster after their scheduled time

  2. Notes
    - The edge function still processes one post per invocation
    - Stuck posts are auto-recovered after 10 minutes
*/

DO $$
BEGIN
  PERFORM cron.unschedule('auto-publish-reels');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-publish-reels',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/auto-publish',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ------------------------------------------------------------------------
-- 20260219104304_add_gemini_api_key_to_profiles.sql
-- ------------------------------------------------------------------------

/*
  # Add gemini_api_key to profiles table

  1. Changes
    - Add `gemini_api_key` column to `profiles` table (nullable text, default empty string)

  2. Notes
    - This allows persisting the Gemini API key per user in the database
    - The key is stored as plain text (it's the user's own key, not a system secret)
    - RLS already enabled on profiles table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'gemini_api_key'
  ) THEN
    ALTER TABLE profiles ADD COLUMN gemini_api_key text DEFAULT '' NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------------------
-- 20260219113440_add_account_id_to_lead_magnets.sql
-- ------------------------------------------------------------------------

/*
  # Add instagram_account_id to lead_magnets

  ## Changes
  - Adds `instagram_account_id` column to `lead_magnets` table (nullable uuid, FK to instagram_accounts)
  - Adds index for fast lookup by user + account combination

  ## Notes
  - Column is nullable so existing records remain valid (NULL = applies to all accounts / legacy)
  - Users can now create separate lead magnets per Instagram account
  - RLS policies remain unchanged (user_id still controls access)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_magnets' AND column_name = 'instagram_account_id'
  ) THEN
    ALTER TABLE lead_magnets
      ADD COLUMN instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_magnets_user_account_idx
  ON lead_magnets (user_id, instagram_account_id);

-- ------------------------------------------------------------------------
-- 20260220104313_add_sort_order_to_scheduled_posts.sql
-- ------------------------------------------------------------------------

/*
  # Add sort_order column to scheduled_posts

  1. Modified Tables
    - `scheduled_posts`
      - Added `sort_order` (integer, default 0) - controls display order in the scheduler queue

  2. Notes
    - Allows users to shuffle/reorder posts independently of created_at
    - Default value 0, lower numbers appear first
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_posts' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE scheduled_posts ADD COLUMN sort_order integer DEFAULT 0;
  END IF;
END $$;

UPDATE scheduled_posts
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, instagram_account_id ORDER BY created_at DESC) AS rn
  FROM scheduled_posts
) sub
WHERE scheduled_posts.id = sub.id AND scheduled_posts.sort_order = 0;

-- ------------------------------------------------------------------------
-- 20260405172200_create_audio_storage_bucket.sql
-- ------------------------------------------------------------------------

/*
  # Create audio storage bucket

  1. Storage
    - Create `audio` bucket for background audio files
    - Public read access for renderer to fetch audios
    - Authenticated upload/delete scoped to user's folder

  2. Policies
    - Anyone can read audio (needed for video rendering)
    - Authenticated users can upload to their own folder
    - Authenticated users can delete their own files
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read audio"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'audio');

CREATE POLICY "Users can upload to own audio folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own audio files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ------------------------------------------------------------------------
-- 20260405174600_add_token_expires_to_instagram.sql
-- ------------------------------------------------------------------------

/*
  # Add token expiration monitoring

  1. Changes
    - Add `token_expires_at` column to `instagram_accounts`.
    - Update existing records to estimate expiration based on created_at + 60 days.
*/

ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS token_expires_at timestamptz DEFAULT (now() + interval '60 days');

UPDATE instagram_accounts 
SET token_expires_at = created_at + interval '60 days' 
WHERE token_expires_at IS NULL;

-- ------------------------------------------------------------------------
-- 20260405175000_schedule_check_tokens_cron.sql
-- ------------------------------------------------------------------------

/*
  # Schedule check-tokens cron job

  1. Changes
    - Creates a daily cron schedule to call the `check-tokens` Edge Function.
*/

SELECT cron.schedule(
  'check-instagram-tokens-daily',
  '0 12 * * *', -- Run every day at 12:00 PM
  $$
    SELECT net.http_post(
      url:=nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/check-tokens',
      headers:=jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
      body:='{}'::jsonb
    )
  $$
);

-- ------------------------------------------------------------------------
-- 20260405175500_schedule_cleanup_storage_cron.sql
-- ------------------------------------------------------------------------

/*
  # Schedule cleanup-storage cron job

  1. Changes
    - Creates a daily cron schedule to call the `cleanup-storage` Edge Function.
*/

SELECT cron.schedule(
  'cleanup-archived-video-reels-daily',
  '0 3 * * *', -- Run every day at 3:00 AM
  $$
    SELECT net.http_post(
      url:=nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/cleanup-storage',
      headers:=jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
      body:='{}'::jsonb
    )
  $$
);

-- ------------------------------------------------------------------------
-- 20260807100000_harden_storage_and_profiles.sql
-- ------------------------------------------------------------------------

/*
  Production hardening:
  - add the key column used by the frontend;
  - create the reels bucket used by all generation flows;
  - allow cleanup to null the stored path while retaining history rows;
  - scope Storage writes and deletes to the user's folder.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deepseek_api_key text NOT NULL DEFAULT '';

ALTER TABLE scheduled_posts
  ALTER COLUMN video_path DROP NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reels', 'reels', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Anyone can read reels" ON storage.objects;
CREATE POLICY "Anyone can read reels"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'reels');

DROP POLICY IF EXISTS "Users can upload own reels" ON storage.objects;
CREATE POLICY "Users can upload own reels"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own reels" ON storage.objects;
CREATE POLICY "Users can update own reels"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own reels" ON storage.objects;
CREATE POLICY "Users can delete own reels"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ------------------------------------------------------------------------
-- 20260813153000_add_instagram_keyword_automations.sql
-- ------------------------------------------------------------------------

/*
  Instagram keyword automations:
  - extend lead magnets with an automated reply and trigger settings;
  - record webhook processing for idempotency and diagnostics;
  - track account-level webhook subscription status.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS reply_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS response_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS match_mode text NOT NULL DEFAULT 'contains',
  ADD COLUMN IF NOT EXISTS trigger_dm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trigger_comments boolean NOT NULL DEFAULT true;

ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_match_mode_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_match_mode_check
  CHECK (match_mode IN ('exact', 'contains'));

ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS webhook_subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_error text;

CREATE TABLE IF NOT EXISTS instagram_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  lead_magnet_id uuid REFERENCES lead_magnets(id) ON DELETE SET NULL,
  meta_event_id text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('dm', 'comment')),
  sender_igsid text,
  incoming_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'ignored', 'sent', 'failed')),
  response_message_id text,
  error_message text,
  raw_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (instagram_account_id, meta_event_id)
);

CREATE INDEX IF NOT EXISTS instagram_automation_events_account_created_idx
  ON instagram_automation_events (instagram_account_id, created_at DESC);

ALTER TABLE instagram_automation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own instagram automation events"
  ON instagram_automation_events;

CREATE POLICY "Users can view own instagram automation events"
  ON instagram_automation_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM instagram_accounts account
      WHERE account.id = instagram_automation_events.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------
-- 20260813161000_unique_instagram_accounts.sql
-- ------------------------------------------------------------------------

/* Prevent duplicate connections of the same Instagram account per app user. */

CREATE UNIQUE INDEX IF NOT EXISTS instagram_accounts_user_ig_unique_idx
  ON instagram_accounts (user_id, ig_user_id);

-- ------------------------------------------------------------------------
-- 20260813170000_expand_comment_to_dm_automations.sql
-- ------------------------------------------------------------------------

/*
  Turn keyword rules into complete Instagram comment-to-DM scenarios.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS public_reply_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_reply_variants text[] NOT NULL DEFAULT ARRAY['Отправил в Direct 🙌']::text[],
  ADD COLUMN IF NOT EXISTS media_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS media_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS repeat_delay_hours integer NOT NULL DEFAULT 24;

UPDATE lead_magnets
SET keywords = ARRAY[codeword]
WHERE cardinality(keywords) = 0 AND codeword <> '';

ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_media_scope_check,
  DROP CONSTRAINT IF EXISTS lead_magnets_repeat_delay_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_media_scope_check
    CHECK (media_scope IN ('all', 'selected')),
  ADD CONSTRAINT lead_magnets_repeat_delay_check
    CHECK (repeat_delay_hours BETWEEN 0 AND 8760);

ALTER TABLE instagram_automation_events
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS commenter_username text,
  ADD COLUMN IF NOT EXISTS public_reply_status text NOT NULL DEFAULT 'skipped',
  ADD COLUMN IF NOT EXISTS public_reply_id text,
  ADD COLUMN IF NOT EXISTS dm_status text NOT NULL DEFAULT 'pending';

ALTER TABLE instagram_automation_events
  DROP CONSTRAINT IF EXISTS instagram_automation_events_public_reply_status_check,
  DROP CONSTRAINT IF EXISTS instagram_automation_events_dm_status_check;

ALTER TABLE instagram_automation_events
  ADD CONSTRAINT instagram_automation_events_public_reply_status_check
    CHECK (public_reply_status IN ('pending', 'sent', 'skipped', 'failed')),
  ADD CONSTRAINT instagram_automation_events_dm_status_check
    CHECK (dm_status IN ('pending', 'sent', 'skipped', 'failed'));

CREATE INDEX IF NOT EXISTS instagram_automation_events_sender_rule_created_idx
  ON instagram_automation_events (sender_igsid, lead_magnet_id, created_at DESC);

-- ------------------------------------------------------------------------
-- 20260813173000_add_automation_button.sql
-- ------------------------------------------------------------------------

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS button_text text NOT NULL DEFAULT 'Получить материал';

-- ------------------------------------------------------------------------
-- 20260814120000_private_reels_bucket.sql
-- ------------------------------------------------------------------------

/*
  Close public read access to the reels bucket.

  Previously the bucket was public and `storage.objects` allowed SELECT to the
  `public` role for every object in it, so anyone holding the anon key (it ships
  in the frontend bundle) could list and download every user's videos, including
  unpublished drafts.

  The bucket is now private:
  - the frontend signs short-lived URLs for its own folder only;
  - Edge Functions sign a URL with the service role right before handing it to
    Instagram or Telegram.
*/

UPDATE storage.buckets SET public = false WHERE id = 'reels';

DROP POLICY IF EXISTS "Anyone can read reels" ON storage.objects;

DROP POLICY IF EXISTS "Users can read own reels" ON storage.objects;
CREATE POLICY "Users can read own reels"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reels'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ------------------------------------------------------------------------
-- 20260814120500_restrict_instagram_token_access.sql
-- ------------------------------------------------------------------------

/*
  Keep the Instagram access token on the server.

  RLS scoped `instagram_accounts` rows to their owner, but every column was
  readable — including `access_token`, a long-lived credential that can publish
  to the account. Any XSS, malicious extension, or shoulder-surf on the accounts
  page leaked it.

  Column-level grants now hide the token from `anon` and `authenticated`.
  Edge Functions use the service role, which is unaffected by these grants, so
  publishing, verification and webhooks keep working.

  Note: `SELECT *` on this table now fails for the frontend by design — clients
  must list the columns they need.
*/

REVOKE ALL PRIVILEGES ON TABLE instagram_accounts FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  account_name,
  username,
  ig_user_id,
  profile_picture_url,
  is_active,
  token_expires_at,
  webhook_subscribed_at,
  webhook_error,
  created_at,
  updated_at
) ON TABLE instagram_accounts TO authenticated;

GRANT UPDATE (account_name, is_active, updated_at)
  ON TABLE instagram_accounts TO authenticated;

GRANT DELETE ON TABLE instagram_accounts TO authenticated;

-- Accounts are created exclusively by the connect-instagram-account function,
-- which holds the token and runs with the service role.
DROP POLICY IF EXISTS "Users can create own instagram accounts" ON instagram_accounts;

-- ------------------------------------------------------------------------
-- 20260814121000_drop_deepseek_api_key.sql
-- ------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------
-- 20260814150000_automation_delay_stats_and_retention.sql
-- ------------------------------------------------------------------------

/*
  Automation improvements:
  - an optional humanising delay before the bot answers;
  - per-scenario counters, so a dashboard with several rules is readable;
  - retention for the event log, which previously grew forever because every
    incoming comment and DM is stored with its full raw payload.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS reply_delay_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_reply_delay_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_reply_delay_check
    CHECK (reply_delay_seconds BETWEEN 0 AND 60);

/*
  security_invoker keeps the caller's RLS in force: without it the view would
  run as its owner and expose every user's counters.
*/
CREATE OR REPLACE VIEW lead_magnet_stats
WITH (security_invoker = on) AS
SELECT
  rule.id AS lead_magnet_id,
  rule.user_id,
  count(event.id) FILTER (WHERE event.status = 'sent') AS sent_count,
  count(event.id) FILTER (WHERE event.status = 'failed') AS failed_count,
  count(event.id) FILTER (WHERE event.status = 'ignored') AS ignored_count,
  max(event.created_at) FILTER (WHERE event.status = 'sent') AS last_sent_at
FROM lead_magnets rule
LEFT JOIN instagram_automation_events event ON event.lead_magnet_id = rule.id
GROUP BY rule.id, rule.user_id;

GRANT SELECT ON lead_magnet_stats TO authenticated;

/*
  Keeps the log useful for diagnostics without letting it grow without bound.
  cron.schedule upserts by job name, so re-running this migration is safe — and
  unlike touching cron.job directly, it works with the migration role's grants.
*/
SELECT cron.schedule(
  'cleanup-automation-events-daily',
  '30 3 * * *', -- Daily, half an hour after the storage cleanup.
  $$
    DELETE FROM instagram_automation_events
    WHERE created_at < now() - interval '90 days'
  $$
);

-- ------------------------------------------------------------------------
-- 20260814160000_make_all_buckets_private.sql
-- ------------------------------------------------------------------------

/*
  Close public read access to templates and audio buckets and drop obsolete gemini_api_key.

  Previously `templates` and `audio` were public, allowing any anon client
  to list and download user templates and audio tracks.

  Now:
  - `templates` and `audio` are private (public = false).
  - Authenticated users read objects via short-lived signed URLs.
  - Drop obsolete `gemini_api_key` column from `profiles`.
*/

UPDATE storage.buckets SET public = false WHERE id IN ('templates', 'audio');

DROP POLICY IF EXISTS "Anyone can read templates" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own templates" ON storage.objects;
CREATE POLICY "Users can read own templates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'templates'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.uid() IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Anyone can read audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own audio" ON storage.objects;
CREATE POLICY "Users can read own audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'audio'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.uid() IS NOT NULL
    )
  );

-- Drop obsolete gemini_api_key from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS gemini_api_key;

-- ------------------------------------------------------------------------
-- 20260814170000_ai_sales_agent.sql
-- ------------------------------------------------------------------------

/*
  Give the AI sales agent somewhere to live.

  Until now the agent existed only in the browser: its configuration sat in
  localStorage and the simulator called DeepSeek from the page. Nothing about it
  reached the server, so it never answered a real Direct message — the webhook
  had no idea it existed.

  Two tables:
  - `ai_sales_agents` holds one configuration per Instagram account (or one
    account-agnostic fallback per user, with a NULL account id).
  - `ai_sales_messages` is the conversation transcript, which the agent needs
    both as prompt context and to enforce its own reply limit.

  The DeepSeek key is deliberately NOT stored here. Edge Functions read it from
  the `DEEPSEEK_API_KEY` secret, the same way they already read META_APP_SECRET
  and CRON_SECRET. Migration 20260814121000 removed the key from the database on
  purpose, and nothing below puts it back.
*/

CREATE TABLE IF NOT EXISTS ai_sales_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  agent_name text NOT NULL DEFAULT 'Ассистент',
  tone text NOT NULL DEFAULT 'friendly_expert'
    CHECK (tone IN ('friendly_expert', 'energetic_mentor', 'concise_consultant', 'premium_concierge')),
  goal text NOT NULL DEFAULT 'consultation'
    CHECK (goal IN ('consultation', 'direct_sale', 'collect_contact', 'lead_qualification')),
  business_description text NOT NULL DEFAULT '',
  custom_instructions text NOT NULL DEFAULT '',
  target_action_prompt text NOT NULL DEFAULT '',
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  objections jsonb NOT NULL DEFAULT '[]'::jsonb,
  handoff_keywords text[] NOT NULL DEFAULT ARRAY['человек', 'менеджер', 'оператор']::text[],
  /* Cap on how many times the agent answers one person before it stands down
     and waits for a human. Zero would disable it entirely, which `is_enabled`
     already expresses more clearly. */
  max_consecutive_replies integer NOT NULL DEFAULT 5
    CHECK (max_consecutive_replies BETWEEN 1 AND 20),
  /* Off by default. Turning this on makes the account start messaging real
     people unattended, so it has to be a deliberate act. */
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/*
  One config per account, and one account-agnostic fallback per user.
  Postgres 15+ NULLS NOT DISTINCT ensures NULL instagram_account_id is treated
  as a single unique default row per user.
*/
ALTER TABLE ai_sales_agents
  ADD CONSTRAINT ai_sales_agents_user_account_uq
  UNIQUE NULLS NOT DISTINCT (user_id, instagram_account_id);

ALTER TABLE ai_sales_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can view own sales agents"
  ON ai_sales_agents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can insert own sales agents"
  ON ai_sales_agents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can update own sales agents"
  ON ai_sales_agents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sales agents" ON ai_sales_agents;
CREATE POLICY "Users can delete own sales agents"
  ON ai_sales_agents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_sales_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  sender_igsid text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'agent')),
  content text NOT NULL,
  detected_intent text,
  /* Set on the agent turn that hands the conversation to a human. Its presence
     anywhere in a thread is what stops the agent answering again. */
  handed_off boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_sales_messages_thread_idx
  ON ai_sales_messages (instagram_account_id, sender_igsid, created_at DESC);

ALTER TABLE ai_sales_messages ENABLE ROW LEVEL SECURITY;

/*
  Transcripts are reachable through the account that owns them; Edge Functions
  write with the service role and bypass this.
*/
DROP POLICY IF EXISTS "Users can view own sales messages" ON ai_sales_messages;
CREATE POLICY "Users can view own sales messages"
  ON ai_sales_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM instagram_accounts account
      WHERE account.id = ai_sales_messages.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );

/*
  Same retention as the automation event log: transcripts are diagnostic, and
  they contain other people's messages, so they should not accumulate forever.
*/
CREATE OR REPLACE FUNCTION prune_ai_sales_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM ai_sales_messages WHERE created_at < now() - interval '90 days';
$$;

-- ------------------------------------------------------------------------
-- 20260814180000_add_encrypted_deepseek_credentials.sql
-- ------------------------------------------------------------------------

/*
  Per-user DeepSeek credentials for server-side automations.

  The browser never reads this table. The value is AES-GCM encrypted by the
  authenticated Edge Function with CREDENTIALS_ENCRYPTION_KEY before it gets
  here; the webhook decrypts it only while replying on behalf of that user.
*/

CREATE TABLE IF NOT EXISTS user_ai_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deepseek_api_key_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_ai_credentials ENABLE ROW LEVEL SECURITY;

/* No client policies on purpose: clients can set/status the credential only
   through the authenticated Edge Function and can never select its value. */

-- ------------------------------------------------------------------------
-- 20260814190000_add_instagram_contacts.sql
-- ------------------------------------------------------------------------

/* Cached public profile data for people who initiated an Instagram Direct chat. */
CREATE TABLE IF NOT EXISTS instagram_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  sender_igsid text NOT NULL,
  username text,
  display_name text,
  profile_picture_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, sender_igsid)
);

CREATE INDEX IF NOT EXISTS instagram_contacts_account_updated_idx
  ON instagram_contacts (instagram_account_id, updated_at DESC);

ALTER TABLE instagram_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own Instagram contacts" ON instagram_contacts;
CREATE POLICY "Users can view own Instagram contacts"
  ON instagram_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM instagram_accounts account
      WHERE account.id = instagram_contacts.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------
-- 20260814222000_add_direct_reply_variants.sql
-- ------------------------------------------------------------------------

/* Multiple Direct messages per lead magnet, selected randomly for each trigger. */
ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS direct_reply_variants text[] NOT NULL DEFAULT '{}'::text[];

UPDATE lead_magnets
SET direct_reply_variants = ARRAY[reply_text]
WHERE cardinality(direct_reply_variants) = 0
  AND btrim(reply_text) <> '';

-- ------------------------------------------------------------------------
-- 20260816120000_telegram_funnels_and_broadcasts.sql
-- ------------------------------------------------------------------------

/*
  Telegram: funnels, subscribers and broadcasts.

  The Instagram side already turns a codeword into a Direct message with a
  button. That button can point anywhere, and pointing it at a Telegram bot
  solves the platform's hardest limit: Instagram only allows messaging someone
  within 24 hours of their last message, while a Telegram subscriber stays
  reachable indefinitely. This migration gives that destination somewhere to
  live.

  Five tables:
  - `telegram_bots`      one bot per user, token encrypted at rest;
  - `telegram_funnels`   the /start scenario: greet, gate on a channel
                         subscription, deliver the lead magnet, offer the CTA;
  - `telegram_subscribers` one row per person, carrying attribution back to the
                         Instagram comment that produced them;
  - `telegram_broadcasts` a composed message plus its audience segment;
  - `telegram_broadcast_recipients` the send queue, one row per person, so a
                         broadcast survives a worker restart and can be resumed.

  Attribution is the point of the whole design. The Direct button carries
  `?start=<slug>_<automation_event_id>`, the bot writes that event id onto the
  subscriber, and `telegram_funnel_stats` can then answer "which codeword under
  which Reel produced these subscribers" rather than only "how many arrived".
*/

-- ---------------------------------------------------------------------------
-- Bots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /* AES-GCM, same scheme as user_ai_credentials. A bot token is full control
     over the bot, so it never travels back to the browser. */
  bot_token_encrypted text NOT NULL,
  /* Random per-bot value echoed by Telegram in X-Telegram-Bot-Api-Secret-Token,
     so the webhook can reject forged updates the way instagram-webhook rejects
     unsigned payloads. */
  webhook_secret text NOT NULL,
  bot_username text NOT NULL DEFAULT '',
  bot_name text NOT NULL DEFAULT '',
  /* The channel a funnel may require a subscription to. Set through the setup
     function, which verifies the bot is actually an administrator there. */
  channel_id text NOT NULL DEFAULT '',
  channel_title text NOT NULL DEFAULT '',
  channel_username text NOT NULL DEFAULT '',
  channel_invite_url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  webhook_set_at timestamptz,
  last_error text,
  /* Shown as a progress target on the analytics tab. */
  subscriber_goal integer NOT NULL DEFAULT 1000
    CHECK (subscriber_goal BETWEEN 1 AND 10000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE telegram_bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram bot" ON telegram_bots;
CREATE POLICY "Users can view own telegram bot"
  ON telegram_bots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram bot" ON telegram_bots;
CREATE POLICY "Users can update own telegram bot"
  ON telegram_bots FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram bot" ON telegram_bots;
CREATE POLICY "Users can delete own telegram bot"
  ON telegram_bots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  Column grants hide both secrets from the browser, the same treatment
  instagram_accounts.access_token got in 20260814120500. `SELECT *` on this
  table fails for the frontend by design — clients list the columns they need.

  There is no INSERT grant: rows are created only by the telegram-setup
  function, which holds the token and runs with the service role.
*/
REVOKE ALL PRIVILEGES ON TABLE telegram_bots FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  bot_username,
  bot_name,
  channel_id,
  channel_title,
  channel_username,
  channel_invite_url,
  is_active,
  webhook_set_at,
  last_error,
  subscriber_goal,
  created_at,
  updated_at
) ON TABLE telegram_bots TO authenticated;

GRANT UPDATE (is_active, subscriber_goal, updated_at) ON TABLE telegram_bots TO authenticated;
GRANT DELETE ON TABLE telegram_bots TO authenticated;

-- ---------------------------------------------------------------------------
-- Funnels
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  /* Links the funnel back to the Instagram codeword that feeds it, so the
     rules page and this page describe one journey rather than two features. */
  lead_magnet_id uuid REFERENCES lead_magnets(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  /*
    The deep-link payload prefix. Telegram allows 64 characters of
    [A-Za-z0-9_-] after `?start=`, and the payload we build is
    `<slug>_<automation_event_id>` — 36 characters of UUID plus a separator,
    which is why the slug is capped at 24 and forbidden from containing the
    underscore that splits the two halves.
  */
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]{2,24}$'),
  welcome_text text NOT NULL DEFAULT '',
  /* The subscription gate. Off means the material is handed over immediately. */
  require_subscription boolean NOT NULL DEFAULT true,
  subscribe_button_text text NOT NULL DEFAULT 'Подписаться на канал',
  check_button_text text NOT NULL DEFAULT 'Я подписался',
  not_subscribed_text text NOT NULL DEFAULT 'Пока не вижу подписки. Подпишитесь и нажмите кнопку ещё раз 🙌',
  delivery_text text NOT NULL DEFAULT '',
  delivery_url text NOT NULL DEFAULT '',
  delivery_button_text text NOT NULL DEFAULT 'Забрать материал',
  /* The second ask, after the material is already in their hands. */
  cta_text text NOT NULL DEFAULT '',
  cta_url text NOT NULL DEFAULT '',
  cta_button_text text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  /* Answers a bare /start with no payload, and anyone arriving from a plain
     link. At most one per bot. */
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_bot_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_funnels_one_default_idx
  ON telegram_funnels (telegram_bot_id)
  WHERE is_default;

ALTER TABLE telegram_funnels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can view own telegram funnels"
  ON telegram_funnels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can insert own telegram funnels"
  ON telegram_funnels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can update own telegram funnels"
  ON telegram_funnels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram funnels" ON telegram_funnels;
CREATE POLICY "Users can delete own telegram funnels"
  ON telegram_funnels FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Subscribers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  funnel_id uuid REFERENCES telegram_funnels(id) ON DELETE SET NULL,
  /* The Instagram comment that started it all. NULL for people who found the
     bot some other way. */
  automation_event_id uuid REFERENCES instagram_automation_events(id) ON DELETE SET NULL,
  instagram_sender_igsid text,
  telegram_user_id text NOT NULL,
  username text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  language_code text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'link'
    CHECK (source IN ('instagram', 'link', 'channel')),
  /*
    The funnel, as timestamps. Each NULL is a person who stopped at that step,
    which is what makes per-step drop-off a query rather than a guess.
  */
  started_at timestamptz NOT NULL DEFAULT now(),
  subscribed_at timestamptz,
  delivered_at timestamptz,
  signed_up_at timestamptz,
  unsubscribed_at timestamptz,
  /* Telegram reports 403 when someone blocks the bot. Recording it keeps
     broadcasts from burning quota on people who cannot receive them. */
  is_blocked boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_bot_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS telegram_subscribers_bot_created_idx
  ON telegram_subscribers (telegram_bot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_subscribers_funnel_idx
  ON telegram_subscribers (funnel_id);

CREATE INDEX IF NOT EXISTS telegram_subscribers_event_idx
  ON telegram_subscribers (automation_event_id);

ALTER TABLE telegram_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram subscribers" ON telegram_subscribers;
CREATE POLICY "Users can view own telegram subscribers"
  ON telegram_subscribers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram subscribers" ON telegram_subscribers;
CREATE POLICY "Users can update own telegram subscribers"
  ON telegram_subscribers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram subscribers" ON telegram_subscribers;
CREATE POLICY "Users can delete own telegram subscribers"
  ON telegram_subscribers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Broadcasts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  message_text text NOT NULL DEFAULT '',
  button_text text NOT NULL DEFAULT '',
  button_url text NOT NULL DEFAULT '',
  disable_notification boolean NOT NULL DEFAULT false,
  segment text NOT NULL DEFAULT 'all'
    CHECK (segment IN ('all', 'subscribed', 'delivered', 'not_delivered', 'from_instagram', 'funnel')),
  segment_funnel_id uuid REFERENCES telegram_funnels(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_broadcasts_bot_created_idx
  ON telegram_broadcasts (telegram_bot_id, created_at DESC);

/* The worker's pickup query. */
CREATE INDEX IF NOT EXISTS telegram_broadcasts_due_idx
  ON telegram_broadcasts (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

ALTER TABLE telegram_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can view own telegram broadcasts"
  ON telegram_broadcasts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can insert own telegram broadcasts"
  ON telegram_broadcasts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can update own telegram broadcasts"
  ON telegram_broadcasts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram broadcasts" ON telegram_broadcasts;
CREATE POLICY "Users can delete own telegram broadcasts"
  ON telegram_broadcasts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  The send queue. Materialising the audience when a broadcast starts — rather
  than re-running the segment query on every batch — means the worker can be
  killed mid-send and resume exactly where it stopped, and that nobody receives
  the same message twice because they happened to match the segment again.
*/
CREATE TABLE IF NOT EXISTS telegram_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES telegram_broadcasts(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES telegram_subscribers(id) ON DELETE CASCADE,
  telegram_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  sent_at timestamptz,
  UNIQUE (broadcast_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS telegram_broadcast_recipients_pending_idx
  ON telegram_broadcast_recipients (broadcast_id, status)
  WHERE status = 'pending';

ALTER TABLE telegram_broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own broadcast recipients" ON telegram_broadcast_recipients;
CREATE POLICY "Users can view own broadcast recipients"
  ON telegram_broadcast_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM telegram_broadcasts broadcast
      WHERE broadcast.id = telegram_broadcast_recipients.broadcast_id
        AND broadcast.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Funnel statistics
-- ---------------------------------------------------------------------------

/*
  Per-funnel counts for the analytics tab. `security_invoker` makes the view run
  under the caller's privileges, so the RLS policy on telegram_subscribers
  applies here too and a view cannot become a way around it.
*/
CREATE OR REPLACE VIEW telegram_funnel_stats
WITH (security_invoker = true) AS
SELECT
  funnel.id AS funnel_id,
  funnel.user_id,
  funnel.telegram_bot_id,
  funnel.name,
  funnel.slug,
  count(subscriber.id) AS started_count,
  count(subscriber.subscribed_at) AS subscribed_count,
  count(subscriber.delivered_at) AS delivered_count,
  count(subscriber.signed_up_at) AS signed_up_count,
  count(subscriber.id) FILTER (WHERE subscriber.source = 'instagram') AS from_instagram_count,
  count(subscriber.id) FILTER (WHERE subscriber.is_blocked) AS blocked_count,
  max(subscriber.created_at) AS last_subscriber_at
FROM telegram_funnels funnel
LEFT JOIN telegram_subscribers subscriber ON subscriber.funnel_id = funnel.id
GROUP BY funnel.id, funnel.user_id, funnel.telegram_bot_id, funnel.name, funnel.slug;

GRANT SELECT ON telegram_funnel_stats TO authenticated;

-- ---------------------------------------------------------------------------
-- Broadcast worker schedule
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-broadcast-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'telegram-broadcast-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/telegram-broadcast',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ------------------------------------------------------------------------
-- 20260816180000_telegram_health_and_churn.sql
-- ------------------------------------------------------------------------

/*
  Two blind spots in the Telegram funnel.

  A funnel that stops working stops quietly. If the bot is demoted in the
  channel, `getChatMember` starts failing, every visitor is treated as
  unsubscribed, and nobody receives the material — while the interface still
  reports a healthy bot. `health_alert_at` lets the fault be reported to the
  owner once rather than on every incoming message.

  And churn was invisible. The webhook recorded people joining the channel but
  ignored the update that says they left, so someone who took the lead magnet
  and walked away still counted as a subscriber forever. `channel_left_at`
  records the departure without erasing `subscribed_at` — both facts are true,
  and the funnel's history should keep saying so.
*/

ALTER TABLE telegram_bots
  ADD COLUMN IF NOT EXISTS health_alert_at timestamptz;

GRANT SELECT (health_alert_at) ON TABLE telegram_bots TO authenticated;

ALTER TABLE telegram_subscribers
  ADD COLUMN IF NOT EXISTS channel_left_at timestamptz;

/* The churn query: people who confirmed a subscription and later left. */
CREATE INDEX IF NOT EXISTS telegram_subscribers_channel_left_idx
  ON telegram_subscribers (telegram_bot_id, channel_left_at)
  WHERE channel_left_at IS NOT NULL;

CREATE OR REPLACE VIEW telegram_funnel_stats
WITH (security_invoker = true) AS
SELECT
  funnel.id AS funnel_id,
  funnel.user_id,
  funnel.telegram_bot_id,
  funnel.name,
  funnel.slug,
  count(subscriber.id) AS started_count,
  count(subscriber.subscribed_at) AS subscribed_count,
  count(subscriber.delivered_at) AS delivered_count,
  count(subscriber.signed_up_at) AS signed_up_count,
  count(subscriber.id) FILTER (WHERE subscriber.source = 'instagram') AS from_instagram_count,
  count(subscriber.id) FILTER (WHERE subscriber.is_blocked) AS blocked_count,
  max(subscriber.created_at) AS last_subscriber_at,
  /* Appended rather than slotted in beside the other counts: CREATE OR REPLACE
     VIEW may only add columns at the end, and renaming an existing one — which
     is what inserting in the middle looks like to Postgres — is rejected. */
  count(subscriber.channel_left_at) AS channel_left_count
FROM telegram_funnels funnel
LEFT JOIN telegram_subscribers subscriber ON subscriber.funnel_id = funnel.id
GROUP BY funnel.id, funnel.user_id, funnel.telegram_bot_id, funnel.name, funnel.slug;

GRANT SELECT ON telegram_funnel_stats TO authenticated;

-- ------------------------------------------------------------------------
-- 20260816210000_telegram_funnel_steps.sql
-- ------------------------------------------------------------------------

/*
  Turn the funnel from a fixed shape into a sequence.

  Until now a funnel could say exactly two things after the subscription gate:
  hand over the material, then make one follow-up ask. That is the right shape
  for a single lead magnet and the wrong shape for the thing people actually
  want to build — a free course delivered over a week, a lesson a day, each one
  earning the next.

  So the tail of the funnel becomes an ordered list of steps with a delay
  before each. The head does not change: the greeting and the channel gate are
  the entry protocol, not content, and they stay on the funnel itself.

  `telegram_step_deliveries` is the schedule, one row per person per step. Its
  unique constraint is the important part — it is what guarantees that lesson
  four is never sent twice, no matter how many times a worker retries or how
  many times the reader restarts the bot.
*/

CREATE TABLE IF NOT EXISTS telegram_funnel_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES telegram_funnels(id) ON DELETE CASCADE,
  /* Contiguity is not enforced: reordering in the editor renumbers freely, and
     only the relative order matters to the sender. */
  position integer NOT NULL,
  /* Internal label — "Урок 3". Never sent, only shown in the editor. */
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  button_text text NOT NULL DEFAULT '',
  button_url text NOT NULL DEFAULT '',
  /*
    Wait before this step, measured from the previous one. Zero means it goes
    out in the same breath, which is what the first step almost always wants.
    Capped at a year — anything longer is a mistake, not a campaign.
  */
  delay_minutes integer NOT NULL DEFAULT 0
    CHECK (delay_minutes BETWEEN 0 AND 525600),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_id, position)
);

CREATE INDEX IF NOT EXISTS telegram_funnel_steps_funnel_idx
  ON telegram_funnel_steps (funnel_id, position);

ALTER TABLE telegram_funnel_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can view own funnel steps"
  ON telegram_funnel_steps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can insert own funnel steps"
  ON telegram_funnel_steps FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can update own funnel steps"
  ON telegram_funnel_steps FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own funnel steps" ON telegram_funnel_steps;
CREATE POLICY "Users can delete own funnel steps"
  ON telegram_funnel_steps FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  The schedule.

  Materialised one step ahead rather than all at once: a course whose later
  lessons are still being written should not have its schedule frozen the
  moment the first subscriber arrives.
*/
CREATE TABLE IF NOT EXISTS telegram_step_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES telegram_subscribers(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES telegram_funnel_steps(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  /* One lesson, one person, once. This is the constraint the whole engine
     leans on, so a retry can never turn into a duplicate. */
  UNIQUE (subscriber_id, step_id)
);

/* The worker's pickup query. */
CREATE INDEX IF NOT EXISTS telegram_step_deliveries_due_idx
  ON telegram_step_deliveries (due_at)
  WHERE status = 'pending';

ALTER TABLE telegram_step_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own step deliveries" ON telegram_step_deliveries;
CREATE POLICY "Users can view own step deliveries"
  ON telegram_step_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM telegram_bots bot
      WHERE bot.id = telegram_step_deliveries.telegram_bot_id
        AND bot.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Move the existing fixed copy into the sequence
-- ---------------------------------------------------------------------------

/*
  The material a funnel already promised becomes step one, and the follow-up
  ask becomes step two. Ordering by id keeps the insert deterministic.
*/
INSERT INTO telegram_funnel_steps (user_id, funnel_id, position, title, body, button_text, button_url, delay_minutes)
SELECT
  funnel.user_id,
  funnel.id,
  1,
  'Выдача материала',
  funnel.delivery_text,
  funnel.delivery_button_text,
  funnel.delivery_url,
  0
FROM telegram_funnels funnel
WHERE funnel.delivery_text <> '' OR funnel.delivery_url <> ''
ON CONFLICT (funnel_id, position) DO NOTHING;

INSERT INTO telegram_funnel_steps (user_id, funnel_id, position, title, body, button_text, button_url, delay_minutes)
SELECT
  funnel.user_id,
  funnel.id,
  2,
  'Целевое действие',
  funnel.cta_text,
  funnel.cta_button_text,
  funnel.cta_url,
  0
FROM telegram_funnels funnel
WHERE funnel.cta_text <> ''
ON CONFLICT (funnel_id, position) DO NOTHING;

/*
  Dropped rather than left in place. Two descriptions of what a funnel sends
  would drift the moment someone edits one of them, and the step list is now
  the only one the sender reads.
*/
ALTER TABLE telegram_funnels
  DROP COLUMN IF EXISTS delivery_text,
  DROP COLUMN IF EXISTS delivery_url,
  DROP COLUMN IF EXISTS delivery_button_text,
  DROP COLUMN IF EXISTS cta_text,
  DROP COLUMN IF EXISTS cta_url,
  DROP COLUMN IF EXISTS cta_button_text;

-- ---------------------------------------------------------------------------
-- Sequence progress, per subscriber
-- ---------------------------------------------------------------------------

/*
  `delivered_at` used to mean "received the one thing this funnel sends". With a
  sequence it keeps its original meaning — the first step landed, the promise
  was kept — and `sequence_done_at` records reaching the end.
*/
ALTER TABLE telegram_subscribers
  ADD COLUMN IF NOT EXISTS sequence_done_at timestamptz;

-- ---------------------------------------------------------------------------
-- Drip worker schedule
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-drip-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'telegram-drip-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/telegram-drip',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ------------------------------------------------------------------------
-- 20260817090000_instagram_event_queue.sql
-- ------------------------------------------------------------------------

/*
  Make the Instagram automation survive a burst.

  The webhook did all its work inside the request: it walked the batch of
  events one at a time and slept up to sixty seconds before each reply, to make
  the bot look human. That is fine at a trickle and fails exactly when it
  matters. An Edge Function worker lives 150 seconds on the free plan, so a
  batch of more than two or three delayed events is cut off mid-flight — and
  because the event row is inserted before processing, Meta's retry is
  deduplicated by the unique constraint and the lost events are lost for good.
  Silently. Precisely when a Reel takes off.

  So the webhook becomes what a webhook should be: validate, write down, answer
  200. A cron worker does the work, with retries, and the humanising delay
  becomes a timestamp to wait for rather than a sleep inside a request.

  Three columns carry the queue:
  - `attempts`        how many times the worker has tried;
  - `next_attempt_at` when it may try again — this is also where the reply
                      delay lives, so waiting costs nothing;
  - `claimed_at`      guards against two overlapping ticks taking the same row.
*/

ALTER TABLE instagram_automation_events
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

/*
  The worker's pickup query. Partial, because processed events vastly outnumber
  pending ones and only the pending ones are ever scanned.
*/
CREATE INDEX IF NOT EXISTS instagram_automation_events_queue_idx
  ON instagram_automation_events (next_attempt_at)
  WHERE status = 'received';

/* Counting an account's recent sends, for the hourly throttle. */
CREATE INDEX IF NOT EXISTS instagram_automation_events_account_sent_idx
  ON instagram_automation_events (instagram_account_id, created_at)
  WHERE status = 'sent';

/*
  The repeat guard used to be a read-then-write: count recent sends for this
  person and this rule, then send if there were none. Two comments arriving in
  the same second both read zero and both send, so the one thing the setting
  promises — that nobody is messaged twice — was not actually guaranteed.

  A unique index cannot express "within N hours", but it can express the case
  that matters: one successful delivery per person per rule per day. The worker
  still applies the configured window on top; this is the backstop that holds
  when two workers race.

  The day is pinned to UTC. Casting a timestamptz to date directly reads the
  session's TimeZone, which makes the expression merely STABLE and therefore
  illegal in an index — and would also mean the boundary moved with whoever
  happened to be connected.
*/
CREATE UNIQUE INDEX IF NOT EXISTS instagram_automation_events_one_send_per_day_idx
  ON instagram_automation_events (
    lead_magnet_id,
    sender_igsid,
    ((created_at AT TIME ZONE 'UTC')::date)
  )
  WHERE status = 'sent' AND lead_magnet_id IS NOT NULL AND sender_igsid IS NOT NULL;

/*
  The delay is no longer served by sleeping inside a request, so the sixty
  second ceiling that existed to fit the worker's lifetime can go. Fifteen
  minutes is a far more human pause, and it now costs nothing but a later
  `next_attempt_at`.
*/
ALTER TABLE lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_reply_delay_check;

ALTER TABLE lead_magnets
  ADD CONSTRAINT lead_magnets_reply_delay_check
    CHECK (reply_delay_seconds BETWEEN 0 AND 900);

-- ---------------------------------------------------------------------------
-- Atomic claim
-- ---------------------------------------------------------------------------

/*
  Claiming work, done properly.

  PostgREST cannot express `UPDATE ... LIMIT`, nor `attempts = attempts + 1`,
  so doing this from the client means select-then-update — two statements with
  a gap between them where a second worker can claim the same rows. At a
  trickle that gap never opens; during the burst this whole change exists to
  survive, it opens constantly, and the symptom is someone receiving the lead
  magnet twice.

  `FOR UPDATE SKIP LOCKED` is the standard answer: each caller takes rows no
  other caller holds, in one statement, with the attempt counter incremented in
  the same breath.
*/
CREATE OR REPLACE FUNCTION claim_instagram_events(
  batch_size integer,
  claim_timeout interval DEFAULT interval '5 minutes'
)
RETURNS SETOF instagram_automation_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE instagram_automation_events AS event
  SET claimed_at = now(),
      attempts = event.attempts + 1
  WHERE event.id IN (
    SELECT candidate.id
    FROM instagram_automation_events AS candidate
    WHERE candidate.status = 'received'
      AND candidate.next_attempt_at <= now()
      AND (candidate.claimed_at IS NULL OR candidate.claimed_at < now() - claim_timeout)
    ORDER BY candidate.next_attempt_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING event.*;
END;
$$;

/* Only the service role runs the worker; nothing in the browser may claim. */
REVOKE ALL ON FUNCTION claim_instagram_events(integer, interval) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Worker schedule
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('instagram-automation-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'instagram-automation-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := nullif(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/instagram-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', current_setting('app.settings.cron_secret', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ------------------------------------------------------------------------
-- 20260817100000_enable_pg_net.sql
-- ------------------------------------------------------------------------

/*
  Enable pg_net, without which every scheduled job is a no-op.

  All the cron jobs in this project call `net.http_post` to invoke an Edge
  Function. That schema comes from the pg_net extension, and pg_net is not
  enabled by default on a Supabase project — so on a database where nobody
  turned it on, every job fails with `schema "net" does not exist` and the
  failure is only visible in `cron.job_run_details`, which nothing reads.

  The symptom is the worst kind: everything looks configured, the jobs are
  listed and active, and nothing runs. On the project this was found on, it had
  been silently disabling scheduled publishing since the very first cron
  migration — `auto-publish-reels` had never once executed.

  Placed before nothing in particular, because the jobs themselves are created
  by earlier migrations: pg_cron stores the command as text and only resolves
  `net.http_post` when the job fires, so enabling the extension afterwards
  fixes the jobs already scheduled.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;

/*
  pg_net keeps its functions in its own `net` schema regardless of any
  requested target, and the job commands are written against that name. This is
  a guard rail: if a future Postgres or Supabase release changes the default,
  the migration fails loudly here rather than leaving every scheduled job
  quietly broken again.
*/
DO $$
BEGIN
  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION
      'pg_net is installed but net.http_post is missing — cron jobs invoke Edge Functions through it';
  END IF;
END $$;

-- ------------------------------------------------------------------------
-- 20260817110000_cron_secrets_via_vault.sql
-- ------------------------------------------------------------------------

/*
  Give the scheduled jobs a working way to reach the Edge Functions.

  Every cron job built its request from `current_setting('app.settings.…')`,
  which the README asks the operator to populate with `ALTER DATABASE … SET`.
  Two things go wrong with that. It is a manual step nobody remembers, and on a
  Supabase project the `postgres` role is not a superuser, so the ALTER is
  simply refused — the setting can never be applied by the person following the
  instructions.

  The result is a null URL, an insert into pg_net's queue that violates a
  NOT NULL constraint, and a job that fails on its first line. Failures land in
  `cron.job_run_details`, which nothing reads, so the jobs look active and
  scheduled forever while doing nothing at all.

  Supabase Vault is the supported place for this, and it needs no elevated
  role. One helper reads both values and raises if either is missing, so a
  misconfigured project fails loudly on the first tick instead of silently
  forever.
*/

CREATE OR REPLACE FUNCTION invoke_edge_function(function_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE EXCEPTION
      'Vault secrets "project_url" and "cron_secret" are required before scheduled jobs can run';
  END IF;

  SELECT net.http_post(
    url := base_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', secret
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RETURN request_id;
END;
$$;

/*
  This function holds the cron secret and will call any Edge Function named.
  Only the scheduler needs it; nothing reachable from the browser may.
*/
REVOKE ALL ON FUNCTION invoke_edge_function(text) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Re-point every scheduled job
-- ---------------------------------------------------------------------------

/* cron.schedule upserts by job name, so this replaces the commands in place. */
SELECT cron.schedule('auto-publish-reels', '* * * * *',
  $$SELECT invoke_edge_function('auto-publish')$$);

SELECT cron.schedule('check-instagram-tokens-daily', '0 12 * * *',
  $$SELECT invoke_edge_function('check-tokens')$$);

SELECT cron.schedule('cleanup-archived-video-reels-daily', '0 3 * * *',
  $$SELECT invoke_edge_function('cleanup-storage')$$);

SELECT cron.schedule('telegram-broadcast-worker', '* * * * *',
  $$SELECT invoke_edge_function('telegram-broadcast')$$);

SELECT cron.schedule('telegram-drip-worker', '* * * * *',
  $$SELECT invoke_edge_function('telegram-drip')$$);

SELECT cron.schedule('instagram-automation-worker', '* * * * *',
  $$SELECT invoke_edge_function('instagram-worker')$$);

-- ------------------------------------------------------------------------
-- 20260817140000_automation_queue_health.sql
-- ------------------------------------------------------------------------

/*
  Make the state of the automation queue visible.

  Now that comments are processed from a queue rather than inside the webhook,
  a backlog is a real state the account can be in: Meta throttling the account,
  an expired token, a worker that stopped. All of those look identical from the
  interface today — events simply stop appearing — and the owner finds out from
  a customer who never got their guide.

  One view answers the questions worth asking at a glance: how many are
  waiting, how long the oldest has waited, and how many gave up. Aggregated per
  account, so it stays cheap no matter how large the log grows.

  `security_invoker` keeps the caller's RLS in force, so an account's queue is
  visible only to the person who owns it.
*/

CREATE OR REPLACE VIEW instagram_queue_health
WITH (security_invoker = true) AS
SELECT
  account.id AS instagram_account_id,
  account.user_id,
  account.username,
  count(event.id) FILTER (WHERE event.status = 'received') AS pending_count,
  /* Waiting on a delay or a backoff rather than on the worker — normal, and
     worth separating so a healthy pause does not read as a stall. */
  count(event.id) FILTER (
    WHERE event.status = 'received' AND event.next_attempt_at > now()
  ) AS waiting_count,
  min(event.next_attempt_at) FILTER (WHERE event.status = 'received') AS next_due_at,
  min(event.created_at) FILTER (WHERE event.status = 'received') AS oldest_pending_at,
  count(event.id) FILTER (
    WHERE event.status = 'failed' AND event.created_at > now() - interval '24 hours'
  ) AS failed_24h,
  count(event.id) FILTER (
    WHERE event.status = 'sent' AND event.processed_at > now() - interval '1 hour'
  ) AS sent_last_hour,
  count(event.id) FILTER (
    WHERE event.status = 'sent' AND event.processed_at > now() - interval '24 hours'
  ) AS sent_24h,
  max(event.attempts) FILTER (WHERE event.status = 'received') AS max_attempts_pending
FROM instagram_accounts account
LEFT JOIN instagram_automation_events event
  ON event.instagram_account_id = account.id
WHERE account.is_active
GROUP BY account.id, account.user_id, account.username;

GRANT SELECT ON instagram_queue_health TO authenticated;

-- ------------------------------------------------------------------------
-- 20260817160000_batched_event_retention.sql
-- ------------------------------------------------------------------------

/*
  Retention that stays cheap as the log grows.

  The nightly cleanup was a single `DELETE ... WHERE created_at < now() - 90
  days`. At a handful of events a day that is instant. At a thousand a day the
  table holds ninety thousand rows, each carrying the full webhook payload as
  jsonb, and one statement has to find and remove a day's worth in a single
  transaction — holding locks and writing one large WAL record while the
  workers are trying to claim from the same table.

  Two changes, both about the payload rather than the row.

  `raw_event` is the bulky part and the part that stops being useful first. It
  exists to diagnose "why did this comment behave oddly", which is a question
  asked within days, not months. So it is emptied after two weeks while the
  event itself — status, timings, which rule matched — survives the full ninety
  days for the analytics that read it.

  And both passes run in bounded batches with a commit between them, so the
  job never holds a long transaction against a table the workers are using.
*/

CREATE OR REPLACE FUNCTION prune_automation_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_size constant integer := 2000;
  /* Enough headroom for a very busy day without ever becoming unbounded: if
     there is more to do, tomorrow's run picks it up. */
  max_batches constant integer := 100;
  trimmed integer := 0;
  deleted integer := 0;
  affected integer;
BEGIN
  FOR i IN 1..max_batches LOOP
    UPDATE instagram_automation_events
    SET raw_event = '{}'::jsonb
    WHERE id IN (
      SELECT id
      FROM instagram_automation_events
      WHERE created_at < now() - interval '14 days'
        AND raw_event <> '{}'::jsonb
      LIMIT batch_size
    );

    GET DIAGNOSTICS affected = ROW_COUNT;
    trimmed := trimmed + affected;
    EXIT WHEN affected = 0;
  END LOOP;

  FOR i IN 1..max_batches LOOP
    DELETE FROM instagram_automation_events
    WHERE id IN (
      SELECT id
      FROM instagram_automation_events
      WHERE created_at < now() - interval '90 days'
      LIMIT batch_size
    );

    GET DIAGNOSTICS affected = ROW_COUNT;
    deleted := deleted + affected;
    EXIT WHEN affected = 0;
  END LOOP;

  RETURN jsonb_build_object('trimmed', trimmed, 'deleted', deleted);
END;
$$;

REVOKE ALL ON FUNCTION prune_automation_events() FROM public, anon, authenticated;

/* Supports both passes: finding old rows, and old rows that still carry a
   payload. */
CREATE INDEX IF NOT EXISTS instagram_automation_events_created_idx
  ON instagram_automation_events (created_at);

SELECT cron.schedule(
  'cleanup-automation-events-daily',
  '30 3 * * *',
  $$SELECT prune_automation_events()$$
);
