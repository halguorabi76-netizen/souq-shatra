-- Profile photos for customers and delivery drivers (merchants keep their store image).
-- One public image per account at avatars/<user id>/avatar.jpg; only its owner can write it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- The bucket is public, so anyone can open a photo by its URL; listing is limited to one's own folder.
create policy "users read own avatar folder" on storage.objects for select
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "users upload own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "users replace own avatar" on storage.objects for update
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "users delete own avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
