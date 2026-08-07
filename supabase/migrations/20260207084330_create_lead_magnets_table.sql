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
