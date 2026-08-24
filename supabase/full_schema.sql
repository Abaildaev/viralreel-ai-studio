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

-- ------------------------------------------------------------------------
-- 20260820120000_message_attachments.sql
-- ------------------------------------------------------------------------

/*
  Attachments: a photo, a video or a file on any message the product sends.

  Until now every outgoing message was text plus one link button, which made
  the lead magnet a URL and nothing else. That is the wrong shape for most of
  what people actually promise under a Reel — a PDF, a checklist, a short
  video. Sending the file itself converts better than sending a link to it, and
  in Telegram it costs one API call.

  One shape, three places: a funnel step, a broadcast, and the Instagram Direct
  reply. The columns are identical so the editor, the senders and the preview
  can share a single notion of "an attachment" instead of three near-copies.

  Files live in a private bucket and travel to Telegram and Meta as a
  short-lived signed URL minted at send time — never at upload time. A drip
  step can go out a week after the author uploaded its video, so a URL signed
  in the browser would be long expired; the sender holds the service role and
  signs it fresh.
*/

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('funnel-media', 'funnel-media', false)
ON CONFLICT (id) DO NOTHING;

/*
  Own folder only, on every verb. The other buckets in this project let any
  authenticated user read any object because the renderer needed it; nothing
  needs that here, so this one is scoped properly from the start.
*/
DROP POLICY IF EXISTS "Users can read own funnel media" ON storage.objects;
CREATE POLICY "Users can read own funnel media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can upload own funnel media" ON storage.objects;
CREATE POLICY "Users can upload own funnel media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can replace own funnel media" ON storage.objects;
CREATE POLICY "Users can replace own funnel media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own funnel media" ON storage.objects;
CREATE POLICY "Users can delete own funnel media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'funnel-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

/*
  `attachment_` rather than `media_`: lead_magnets already spends `media_scope`
  and `media_ids` on something else entirely — which Instagram posts a rule
  watches — and two unrelated meanings of "media" on one row is how the wrong
  column gets read a year from now.

  The paired CHECK is the point of splitting type from path: half an
  attachment — a type with no file, or a file the sender does not know how to
  send — would fail at send time, days later, in a worker nobody is watching.
  Here it fails at the write instead.
*/
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['telegram_funnel_steps', 'telegram_broadcasts', 'lead_magnets']
  LOOP
    EXECUTE format(
      'ALTER TABLE %I
         ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT ''none'',
         ADD COLUMN IF NOT EXISTS attachment_path text NOT NULL DEFAULT '''',
         ADD COLUMN IF NOT EXISTS attachment_name text NOT NULL DEFAULT ''''',
      target
    );

    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      target, target || '_attachment_type_check'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I
         CHECK (attachment_type IN (''none'', ''photo'', ''video'', ''document''))',
      target, target || '_attachment_type_check'
    );

    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      target, target || '_attachment_pair_check'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I
         CHECK ((attachment_type = ''none'') = (attachment_path = ''''))',
      target, target || '_attachment_pair_check'
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------------------
-- 20260820140000_funnel_media_size_limit.sql
-- ------------------------------------------------------------------------

/*
  A ceiling on the bucket itself.

  The editor already refuses anything over 5 MB for a photo and 20 MB for
  everything else, but that is a courtesy to the author, not a control: the
  limit lives in the browser, and the browser is the one thing an account
  holder can bypass. Twenty megabytes is the largest file Telegram will fetch
  from a URL, so anything above it could never be delivered anyway — it would
  only sit in storage on the owner's bill.

  No `allowed_mime_types`: the list of things people legitimately hand out —
  PDFs, epubs, archives, audio — is long and browsers disagree about what to
  call them, so an allowlist here would reject real lead magnets more often
  than it would stop anything. The size cap is where the actual cost is.
*/

UPDATE storage.buckets
SET file_size_limit = 20 * 1024 * 1024
WHERE id = 'funnel-media';

-- ------------------------------------------------------------------------
-- 20260820150000_funnel_welcome_attachment.sql
-- ------------------------------------------------------------------------

/*
  A file on the greeting too.

  The greeting was left plain when attachments landed, on the reasoning that it
  is the entry protocol rather than content. That holds for a funnel that
  delivers a course, and not at all for the common case: one photo of the thing
  being promised, sent the second someone arrives, before any subscription gate
  has a chance to lose them.

  Same three columns and the same two constraints as everywhere else — this is
  the fourth table to carry them, and the shape is deliberately identical so
  the editor, the senders and the preview keep sharing one notion of a file.
*/

ALTER TABLE telegram_funnels
  ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS attachment_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachment_name text NOT NULL DEFAULT '';

ALTER TABLE telegram_funnels
  DROP CONSTRAINT IF EXISTS telegram_funnels_attachment_type_check;
ALTER TABLE telegram_funnels
  ADD CONSTRAINT telegram_funnels_attachment_type_check
    CHECK (attachment_type IN ('none', 'photo', 'video', 'document'));

ALTER TABLE telegram_funnels
  DROP CONSTRAINT IF EXISTS telegram_funnels_attachment_pair_check;
ALTER TABLE telegram_funnels
  ADD CONSTRAINT telegram_funnels_attachment_pair_check
    CHECK ((attachment_type = 'none') = (attachment_path = ''));

-- ------------------------------------------------------------------------
-- 20260820160000_instagram_attachment_cache.sql
-- ------------------------------------------------------------------------

/*
  Upload the lead magnet's file to Meta once, not once per delivery.

  Today every firing of a rule hands Instagram a fresh signed URL, and
  Instagram fetches the file again — so a Reel that brings a thousand people
  moves the same PDF a thousand times, out of storage the owner pays for and
  through an API that rate-limits.

  Meta's answer is a reusable attachment: send it once with `is_reusable`, keep
  the id it hands back, and every later message references the id instead of a
  URL. Whether Instagram's messaging API returns that id the way Messenger's
  does is not something the documentation is clear about, so the worker treats
  it as a bonus — it caches an id when one arrives and falls back to the URL
  when none does. Nothing breaks if the answer turns out to be "never".

  Keyed by account as well as path because an attachment id belongs to the
  account that uploaded it, and by path so replacing the file invalidates the
  cache by simply not matching any more.
*/

CREATE TABLE IF NOT EXISTS instagram_attachment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  /* The object in `funnel-media`, not a URL: the URL is signed per send and
     is different every time. */
  attachment_path text NOT NULL,
  attachment_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, attachment_path)
);

ALTER TABLE instagram_attachment_cache ENABLE ROW LEVEL SECURITY;

/*
  Written only by the worker, which holds the service role. The owner may read
  their own rows — useful when explaining why a file stopped re-uploading —
  but there is nothing here for the browser to write.
*/
DROP POLICY IF EXISTS "Users can view own instagram attachment cache"
  ON instagram_attachment_cache;
CREATE POLICY "Users can view own instagram attachment cache"
  ON instagram_attachment_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM instagram_accounts account
      WHERE account.id = instagram_attachment_cache.instagram_account_id
        AND account.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------
-- 20260821120000_remove_manual_subscription_check.sql
-- ------------------------------------------------------------------------

/*
  Channel membership updates now unlock the material automatically. Keeping a
  manual "I subscribed" default creates the two-button gate shown by older
  deployments and gives the reader one instruction too many.

  The column remains for old messages whose callback may still arrive, but new
  rows and existing funnels no longer advertise that obsolete action.
*/

ALTER TABLE telegram_funnels
  ALTER COLUMN check_button_text SET DEFAULT '';

UPDATE telegram_funnels
SET
  check_button_text = '',
  updated_at = now()
WHERE check_button_text IN ('Я подписался', 'Проверить подписку');

/* Refresh the prompt funnel that shipped with the old wall-of-text copy. */
UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nВнутри — 10 готовых формул для AI-изображений и видео. Их можно скопировать, заменить детали под свою идею и сразу протестировать.',
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит PDF. Возвращаться и нажимать «Проверить» не нужно.',
  subscribe_button_text = 'Подписаться и забрать промпты',
  check_button_text = '',
  updated_at = now()
WHERE welcome_text ILIKE 'Вы пришли за паком промптов из Reels%'
   OR not_subscribed_text ILIKE 'Подпишитесь на канал «Промты & Нейросети»%';

/*
  The screenshot also contains two identical immediate PDF steps. Preserve the
  first as delivery, turn the second into a useful three-hour reminder without
  a second attachment, and switch off any further identical copies.
*/
WITH legacy_prompt_steps AS (
  SELECT
    step.id,
    row_number() OVER (
      PARTITION BY step.funnel_id
      ORDER BY step.position, step.created_at, step.id
    ) AS copy_number
  FROM telegram_funnel_steps step
  WHERE step.body ILIKE 'Готово — ваш лид-магнит прикреплён к этому сообщению%'
)
UPDATE telegram_funnel_steps step
SET
  title = CASE legacy.copy_number
    WHEN 1 THEN 'Промпты и бесплатный тест'
    ELSE 'Две попытки с пользой'
  END,
  body = CASE legacy.copy_number
    WHEN 1 THEN E'Промпты готовы 🎁\n\nВ PDF — 10 готовых формул для изображений и видео.\n\nКак протестировать:\n\n1. Выберите промпт в PDF.\n2. Скопируйте его без сокращений.\n3. Откройте бота по кнопке ниже.\n4. Выберите нейросеть и вставьте промпт.\n\nВ боте собраны разные нейросети, а новым пользователям доступны 2 бесплатные генерации.'
    ELSE E'Если ещё не запускали промпт — не откладывайте его в сохранённые.\n\nПервую генерацию сделайте без изменений — так вы увидите исходный результат.\n\nВо второй замените только героя или свой продукт. Так сразу будет видно, как формула работает под вашу задачу.'
  END,
  button_text = CASE legacy.copy_number
    WHEN 1 THEN 'Протестировать — 2 генерации бесплатно'
    ELSE 'Использовать 2 бесплатные генерации'
  END,
  delay_minutes = CASE legacy.copy_number WHEN 1 THEN 0 ELSE 180 END,
  is_active = legacy.copy_number <= 2,
  attachment_type = CASE legacy.copy_number WHEN 1 THEN step.attachment_type ELSE 'none' END,
  attachment_path = CASE legacy.copy_number WHEN 1 THEN step.attachment_path ELSE '' END,
  attachment_name = CASE legacy.copy_number WHEN 1 THEN step.attachment_name ELSE '' END,
  updated_at = now()
FROM legacy_prompt_steps legacy
WHERE step.id = legacy.id;

-- ------------------------------------------------------------------------
-- 20260821123000_upgrade_prompt_funnel_copy.sql
-- ------------------------------------------------------------------------

/*
  The live Nano Banana prompt funnel predates the conversion-focused template.
  Rewrite only that funnel's copy while deliberately preserving its uploaded
  PDF and partner-bot URLs.
*/

UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nВнутри — 10 готовых промптов для Nano Banana Pro с наглядными примерами. Их можно скопировать, заменить детали под свою идею и сразу протестировать.',
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит PDF. Возвращаться и нажимать «Проверить» не нужно.',
  subscribe_button_text = 'Подписаться и забрать промпты',
  check_button_text = '',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = 'Промпты и бесплатный тест',
  body = E'Промпты готовы 🎁\n\nВ PDF — 10 готовых формул для изображений и видео.\n\nКак протестировать:\n\n1. Выберите промпт в PDF.\n2. Скопируйте его без сокращений.\n3. Откройте бота по кнопке ниже.\n4. Выберите нейросеть и вставьте промпт.\n\nВ боте собраны основные нейросети, а новым пользователям доступны 2 бесплатные генерации.',
  button_text = 'Протестировать — 2 генерации бесплатно',
  delay_minutes = 0,
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Две попытки с пользой',
  body = E'Если ещё не запускали промпт — не откладывайте его в сохранённые.\n\nПервую генерацию сделайте без изменений — так вы увидите исходный результат.\n\nВо второй замените только героя или свой продукт. Так сразу будет видно, как формула работает под вашу задачу.',
  button_text = 'Использовать 2 бесплатные генерации',
  delay_minutes = 60,
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;

-- ------------------------------------------------------------------------
-- 20260821130000_update_prompt_pack_offer.sql
-- ------------------------------------------------------------------------

/*
  Make the prompt pack the single offer everywhere.

  The old copy sold two free generations, while the Instagram CTA promised a
  ready-made pack. Keep the funnel and its captions aligned: the code word is
  «промпт», and the promised result is a pack that can be adapted to any task.
*/

UPDATE telegram_funnels
SET
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит готовый пак промптов под любые задачи. Возвращаться и нажимать «Проверить» не нужно.',
  subscribe_button_text = 'Подписаться и забрать пак промптов',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = 'Готовый пак промптов',
  body = E'Промпты готовы 🎁\n\nВ PDF — готовый пак промптов под любые задачи: стиль, свет, композиция и детали уже собраны в понятные структуры.\n\nВыберите нужную формулу, скопируйте её целиком и замените детали под свою идею.\n\nПИШИ «промпт» — и я отправлю готовый пак промптов под любые задачи.',
  button_text = 'Забрать пак промптов',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Как адаптировать пак',
  body = E'Сохраните пак, чтобы не искать слова для нейросети с нуля.\n\nВ каждой формуле уже заданы стиль, свет и композиция — меняйте только героя, продукт или нужные детали под свою задачу.',
  button_text = 'Использовать готовые промпты',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;

-- ------------------------------------------------------------------------
-- 20260821131500_update_prompt_keyword_copy.sql
-- ------------------------------------------------------------------------

/* Align the Instagram keyword rule that feeds the prompt Telegram funnel. */

UPDATE lead_magnets magnet
SET
  title = 'Готовый пак промптов под любые задачи',
  description = 'Чёткие структуры промптов для стиля, света и композиции. Напишите «промпт» — и я отправлю готовый пак под вашу задачу.',
  codeword = 'промпт',
  keywords = ARRAY['промпт'],
  reply_text = E'Готово 🎁\n\nПереходите в Telegram — там вас ждёт готовый пак промптов под любые задачи.',
  direct_reply_variants = ARRAY[E'Готово 🎁\n\nПереходите в Telegram — там вас ждёт готовый пак промптов под любые задачи.'],
  button_text = 'Забрать пак промптов',
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
    AND funnel.lead_magnet_id IS NOT NULL
);

-- ------------------------------------------------------------------------
-- 20260821143000_prompt_funnel_site_and_comment_replies.sql
-- ------------------------------------------------------------------------

/* Send the prompt site from the Telegram funnel and add delivery hints to comments. */

UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nПосле подписки бот отправит ссылку на сайт с 2000+ готовых промптов для любых визуальных задач.',
  subscribe_button_text = 'Подписаться и открыть 2000+ промптов',
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = '2000+ готовых промптов',
  body = E'Промпты готовы 🎁\n\nНа сайте — 2000+ готовых промптов для нейросетей под любые визуальные задачи: стиль, свет, композиция и детали уже собраны в понятные структуры.\n\nОткрывайте каталог, выбирайте нужную формулу и меняйте детали под свою идею.',
  button_text = 'Открыть 2000+ промптов',
  button_url = 'https://nanobanana-prompts.netlify.app/',
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Вернуться к промптам',
  body = E'Сохраните сайт, чтобы не искать слова для нейросети с нуля.\n\nВ каталоге уже собраны 2000+ формул для стиля, света и композиции — меняйте только героя, продукт или нужные детали под свою задачу.',
  button_text = 'Вернуться к промптам',
  button_url = 'https://nanobanana-prompts.netlify.app/',
  attachment_type = 'none',
  attachment_path = '',
  attachment_name = '',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;

UPDATE lead_magnets magnet
SET
  public_reply_variants = ARRAY[
    'Отправил в Direct! Проверяйте сообщения 🚀',
    'Ссылка уже у вас в Direct 🙌',
    'Материал отправлен в личные сообщения!',
    'Если сообщение не пришло, проверьте папку «Запросы» в Direct 📩',
    'Не видите сообщение? Загляните в папку «Запросы» — иногда оно попадает туда 👀',
    'Проверьте папку «Запросы» в Direct, если сообщение не появилось сразу 🔎'
  ],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
    AND funnel.lead_magnet_id IS NOT NULL
);

-- ------------------------------------------------------------------------
-- 20260821150000_prompt_funnel_partner_bot.sql
-- ------------------------------------------------------------------------

/* Route the prompt funnel to the partner bot that can test the full pack. */

UPDATE telegram_funnels
SET
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nПосле подписки бот отправит ссылку на партнёрского бота, где можно протестировать все промпты.',
  subscribe_button_text = 'Подписаться и тестировать промпты',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnels
SET
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит ссылку на партнёрского бота, где можно протестировать все промпты. Возвращаться и нажимать «Проверить» не нужно.',
  updated_at = now()
WHERE slug = 'prompts'
  AND name ILIKE '10 пром% для сильных AI-визуалов';

UPDATE telegram_funnel_steps step
SET
  title = 'Тестировать промпты в боте',
  body = E'Промпты готовы 🎁\n\nПереходите в партнёрского бота — там можно протестировать все промпты для любых визуальных задач и сразу увидеть результат.',
  button_text = 'Тестировать промпты в боте',
  button_url = 'https://t.me/Integer_ai_bot?start=REF00009284',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  title = 'Протестировать ещё промпты',
  body = E'В партнёрском боте можно протестировать все промпты и подобрать формулу под свою визуальную задачу.',
  button_text = 'Открыть бота',
  button_url = 'https://t.me/Integer_ai_bot?start=REF00009284',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name ILIKE '10 пром% для сильных AI-визуалов'
  AND step.position = 2;

-- ------------------------------------------------------------------------
-- 20260821200000_update_prompt_funnel_pack_count.sql
-- ------------------------------------------------------------------------

/* Align the live prompt funnel with the current Instagram offer. */

UPDATE telegram_funnels
SET
  name = '1000+ готовых промптов для визуала',
  welcome_text = E'Промпты из Reels уже готовы 🎁\n\nПосле подписки бот отправит ссылку на партнёрского бота, где можно протестировать все 1000+ промптов для визуала.',
  not_subscribed_text = E'Подпишитесь на канал 👇\n\nЗдесь каждый пост — это готовый результат, точный промпт и короткий разбор настроек. Без новостей и лишней теории.\n\nСразу после подписки бот автоматически отправит ссылку на партнёрского бота, где можно протестировать все 1000+ промптов для визуала. Возвращаться и нажимать «Проверить» не нужно.',
  updated_at = now()
WHERE slug = 'prompts'
  AND (
    name ILIKE '10 пром%'
    OR name ILIKE '10 готов%'
    OR name ILIKE '1000+ пром%'
  );

UPDATE telegram_funnel_steps step
SET
  body = E'Промпты готовы 🎁\n\nПереходите в партнёрского бота — там можно протестировать все 1000+ готовых промптов для любых визуальных задач и сразу увидеть результат.',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name = '1000+ готовых промптов для визуала'
  AND step.position = 1;

UPDATE telegram_funnel_steps step
SET
  body = E'В партнёрском боте можно протестировать все 1000+ промптов и подобрать формулу под свою визуальную задачу.',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND funnel.name = '1000+ готовых промптов для визуала'
  AND step.position = 2;

-- ------------------------------------------------------------------------
-- 20260821210000_prompt_funnel_single_entry_message.sql
-- ------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------
-- 20260821230000_telegram_attachment_cache.sql
-- ------------------------------------------------------------------------

/*
  Keep Telegram media inside Telegram after its first delivery.

  Sending a Storage URL makes Telegram download the same image again for every
  /start. Telegram's returned file_id is durable for the bot that uploaded it,
  so cache it by bot + object path + media type and reuse it directly.
*/

CREATE TABLE IF NOT EXISTS telegram_attachment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  attachment_path text NOT NULL,
  attachment_type text NOT NULL
    CHECK (attachment_type IN ('photo', 'video', 'document')),
  telegram_file_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_bot_id, attachment_path, attachment_type)
);

ALTER TABLE telegram_attachment_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram attachment cache"
  ON telegram_attachment_cache;
CREATE POLICY "Users can view own telegram attachment cache"
  ON telegram_attachment_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM telegram_bots bot
      WHERE bot.id = telegram_attachment_cache.telegram_bot_id
        AND bot.user_id = auth.uid()
    )
  );

GRANT SELECT ON TABLE telegram_attachment_cache TO authenticated;

-- ------------------------------------------------------------------------
-- 20260822180000_retry_instagram_video_processing.sql
-- ------------------------------------------------------------------------

/*
  Keep transient Instagram video-processing failures in the queue. Meta can
  take longer than one polling window to transcode a Reel, and a temporary
  processing error should not permanently lose the scheduled post.
*/

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_publish_attempts_check;

ALTER TABLE scheduled_posts
  ADD CONSTRAINT scheduled_posts_publish_attempts_check
  CHECK (publish_attempts >= 0);

-- ------------------------------------------------------------------------
-- 20260823110000_instagram_direct_copy_rewrite.sql
-- ------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------
-- 20260823120000_direct_reply_buttons.sql
-- ------------------------------------------------------------------------

/*
  A button of its own for every Direct variant.

  One rule used to carry several ways of saying the same thing and exactly one
  button under all of them, so a variant that opened with «Хватит мучиться»
  and one that opened with «Твой чит-код» had to share a caption written for
  neither. The titles live in a second array beside the words, matched by
  index: a position left empty falls back to `button_text`, which is what every
  rule written before this column did and keeps doing.

  Parallel arrays rather than a column of pairs, because the variants are
  already in production and rewriting them into objects would need a data
  migration for something the reader never sees.
*/

ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS direct_reply_buttons text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN lead_magnets.direct_reply_buttons IS
  'Надписи на кнопке для direct_reply_variants, по индексу. Пустое место — берётся button_text.';

/*
  The prompt funnel's own set, in the order its variants are stored. The first
  three promise the catalogue outright, the last two name the subscription on
  the way to it, and the buttons follow that split: «тестировать» where the
  copy leads with the test, «забрать» where it leads with the base.
*/
UPDATE lead_magnets magnet
SET
  direct_reply_buttons = ARRAY[
    'Тестировать промпты',
    'Забрать базу и тест',
    'Забрать 1000+ схем',
    'Забрать базу и тест',
    'Тестировать формулы'
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

-- ------------------------------------------------------------------------
-- 20260823130000_short_direct_reply_buttons.sql
-- ------------------------------------------------------------------------

/*
  Button titles short enough to survive either reading of Meta's limit.

  The limit is documented in characters, and the sender now measures it that
  way. But the code measured bytes until today, nobody outside Meta can say
  which of the two the platform enforces, and the cost of being wrong is the
  message failing to send at the one moment the reader is ready to tap.

  Ten Cyrillic letters is twenty bytes, so a title of that length passes under
  both readings at once. Digits and latin cost a byte each rather than two,
  which is why «1000+ схем» fits at ten characters and fourteen bytes.

  Shorter titles also lose something: «Тестировать промпты» said what would
  happen, «1000+ схем» only names the prize. Naming the prize is the half
  worth keeping when only half fits.
*/

UPDATE lead_magnets magnet
SET
  direct_reply_buttons = ARRAY[
    '1000+ схем',
    'Хочу базу',
    'Хочу чит',
    'Забрать',
    'К формулам'
  ],
  /* The fallback for a variant left without its own title, kept under the
     same ceiling — it is the one that ships when someone clears a field. */
  button_text = 'Забрать',
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

-- ------------------------------------------------------------------------
-- 20260823140000_prompt_of_the_day_sequence.sql
-- ------------------------------------------------------------------------

/*
  The prompt-a-day sequence.

  The funnel used to hand over the catalogue, point at the partner bot and
  then nudge three times about doing something with it. It now teaches instead
  of nudging: every day carries one finished prompt, the picture it produces
  and the four taps that reproduce it. The ask is identical each time and sits
  at the end of a message the reader wanted to open anyway.

  Two messages per day rather than one, because a prompt long enough to be
  worth having is longer than a photo caption may be. The first carries the
  picture and the instructions, the second carries the prompt itself and the
  button — and the second has no delay, so the pair arrives together and the
  button lands under the reader's thumb while the instructions are still on
  screen.

  Every prompt is wrapped in <code>, which is what makes Telegram copy it on a
  single tap. Without it the reader has to select two thousand characters by
  hand on a phone, and the instruction to "just tap the text" is a lie. None of
  the four prompts contains <, > or &, so the markup cannot fail to parse.

  The «2-3 seconds» the copy was written for is not expressible: the column
  holds whole minutes. Zero is closer than one — consecutive zero-delay steps
  are sent in one pass, which is a couple of seconds apart in practice.

  The photo steps ship without their photos. The pictures are what those
  messages are for, and the account owner uploads them in the funnel editor;
  until then the step sends its caption as a plain message and the sequence
  still works.
*/

INSERT INTO telegram_funnel_steps (
  user_id, funnel_id, position, title, body, button_text, button_url, delay_minutes, is_active
)
SELECT
  funnel.user_id,
  funnel.id,
  step.position,
  step.title,
  step.body,
  step.button_text,
  step.button_url,
  step.delay_minutes,
  true
FROM telegram_funnels funnel
CROSS JOIN (VALUES
  (1, E'Каталог промптов', E'Ты на месте! Твой доступ к 1000+ промптам открыт 🚀\n\nСобрал для тебя огромную библиотеку формул под любые визуальные задачи: от предметной съемки товаров до киношных портретов с правильным светом.\n\nЖми кнопку ниже, чтобы открыть сайт с фильтрами и сохранить его в закладки.\n\nА прямо следующим сообщением я пришлю тебе первый готовый промпт дня и инструмент, где его можно сразу протестировать 👇',
   E'Открыть каталог промптов', E'https://nanobanana-prompts.netlify.app/', 0),
  (2, E'Промпт дня 1 · как это работает', E'Помимо базы формул, я каждый день буду присылать тебе топовые решения под фотосессии, товары и креативы. Чтобы ты сразу делал сочный визуал без тестов наугад.\n\nКак сделать такой арт из своего фото:\n\n1. Нажми на промпт в следующем сообщении — он скопируется в один клик.\n2. Переходи в бота по кнопке внизу 👇\n3. Нажимай «🎨 Создать изображение», листай вниз и выбирай модель ChatGPT Image (GPT).\n4. Прикрепи своё фото, вставь скопированный промпт и нажми «Отправить».\n\nТекст промпта для копирования прилетит прямо под этим сообщением 👇',
   E'', E'', 1),
  (3, E'Промпт дня 1 · текст', E'Промпт для копирования (просто нажми на текст ниже):\n\n<code>Полностью сохранить реальные сцены, композицию, пространственные отношения, здания, улицы, предметы интерьера, детали окружения, естественный свет и тени, реальные материалы и фотографические текстуры на исходном изображении Фон выполнен в стиле реальной фотографии с высоким разрешением, без изменения исходного окружения, без перерисовки фона и без изменения угла обзора объектива Заменить только персонажей на изображении на минималистичные черно-белые стикеры с нарисованными от руки линиями Персонажи остаются на исходном изображении: поза действие направление Количество персонажей Пропорции тела Взаимное расположение Контуры одежды и основные характеристики Персонажи выполнены в минималистичном черно-белом стиле однолинейной ручной иллюстрации, с небрежными и грубоватыми штрихами, естественными линиями, неровностями и легким намеком на мастерство. В персонажах используются только два цвета: чистый черный и чистый белый, без оттенков серого, без цвета и без градиента. Одежда, волосы, черты лица и детали тела прорисованы простыми черными линиями, и лишь небольшое количество чистых черных блоков используется для прорисовки волос, складок на одежде или теней. По краям каждого персонажа добавлены четкие, аккуратные и равномерные белые штрихи, имитирующие наклейки, чтобы создать эффект стикеров и коллажа в стиле «вырезано ножом». Наклейки с персонажами естественным образом накладываются на реальный фотографический фон, при этом персонажи сохраняют двухмерную плоскую текстуру иллюстрации, создавая четкий контраст с реальным фоном. Общий стиль: Минималистичное граффити в стиле INS, черно-белые наброски от руки, стикеры, бумажные коллажи, репортажная съемка, сочетание реальных сцен и двухмерных иллюстраций, редакционный коллаж, смешанная техника. Фон реалистичный и детализированный, персонажи плоские и лаконичные, границы между двумя визуальными языками четкие. Детализация высокой четкости, резкость и ясность, реалистичная фотографическая текстура, визуальные эффекты 8K.</code>\n\nВ боте у тебя 2 бесплатные генерации — загружай фото и проверяй!',
   E'Сделать 2D-стикер', E'https://t.me/Integer_ai_bot?start=REF00009284', 0),
  (4, E'Промпт дня 2 · как это работает', E'Сегодня разбираем создание готового рекламного плаката и журнальной обложки уровня Vogue или Behance. Нейросеть сама собирает композицию, крупную типографику, багажные бирки, графические штампы и объемный свет.\n\n💡 Ты можешь заменить текст в кавычках "СТИРАЮ ШАБЛОНЫ" на свой слоган или название бренда, а также поменять цвет фона (например, на синий или красный).\n\nКак сгенерировать такой постер за 1 минуту:\n\n1. Нажми на промпт в следующем сообщении — он скопируется в один клик.\n2. Переходи в бота по кнопке внизу 👇\n3. Нажимай «🎨 Создать изображение», листай вниз и выбирай модель ChatGPT Image (GPT).\n4. Прикрепи своё фото (или фото модели/одежды), вставь скопированный промпт и нажми «Отправить».\n\nТекст промпта для копирования прилетит прямо под этим сообщением 👇',
   E'', E'', 1440),
  (5, E'Промпт дня 2 · текст', E'Промпт для копирования (просто нажми на текст ниже):\n\n<code>Ультрареалистичная рекламная кампания уличной одежды премиум-класса, на снимке красивая девушка, уверенно сидящий на хромированной багажной тележке в аэропорту, непринужденная поза с естественно расставленными ногами, одна рука лежит на тележке, а другая крепко держится за верхнюю ручку, смотрит прямо в камеру со спокойным уверенным выражением лица, одета в одежду из фото, эффектный широкоугольный объектив с низким углом обзора, создающий объемную обувь на переднем плане, центрированную композицию, современную эстетику путешествия в аэропорту., гигантская белая типографская надпись "СТИРАЮ ШАБЛОНЫ" на зеленом фоне, элементы графического дизайна, включая этикетки со штрих-кодом, туристические наклейки, графические штампы в паспортах, значки глобуса, стрелки, ярлыки для приоритетного багажа, минималистичный фирменный стиль, хромированные блики, чистый белый пол, реклама модной одежды премиум-класса, кампания роскошной уличной одежды, ультрадетализированный дизайн., гиперреалистичная, коммерческая фотография, кинематографическое освещение, HDR, макет обложки журнала, четкий фокус, естественная текстура кожи, реалистичные складки ткани, глубина резкости, высокая контрастность, профессиональная цветопередача, 8K, шедевр, редакция журнала Vogue, Изображение Behance, коммерческая реклама премиум-класса, соотношение сторон 9:16, низкое качество, размытость, шум, водяной знак, искажение логотипа, лишние пальцы, лишние конечности, плохая анатомия, деформированное лицо, обрезанное тело, повторяющиеся объекты, передержка, перенасыщение, текстовые артефакты, плохая типографика, нереалистичные пропорции, размытие при движении, низкое разрешение, мультфильм, аниме, компьютерная графика, пластиковая оболочка, беспорядочная композиция, наклоненный горизонт.</code>\n\nЗапускай бота и забирай готовый постер со своим фото:',
   E'Создать постер в боте', E'https://t.me/Integer_ai_bot?start=REF00009284', 0),
  (6, E'Промпт дня 3 · как это работает', E'Промпт #3: Винтажный постер в стиле ретро-шелкографии 🏛️🎨\n\nСегодня делаем музейную эстетику: винтажный архитектурный плакат первой половины XX века (в стиле ретро-афиш Токио, Стамбула или Парижа). Нейросеть превращает портрет в стильную трафаретную графику, добавляет геометрический диск и прорисовывает атмосферный город на фоне.\n\n💡 Ты можешь заменить город и год в промпте (например, написать «ТОКИО», «ПАРИЖ» или «МОСКВА» и указать свои памятники), чтобы получить уникальный постер под любую поездку или страну.\n\nКак сделать такой постер из своего фото:\n\n1. Нажми на промпт в следующем сообщении — он скопируется в один клик.\n2. Переходи в бота по кнопке внизу 👇\n3. Нажимай «🎨 Создать изображение», листай вниз и выбирай модель ChatGPT Image (GPT).\n4. Прикрепи своё фото (лучше всего крупный или поясной портрет), вставь скопированный промпт и нажми «Отправить».\n\nТекст промпта для копирования прилетит прямо под этим сообщением 👇',
   E'', E'', 1440),
  (7, E'Промпт дня 3 · текст', E'Промпт для копирования (просто нажми на текст ниже):\n\n<code>Создай ретро-иллюстрацию архитектурного плаката в эстетике трафаретной печати, вертикальный формат 3:4, посвященную Стамбулу первой половины XX века. ТИПОГРАФИКА В верхнем левом углу размести крупный заголовок: «СТАМБУЛ» Используй жирный, сильно сжатый шрифт без засечек, прописные буквы. Непосредственно под ним размести меньший подзаголовок: «СВЯТАЯ СОФИЯ И ГОЛУБАЯ МЕЧЕТЬ — БОСФОР · 5:50 утра · 1934 год» Сохрани четкую типографическую иерархию и большое количество свободного пространства вокруг текстового блока. Типографика должна выглядеть как часть исторического редакционного плаката, а не как современная рекламная верстка. ГЛАВНЫЙ ОБЪЕКТ Используй объект / человека из прикрепленного фото как центральный визуальный элемент. Сохрани его узнаваемую форму, силуэт и основные характерные особенности, адаптировав изображение под эстетику ретро-трафаретной печати. ГЕОМЕТРИЧЕСКИЙ ДИСК Позади головы или верхней части основного объекта размести один крупный плоский круглый диск, работающий как графический композиционный якорь. Диск должен быть цельным, геометричным и визуально отделять основной объект от архитектурного фона. АРХИТЕКТУРНЫЙ ФОН Построй фон из ровных плоских пространственных слоев без выраженной перспективной точки схода. Дальний план: очертания старого Стамбула, холмистой городской линии, плотной низкой застройки, крыш и прибрежных кварталов, сведенные к простым прямолинейным архитектурным блокам. Средний план: узнаваемые силуэты Святой Софии, Голубой мечети, Галатской башни, минаретов и прибрежных построек Босфора, изображенные как массивные плоские формы. Передний план: ритмичные графические элементы каменной мостовой, арок, фонарей, балюстрад, причальных деталей, декоративных исламских орнаментов, купольных оснований и архитектурных фрагментов, превращенные в выразительный плакатный паттерн. При необходимости добавь исторически уместные детали окружения: легкий морской туман, утренний пар, отдаленные крыши, тонкие провода, редкие лодочные мачты, чайки и башенные элементы. Облака, туман, дым или пар изображай в виде точечных скоплений с мягкими внешними границами. ВИЗУАЛИЗАЦИЯ Сохрани эстетику винтажной трафаретной / шелкографической печати начала–середины XX века. Тональная моделировка создается исключительно точками, растром и плотностью печати: плотные скопления точек в глубоких тенях; редкие точки в светлых областях; крупные полутоновые растры в средних тонах; никаких плавных цифровых градиентов; никаких фотореалистичных мягких теней. Добавь легкое несовпадение печатных слоев, небольшое смещение красок, шероховатые края отдельных форм, видимую зернистость бумаги и очень деликатную фактуру тканого холста. Контуры — четкие, графичные, преимущественно черные, с равномерной визуальной плотностью. Архитектура должна оставаться легко узнаваемой, но быть сильно упрощенной до плакатных геометрических форм. ПАЛИТРА Используй ровно четыре высококонтрастных цвета: глубокий бирюзово-сине-зеленый; теплый цвет старой бумаги / светлая слоновая кость; насыщенный чернильно-черный; терракотово-красный. Не добавляй дополнительные оттенки. Все промежуточные тона создавай исключительно за счет плотности точек, растра, штрихов и наложения четырех заданных красок. ОБЩИЙ ХАРАКТЕР Исторический архитектурный плакат, музейная шелкография, винтажная городская графика, архивная редакционная иллюстрация, четкая геометрия, мощные архитектурные силуэты, много негативного пространства, ограниченная палитра, тактильная печатная фактура. Соотношение сторон: 3:4 по вертикали.</code>\n\nЗагружай своё фото в бота и делай авторский ретро-плакат:',
   E'Создать ретро-постер', E'https://t.me/Integer_ai_bot?start=REF00009284', 0),
  (8, E'Промпт дня 4 · как это работает', E'Промпт #4: Эстетичная фотосессия на винтажном авто 🏎️☁️\n\nСегодня делаем журнальный кадр в стиле Harper''s Bazaar и Vogue: винтажный пастельно-розовый Porsche 356, объемные летние облака и кинематографичная эстетика без аренды раритетного авто и фотостудии.\n\n💡 Модель идеально переносит черты лица и внешность с твоего фото. Если на фото парень — можно заменить в тексте her на his и She на He (хотя нейросеть отлично считывает пол и сама по исходнику).\n\nКак сделать такую фотосессию за 1 минуту:\n\n1. Нажми на промпт в следующем сообщении — он скопируется в один клик.\n2. Переходи в бота по кнопке внизу 👇\n3. Нажимай «🎨 Создать изображение», выбирай модель Nana Banana Pro.\n4. Прикрепи своё фото (портрет или в полный рост), вставь скопированный промпт и нажми «Отправить».\n\nТекст промпта для копирования прилетит прямо под этим сообщением 👇',
   E'', E'', 1440),
  (9, E'Промпт дня 4 · текст', E'Промпт для копирования (просто нажми на текст ниже):\n\n<code>Use the uploaded photo as an exact personality reference. Fully preserve her face, hairstyle, facial features, proportions, physique, and overall appearance without any changes. Do not alter the personality in any way.\nDreamy minimalist fashion editorial photograph. The model sits gracefully on the roof of a vintage pastel-pink Porsche 356, shot from a dramatic low angle. In the background — huge high cumulus clouds filling most of the sky and creating an expressive cinematic backdrop. The composition has a lot of negative space and a rich deep blue summer sky, making the frame look airy, calm, and refinedly editorial.\nThe model sits on the car roof in a relaxed elegant pose, with a quiet contemplative facial expression. The pose should look natural, effortless, and exquisite. She wears a clean white t-shirt, voluminous dark-blue wide linen trousers with a free-flowing silhouette, and simple brown leather slide sandals. Accessories are minimal and restrained: concise silver earrings and a thin bracelet.\nHer look appears natural and neat, with soft makeup and a clean editorial presentation. A light breeze slightly moves her hair and clothing, adding realism and softness to the scene.\nLighting and mood:\nBright natural summer daylight with soft clean shadows, glowing sky tones, and a calm cinematic atmosphere. The frame should feel serene, spacious, stylish, and poetic.\nStyle and quality:\nUltra-photorealistic luxury fashion editorial photograph, minimalist aesthetic, dreamy summer mood, strong composition, refined color harmony, premium fabric texture, natural skin texture, cinematic realism, light filmic depth, quality of an expensive magazine shot, as for Vogue or Harper''s Bazaar, 8K.</code>\n\nЗагружай фото в Nana Banana Pro и забирай готовый кадр:',
   E'Сделать фотосессию в боте', E'https://t.me/Integer_ai_bot?start=REF00009284', 0)
) AS step(position, title, body, button_text, button_url, delay_minutes)
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
  updated_at = now();

-- ------------------------------------------------------------------------
-- 20260823150000_drop_subscription_gate.sql
-- ------------------------------------------------------------------------

/*
  The catalogue stops costing a subscription.

  Everything downstream was built around the gate: the reader arrived from
  Instagram wanting prompts and was met with a condition, two steps after the
  promise and before anything had been handed over. That is the most expensive
  place in the funnel to ask for something, and the ask was mandatory.

  `require_subscription` is all it takes — `handleStart` reads it, and with the
  gate down the reader goes straight to `deliver`. The funnel's picture moves
  with them: the greeting is empty, so the file rides on the first step of the
  sequence instead of on the subscription request it used to open.

  The gate's own copy is left in place rather than cleared. It holds the best
  paragraph anyone wrote for this funnel — why a neural network returns the
  wrong picture — and it costs nothing to keep against the day the gate comes
  back. It simply stops being shown.
*/

UPDATE telegram_funnels
SET
  require_subscription = false,
  updated_at = now()
WHERE slug = 'prompts'
  AND (
    name ILIKE '10 пром%'
    OR name ILIKE '10 готов%'
    OR name ILIKE '1000+ пром%'
    OR name ILIKE '1000+ готов%'
  );

/*
  Two of the five Direct variants sold the subscription as the step that opened
  the catalogue. With no gate to describe they would be promising a hoop that
  no longer exists — the one kind of copy that costs more than it earns, since
  the reader who braced for a condition and met none still remembers being
  asked. Both are rewritten to say what now actually happens; the other three
  never mentioned it and are left alone.
*/
UPDATE lead_magnets magnet
SET
  direct_reply_variants = ARRAY[
    direct_reply_variants[1],
    direct_reply_variants[2],
    direct_reply_variants[3],
    E'Лови 1000+ промптов для визуала в нейросетях!\n\nВнутри — формулы для картинок и место для их мгновенного теста. Схема простая: жмёшь кнопку — и бот сразу отдаёт доступ к базе. Без условий и регистраций.\n\nЗабирай по кнопке 👇',
    E'Делай студийные картинки в нейросетях с 1-й попытки!\n\nЯ упаковал 1000+ промптов для сочного визуала и подключил движок для быстрого теста. Бот отдаёт базу сразу, делать ничего не нужно.\n\nЖми кнопку ниже 👇'
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
)
  AND array_length(magnet.direct_reply_variants, 1) = 5;

-- ------------------------------------------------------------------------
-- 20260824000500_replay_sequence_for_owner.sql
-- ------------------------------------------------------------------------

/*
  One replay of the whole sequence for the account that owns it.

  Two reasons to do this by hand rather than by pressing /start. The first is
  that /start cannot: the steps were rewritten in place, so their ids survived,
  and this reader's delivery rows from the old funnel still hold the unique
  claim on them — the scheduler tries to claim the next step, loses to the row
  that is already there, and the chain stops after the immediate ones.

  The second is the file cache. Every photo travels from Supabase Storage the
  first time and by Telegram's own file_id every time after, keyed on bot and
  object path. Walking the sequence once warms that cache for everyone who
  arrives later, which is worth an evening of messages to one person.

  Scoped to a single username on purpose. "The most recent subscriber" would
  have been enough while the funnel is quiet, and would have meant nine
  messages — four of them walls of prompt — to a stranger the moment it is not.

  The due times are staggered a second apart in step order rather than set to
  one instant. The worker takes its batch ordered by due_at, so equal times
  would leave the order to chance, and a prompt arriving before the
  instructions that explain it reads as a bug.
*/

INSERT INTO telegram_step_deliveries (
  telegram_bot_id, subscriber_id, step_id, due_at, status, attempts, error_message, sent_at
)
SELECT
  subscriber.telegram_bot_id,
  subscriber.id,
  step.id,
  now() - interval '10 minutes' + (step.position * interval '1 second'),
  'pending',
  0,
  NULL,
  NULL
FROM telegram_subscribers subscriber
JOIN telegram_funnels funnel
  ON funnel.telegram_bot_id = subscriber.telegram_bot_id
JOIN telegram_funnel_steps step
  ON step.funnel_id = funnel.id
 AND step.is_active
WHERE lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
ON CONFLICT (subscriber_id, step_id) DO UPDATE
SET
  due_at = EXCLUDED.due_at,
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL;

/*
  The sequence is walked from the top, so the two marks that say it already
  happened are cleared as well. Left in place, `sequence_done_at` would make
  the reader look finished while nine messages were still on the way.
*/
UPDATE telegram_subscribers subscriber
SET
  delivered_at = NULL,
  sequence_done_at = NULL,
  updated_at = now()
FROM telegram_funnels funnel
WHERE funnel.telegram_bot_id = subscriber.telegram_bot_id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  );

-- ------------------------------------------------------------------------
-- 20260824001500_collapse_istanbul_prompt.sql
-- ------------------------------------------------------------------------

/*
  One prompt folded into an expandable quote, to see how it reads.

  The Istanbul prompt is the longest of the four — three and a half thousand
  characters — and it pushes the button that the whole message exists for two
  screens below the fold. Wrapped in `<blockquote expandable>` it collapses to
  a few lines with a "show more", and the button comes back into view.

  Done with `replace` rather than by restating the text: the prompt is the one
  thing in this funnel that must survive rewriting unaltered, and retyping
  three and a half thousand characters to add forty is how a stray character
  gets in.

  The tags cost nothing against Telegram's limit — the ceiling is measured on
  the parsed text, and markup is stripped before it counts.

  Left deliberately as a single step. If the fold reads well the other three
  follow, and the line that promises a one-tap copy has to change with them:
  the first tap will open the quote, and only the second will copy.
*/

UPDATE telegram_funnel_steps step
SET
  body = replace(
    replace(step.body, '<code>', '<blockquote expandable><code>'),
    '</code>',
    '</code></blockquote>'
  ),
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
  AND step.position = 7
  /* Only if it has not already been folded, so re-running cannot nest one
     quote inside another. */
  AND step.body LIKE '%<code>%'
  AND step.body NOT LIKE '%<blockquote%';

/*
  Send that one step again to the account that has to look at it. Only this
  step: the message after it waits a day, so nothing cascades.
*/
UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute',
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL
FROM telegram_subscribers subscriber, telegram_funnel_steps step, telegram_funnels funnel
WHERE delivery.subscriber_id = subscriber.id
  AND delivery.step_id = step.id
  AND step.funnel_id = funnel.id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
  AND step.position = 7;

-- ------------------------------------------------------------------------
-- 20260824002500_collapse_all_prompts.sql
-- ------------------------------------------------------------------------

/*
  The remaining three prompts folded the same way, and the instruction that
  described the old behaviour brought in line with the new one.

  A folded prompt costs one extra tap: the first opens the quote, the second
  copies. "Скопируется в один клик" was accurate while the prompt lay open and
  is not any more — and an instruction that describes something the reader
  does not see is worse than no instruction, because they stop trusting the
  rest of the list.

  Both edits are `replace` on the stored text rather than a rewrite: the
  prompts have to survive untouched, and the instruction line is identical in
  all four steps that carry it, so one substitution reaches every copy.

  Guarded against a second run — a prompt already inside a quote is skipped
  rather than wrapped twice.
*/

UPDATE telegram_funnel_steps step
SET
  body = replace(
    replace(step.body, '<code>', '<blockquote expandable><code>'),
    '</code>',
    '</code></blockquote>'
  ),
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
  AND step.position IN (3, 5, 9)
  AND step.body LIKE '%<code>%'
  AND step.body NOT LIKE '%<blockquote%';

UPDATE telegram_funnel_steps step
SET
  body = replace(
    step.body,
    '1. Нажми на промпт в следующем сообщении — он скопируется в один клик.',
    '1. Разверни промпт в следующем сообщении и нажми на текст — он скопируется целиком.'
  ),
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
  AND step.position IN (2, 4, 6, 8);

-- ------------------------------------------------------------------------
-- 20260824003500_replay_folded_sequence_for_owner.sql
-- ------------------------------------------------------------------------

/*
  The sequence again, from the top, for the account that has to approve it.

  Same shape as the first replay: every step becomes due a moment ago, a
  second apart in step order so the worker's batch keeps them in sequence, and
  the two marks that say this reader is finished are cleared so nothing counts
  them as done while nine messages are still on the way.

  Worth repeating in full rather than sending the four changed steps: what is
  being judged this time is the shape of the whole conversation — a folded
  prompt under an instruction that now describes folding — and that only reads
  properly in order.
*/

INSERT INTO telegram_step_deliveries (
  telegram_bot_id, subscriber_id, step_id, due_at, status, attempts, error_message, sent_at
)
SELECT
  subscriber.telegram_bot_id,
  subscriber.id,
  step.id,
  now() - interval '10 minutes' + (step.position * interval '1 second'),
  'pending',
  0,
  NULL,
  NULL
FROM telegram_subscribers subscriber
JOIN telegram_funnels funnel
  ON funnel.telegram_bot_id = subscriber.telegram_bot_id
JOIN telegram_funnel_steps step
  ON step.funnel_id = funnel.id
 AND step.is_active
WHERE lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
ON CONFLICT (subscriber_id, step_id) DO UPDATE
SET
  due_at = EXCLUDED.due_at,
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL;

UPDATE telegram_subscribers subscriber
SET
  delivered_at = NULL,
  sequence_done_at = NULL,
  updated_at = now()
FROM telegram_funnels funnel
WHERE funnel.telegram_bot_id = subscriber.telegram_bot_id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  );

-- ------------------------------------------------------------------------
-- 20260824004500_resend_folded_prompts.sql
-- ------------------------------------------------------------------------

/*
  Fold the three remaining prompts if they somehow are not folded, then send
  those three again.

  The reader reported one of them arriving unfolded. The likeliest reading is
  that they were looking at the copy from the earlier replay, which went out
  before the fold — the chat now holds two of everything. But "likeliest" is a
  guess, and the same statement that would fix a real miss also proves the
  guess when it changes nothing.

  The fold is written to be safe to run twice: a prompt already inside a quote
  fails the guard and is left alone.
*/

UPDATE telegram_funnel_steps step
SET
  body = replace(
    replace(step.body, '<code>', '<blockquote expandable><code>'),
    '</code>',
    '</code></blockquote>'
  ),
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
  AND step.position IN (3, 5, 9)
  AND step.body LIKE '%<code>%'
  AND step.body NOT LIKE '%<blockquote%';

/* Only the three in question: the rest of the sequence is already in the chat
   twice, and a third copy of all nine teaches nothing. */
UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute' + (step.position * interval '1 second'),
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL
FROM telegram_subscribers subscriber, telegram_funnel_steps step, telegram_funnels funnel
WHERE delivery.subscriber_id = subscriber.id
  AND delivery.step_id = step.id
  AND step.funnel_id = funnel.id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND (
    funnel.name ILIKE '10 пром%'
    OR funnel.name ILIKE '10 готов%'
    OR funnel.name ILIKE '1000+ пром%'
    OR funnel.name ILIKE '1000+ готов%'
  )
  AND step.position IN (3, 5, 9);

-- ------------------------------------------------------------------------
-- 20260824005500_fix_missed_fold_and_wording.sql
-- ------------------------------------------------------------------------

/*
  The two statements that quietly matched nothing.

  Folding the Istanbul prompt and rewording the four instruction steps both
  reported success and changed no rows — an UPDATE that matches nothing is not
  an error. The rows carry their proof: every step except 3, 5 and 9 still
  showed the timestamp of the migration that created it.

  Rewritten as plainly as the statement allows, with no commentary inside the
  WHERE clause and the funnel found by slug alone. Verified afterwards by
  reading the rows back rather than by trusting the word "applied".
*/

UPDATE telegram_funnel_steps step
SET
  body = replace(
    replace(step.body, '<code>', '<blockquote expandable><code>'),
    '</code>',
    '</code></blockquote>'
  ),
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND step.position = 7
  AND step.body LIKE '%<code>%'
  AND step.body NOT LIKE '%<blockquote%';

UPDATE telegram_funnel_steps step
SET
  body = replace(
    step.body,
    'Нажми на промпт в следующем сообщении — он скопируется в один клик.',
    'Разверни промпт в следующем сообщении и нажми на текст — он скопируется целиком.'
  ),
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND step.body LIKE '%скопируется в один клик%';

-- ------------------------------------------------------------------------
-- 20260824010500_resend_istanbul_pair.sql
-- ------------------------------------------------------------------------

/*
  The instruction and the prompt it explains, sent as a pair.

  Both halves changed since the reader last saw them — the wording on one, the
  fold on the other — and each only makes sense against the other: an
  instruction that says "разверни" is right or wrong depending on whether the
  message under it is folded.
*/

UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute' + (step.position * interval '1 second'),
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL
FROM telegram_subscribers subscriber, telegram_funnel_steps step, telegram_funnels funnel
WHERE delivery.subscriber_id = subscriber.id
  AND delivery.step_id = step.id
  AND step.funnel_id = funnel.id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND step.position IN (6, 7);

-- ------------------------------------------------------------------------
-- 20260824011500_rewrite_opening_message.sql
-- ------------------------------------------------------------------------

/*
  The opening message, rewritten.

  It keeps the two things the old one got right — the first line closes the
  promise the reader came here for, and the last one warns that two more
  messages follow, so they read as the promised continuation rather than as a
  bot talking to itself.

  What it gains is the reason to open the catalogue at all: every formula
  carries an example of what it produces. That is the difference between this
  and any list of prompts, and it was the one argument the opening never made.

  The number stays. It is in the Reels card, in the caption and in the Direct
  message, and an opening that answered «1000+» with «десятки» would read as a
  climbdown at the exact moment the reader is checking whether they were told
  the truth.

  Five hundred characters, which leaves room under Telegram's caption limit:
  this message carries the funnel's cover, and a caption over the limit would
  be split away from it.
*/

UPDATE telegram_funnel_steps step
SET
  body = E'Ты на месте! Доступ к 1000+ промптам открыт ✦\n\nФото, видео, дизайн, Reels, персонажи, реклама — под каждую задачу готовая формула, и к каждой пример результата. Видно, что получится, ещё до того, как ты нажмёшь «создать».\n\nНе нужно часами придумывать запрос с нуля: выбираешь то, что нравится → копируешь промпт → создаёшь своё.\n\nЖми кнопку, чтобы открыть каталог с фильтрами — и сразу сохрани его в закладки.\n\nА следующим сообщением пришлю первый промпт дня и инструмент, где его можно тут же протестировать 👇',
  updated_at = now()
FROM telegram_funnels funnel
WHERE step.funnel_id = funnel.id
  AND funnel.slug = 'prompts'
  AND step.position = 1;

-- ------------------------------------------------------------------------
-- 20260824012500_replay_full_path_for_owner.sql
-- ------------------------------------------------------------------------

/*
  The whole path again, in its finished state.

  Since the last full run every one of the nine changed: a new opening, four
  prompts folded into quotes, and four instructions rewritten to describe the
  fold. Judging that as a conversation needs it in order, from the top.
*/

INSERT INTO telegram_step_deliveries (
  telegram_bot_id, subscriber_id, step_id, due_at, status, attempts, error_message, sent_at
)
SELECT
  subscriber.telegram_bot_id,
  subscriber.id,
  step.id,
  now() - interval '10 minutes' + (step.position * interval '1 second'),
  'pending',
  0,
  NULL,
  NULL
FROM telegram_subscribers subscriber
JOIN telegram_funnels funnel
  ON funnel.telegram_bot_id = subscriber.telegram_bot_id
JOIN telegram_funnel_steps step
  ON step.funnel_id = funnel.id
 AND step.is_active
WHERE lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
ON CONFLICT (subscriber_id, step_id) DO UPDATE
SET
  due_at = EXCLUDED.due_at,
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL;

UPDATE telegram_subscribers subscriber
SET
  delivered_at = NULL,
  sequence_done_at = NULL,
  updated_at = now()
FROM telegram_funnels funnel
WHERE funnel.telegram_bot_id = subscriber.telegram_bot_id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts';

-- ------------------------------------------------------------------------
-- 20260824020000_prove_rearm_on_second_walk.sql
-- ------------------------------------------------------------------------

/*
  Puts the reader back at the top of the sequence with every later step still
  marked sent — the exact state that used to end the funnel after one message.

  With the scheduler fixed, sending step one is enough: the step that follows
  is re-armed from its own finished row instead of being silently skipped, and
  the walk carries on by itself.
*/

UPDATE telegram_step_deliveries delivery
SET
  due_at = now() - interval '1 minute',
  status = 'pending',
  attempts = 0,
  error_message = NULL,
  sent_at = NULL
FROM telegram_subscribers subscriber, telegram_funnel_steps step, telegram_funnels funnel
WHERE delivery.subscriber_id = subscriber.id
  AND delivery.step_id = step.id
  AND step.funnel_id = funnel.id
  AND lower(subscriber.username) = 'abaildaev'
  AND funnel.slug = 'prompts'
  AND step.position = 1;

-- ------------------------------------------------------------------------
-- 20260824030000_public_replies_without_spam_word.sql
-- ------------------------------------------------------------------------

/*
  The word «спам» out of the public replies.

  Two of the six told readers to look for the message in their spam folder,
  which labelled our own message as spam in public, under our own post. The
  fact behind it is real and worth keeping: Instagram files messages from
  accounts you do not follow in the Requests tab, for everyone, always — a
  reader who has never heard of that tab simply never sees the Direct.

  What changed is the framing. «Отфильтровали как мусор» and «Instagram кладёт
  письма от неподписанных отдельно» describe the same event, and only one of
  them costs the account anything. The first variant now explains why it
  happens, which turns an apology into an instruction.

  Three variants rather than six: the account owner picked the ones that carry
  the tip. Rotation is thinner, which matters only under a post with many
  comments in a row.
*/

UPDATE lead_magnets magnet
SET
  public_reply_variants = ARRAY[
    'Отправил в Direct! Если во входящих пусто — загляни во вкладку «Запросы»: туда Instagram кладёт сообщения от тех, на кого ты не подписан 📩',
    'Уже в личке! Не видно — проверь «Запросы» в Direct 👀',
    'Отправил! Если не всплыло — сообщение ждёт в «Запросах» 📨'
  ],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);

-- ------------------------------------------------------------------------
-- 20260824031000_six_public_replies.sql
-- ------------------------------------------------------------------------

/*
  Back to six variants.

  Three carry the Requests tip and three do not. Identical text under every
  comment is the single loudest automation signal a post can carry, and three
  variants is the floor of what rotation needs — under a post with a run of
  comments the repeat starts showing.

  Mixing plain ones in also spares the readers who follow the account: their
  Direct arrives in the main inbox, and a note about where to dig for it is
  noise they do not need.
*/

UPDATE lead_magnets magnet
SET
  public_reply_variants = ARRAY[
    'Отправил в Direct! Если во входящих пусто — загляни во вкладку «Запросы»: туда Instagram кладёт сообщения от тех, на кого ты не подписан 📩',
    'Уже в личке! Не видно — проверь «Запросы» в Direct 👀',
    'Отправил! Если не всплыло — сообщение ждёт в «Запросах» 📨',
    'Отправил в Direct, лови 🙌',
    'Улетело в личку 🚀',
    'Готово, проверяй Direct 👇'
  ],
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);

-- ------------------------------------------------------------------------
-- 20260824040000_direct_trigger_needs_contains.sql
-- ------------------------------------------------------------------------

/*
  The keyword has to be findable inside a sentence now.

  With the call to action moved from comments to Direct, `exact` stops being a
  reasonable rule: under a post people type the code word and nothing else,
  but in a private message they write to a person — «привет, промпт»,
  «промпт пожалуйста». Every one of those was being dropped.

  `contains` matches the word anywhere in the message and allows up to three
  letters of Russian inflection after it. «ПРОМПТ» was checked against the
  ordinary things people write and stays clean: it catches «промпты»,
  «промптом» and «а какой промпт?» — all of them requests — and does not fire
  on any common word that merely starts the same way.
*/

UPDATE lead_magnets magnet
SET
  match_mode = 'contains',
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM telegram_funnels funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);
