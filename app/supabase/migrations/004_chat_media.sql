-- Media privati per le chat: applicare dopo le migration 001, 002 e 003.
begin;

alter table public.messages
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.messages
  drop constraint if exists messages_media_type_check,
  add constraint messages_media_type_check
    check (media_type is null or media_type in ('image', 'video')),
  drop constraint if exists messages_media_pair_check,
  add constraint messages_media_pair_check
    check ((media_path is null and media_type is null) or (media_path is not null and media_type is not null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm', 'video/x-m4v'
  ]
)
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id = 'chat-media'
      and (
        public
        or (file_size_limit is not null and file_size_limit < 52428800)
        or (
          allowed_mime_types is not null
          and not (allowed_mime_types @> array[
            'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
            'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm', 'video/x-m4v'
          ])
        )
      )
  ) then
    raise exception 'Il bucket chat-media esiste ma ha impostazioni incompatibili. Verifica bucket privato, limite di almeno 50 MB e MIME type supportati.';
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
