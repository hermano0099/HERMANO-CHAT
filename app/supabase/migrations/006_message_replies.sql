-- Risposte a messaggi nella stessa conversazione.
begin;

alter table public.messages
  add column if not exists reply_to_message_id uuid
    references public.messages(id) on delete set null;

create or replace function public.validate_message_reply_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced_conversation_id uuid;
begin
  if new.reply_to_message_id is null then
    return new;
  end if;

  select conversation_id
    into referenced_conversation_id
    from public.messages
    where id = new.reply_to_message_id;

  if referenced_conversation_id is null then
    raise exception 'Messaggio citato non trovato o non accessibile';
  end if;

  if referenced_conversation_id <> new.conversation_id then
    raise exception 'Il messaggio citato appartiene a un''altra conversazione';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_message_reply_conversation on public.messages;
create trigger validate_message_reply_conversation
before insert or update of reply_to_message_id, conversation_id on public.messages
for each row execute function public.validate_message_reply_conversation();

commit;