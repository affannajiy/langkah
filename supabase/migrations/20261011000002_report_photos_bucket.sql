-- Storage bucket for report photos (guide Section 7.4: about 1280 px JPEG at 70%).
-- Public read, because report photos are shown to everyone in Community.
-- File names are random UUIDs, never the user id, so a photo URL does not identify the reporter.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS on. Only full (non-guest) users upload, and only
-- the uploader may replace or delete their file. owner_id is set by Storage itself.
create policy "Signed-in users upload report photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-photos' and public.is_full_user());

create policy "Uploaders update their report photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'report-photos' and owner_id = (select auth.uid())::text);

create policy "Uploaders delete their report photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-photos' and owner_id = (select auth.uid())::text);
