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
