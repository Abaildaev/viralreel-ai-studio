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
