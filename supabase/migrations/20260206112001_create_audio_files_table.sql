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
