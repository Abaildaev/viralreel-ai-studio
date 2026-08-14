ALTER TABLE lead_magnets
  ADD COLUMN IF NOT EXISTS button_text text NOT NULL DEFAULT 'Получить материал';
