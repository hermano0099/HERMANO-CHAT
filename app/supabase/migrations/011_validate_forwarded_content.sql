begin;

create or replace function public.validate_message_forward_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_conversation_id uuid;
  source_deleted_at timestamptz;
  source_body text;
  source_media_type text;
  source_media_duration_ms integer;
begin
  if new.forwarded_from_message_id is null then
    return new;
  end if;

  select m.conversation_id, m.deleted_at, m.body, m.media_type, m.media_duration_ms
    into source_conversation_id, source_deleted_at, source_body, source_media_type, source_media_duration_ms
    from public.messages m
   where m.id = new.forwarded_from_message_id
   for share;

  if not found
    or source_deleted_at is not null
    or not public.is_member(source_conversation_id) then
    raise exception 'Messaggio originale non disponibile per l’inoltro';
  end if;

  if new.body is distinct from source_body
    or new.media_type is distinct from source_media_type
    or new.media_duration_ms is distinct from source_media_duration_ms then
    raise exception 'Il contenuto inoltrato non corrisponde al messaggio originale';
  end if;

  return new;
end;
$$;

commit;
