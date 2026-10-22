-- Messaggi vocali privati. Applicare dopo 004_chat_media.sql nel SQL Editor Supabase.
begin;

alter table public.messages
  add column if not exists media_duration_ms integer;

alter table public.messages
  drop constraint if exists messages_media_type_check,
  add constraint messages_media_type_check
    check (media_type is null or media_type in ('image', 'video', 'audio')),
  drop constraint if exists messages_media_pair_check,
  add constraint messages_media_pair_check
    check (
      (media_path is null and media_type is null and media_duration_ms is null)
      or (
        media_path is not null
        and media_type is not null
        and (
          (media_type = 'audio' and media_duration_ms > 0)
          or (media_type in ('image', 'video') and media_duration_ms is null)
        )
      )
    );

update storage.buckets as b
set file_size_limit = greatest(coalesce(b.file_size_limit, 52428800), 52428800),
    allowed_mime_types = (
      select array_agg(mime_type order by mime_type)
      from (
        select distinct mime_type
        from unnest(
          coalesce(b.allowed_mime_types, array[]::text[])
          || array[
            'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
            'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm', 'video/x-m4v',
            'audio/mp4', 'audio/webm'
          ]::text[]
        ) as supported(mime_type)
      ) as mime_types
    )
where b.id = 'chat-media';

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'chat-media') then
    raise exception 'Bucket chat-media non trovato. Applica prima la migration 004_chat_media.sql.';
  end if;
  if exists (select 1 from storage.buckets where id = 'chat-media' and public) then
    raise exception 'Il bucket chat-media deve essere privato.';
  end if;
end;
$$;

drop policy if exists "I membri vedono i media della conversazione" on storage.objects;
create policy "I membri vedono i media della conversazione"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and public.is_member(c.id)
  )
);

drop policy if exists "I membri caricano i propri media" on storage.objects;
create policy "I membri caricano i propri media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and public.can_post(c.id)
  )
);

drop policy if exists "Gli autori eliminano i propri media" on storage.objects;
create policy "Gli autori eliminano i propri media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and public.is_member(c.id)
  )
);

commit;
