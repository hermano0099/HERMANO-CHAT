-- Azioni messaggi senza cancellare contenuti: la rimozione è logica.
begin;

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists forwarded_from_message_id uuid;

alter table public.messages
  drop constraint if exists messages_forwarded_from_message_id_fkey;

alter table public.messages enable row level security;

drop policy if exists "Elimina solo propri messaggi" on public.messages;
drop policy if exists "Modifica ed elimina logicamente i propri messaggi" on public.messages;
create policy "Modifica ed elimina logicamente i propri messaggi" on public.messages
for update to authenticated
using (
  author_id = (select auth.uid())
  and public.is_member(conversation_id)
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.kind <> 'channel' or c.owner_id = (select auth.uid()))
  )
)
with check (
  author_id = (select auth.uid())
  and public.is_member(conversation_id)
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.kind <> 'channel' or c.owner_id = (select auth.uid()))
  )
);

drop policy if exists "message_update_boundary" on public.messages;
create policy "message_update_boundary" on public.messages
as restrictive
for update to authenticated
using (
  author_id = (select auth.uid())
  and public.is_member(conversation_id)
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.kind <> 'channel' or c.owner_id = (select auth.uid()))
  )
  and deleted_at is null
)
with check (
  author_id = (select auth.uid())
  and public.is_member(conversation_id)
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.kind <> 'channel' or c.owner_id = (select auth.uid()))
  )
);

create or replace function public.guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'Un messaggio eliminato non può essere modificato';
  end if;

  if (select auth.uid()) is null
    or (select auth.uid()) is distinct from old.author_id
    or not public.is_member(old.conversation_id) then
    raise exception 'Non autorizzato a modificare questo messaggio';
  end if;

  if exists (
    select 1
    from public.conversations c
    where c.id = old.conversation_id
      and c.kind = 'channel'
      and c.owner_id is distinct from (select auth.uid())
  ) then
    raise exception 'Solo il proprietario del canale può modificare i messaggi';
  end if;

  if new.id is distinct from old.id
    or new.conversation_id is distinct from old.conversation_id
    or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at
    or new.reply_to_message_id is distinct from old.reply_to_message_id
    or new.media_path is distinct from old.media_path
    or new.media_type is distinct from old.media_type
    or new.media_duration_ms is distinct from old.media_duration_ms
    or new.forwarded_from_message_id is distinct from old.forwarded_from_message_id then
    raise exception 'I dati originali del messaggio non possono essere alterati';
  end if;

  if new.edited_at is distinct from old.edited_at then
    raise exception 'La data di modifica è gestita dal database';
  end if;

  if new.body is distinct from old.body then
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'Il contenuto non può essere modificato durante l’eliminazione';
    end if;
    new.edited_at := now();
  elsif new.deleted_at is distinct from old.deleted_at then
    if new.deleted_at is null then
      raise exception 'Un messaggio eliminato non può essere ripristinato';
    end if;
    new.deleted_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.initialize_message_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.edited_at := null;
  new.deleted_at := null;
  return new;
end;
$$;

create or replace function public.validate_message_forward_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_conversation_id uuid;
  source_deleted_at timestamptz;
begin
  if new.forwarded_from_message_id is null then
    return new;
  end if;

  select m.conversation_id, m.deleted_at
    into source_conversation_id, source_deleted_at
    from public.messages m
   where m.id = new.forwarded_from_message_id;

  if not found
    or source_deleted_at is not null
    or not public.is_member(source_conversation_id) then
    raise exception 'Messaggio originale non disponibile per l’inoltro';
  end if;

  return new;
end;
$$;

drop trigger if exists initialize_message_metadata on public.messages;
create trigger initialize_message_metadata
before insert on public.messages
for each row execute function public.initialize_message_metadata();

drop trigger if exists validate_message_forward_source on public.messages;
create trigger validate_message_forward_source
before insert on public.messages
for each row execute function public.validate_message_forward_source();

drop trigger if exists guard_message_update on public.messages;
create trigger guard_message_update
before update on public.messages
for each row execute function public.guard_message_update();

revoke delete on public.messages from authenticated;
revoke delete on public.messages from public, anon;
revoke update on public.messages from public, anon, authenticated;
revoke update (
  id,
  conversation_id,
  author_id,
  body,
  created_at,
  reply_to_message_id,
  media_path,
  media_type,
  media_duration_ms,
  edited_at,
  deleted_at,
  forwarded_from_message_id
) on public.messages from public, anon, authenticated;
grant update (body, deleted_at) on public.messages to authenticated;

commit;
