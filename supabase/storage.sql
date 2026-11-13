-- ============================================================================
-- Tyche — Phase 2: photo storage
-- Run once in Supabase → SQL Editor (after schema.sql). Safe to re-run.
--
-- Creates a "media" bucket for profile photos, challenge photos, chat images
-- and result evidence. Each user can only upload into their own folder
-- (<user id>/...). Files are served from public URLs with unguessable names.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tyche media: upload to own folder" on storage.objects;
create policy "tyche media: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tyche media: update own files" on storage.objects;
create policy "tyche media: update own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tyche media: delete own files" on storage.objects;
create policy "tyche media: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
