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
