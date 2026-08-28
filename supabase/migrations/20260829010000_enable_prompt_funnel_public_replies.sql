/*
  The prompt funnel must acknowledge a successful Direct delivery under the
  original Instagram comment.  The profile-link experiment migration disabled
  that acknowledgement while changing the delivery variants, which made a
  healthy DM send look like a missed automation to both the creator and lead.

  This affects future matched comments only.  Existing comments are not
  replayed, so enabling it cannot create a burst of duplicate replies.
*/
UPDATE public.lead_magnets AS magnet
SET
  public_reply_enabled = true,
  updated_at = now()
WHERE magnet.id IN (
  SELECT funnel.lead_magnet_id
  FROM public.telegram_funnels AS funnel
  WHERE funnel.slug = 'prompts'
    AND funnel.lead_magnet_id IS NOT NULL
);
