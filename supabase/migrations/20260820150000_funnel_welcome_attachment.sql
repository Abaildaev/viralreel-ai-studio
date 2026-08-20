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
