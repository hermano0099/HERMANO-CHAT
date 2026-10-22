-- Elimina dati personali dell'account mantenendo i contributi pubblici anonimizzati.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.account_deletion_context (
  user_id uuid not null,
  transaction_id bigint not null,
  primary key (user_id, transaction_id)
);
revoke all on private.account_deletion_context from public, anon, authenticated;

alter table public.restaurants alter column submitted_by drop not null;

create or replace function public.guard_conversation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
    and not exists (
      select 1
      from private.account_deletion_context d
      where d.user_id = old.owner_id
        and d.transaction_id = txid_current()
    ) then
    raise exception 'Impossibile cambiare proprietario';
  end if;

  if new.kind is distinct from old.kind then
    raise exception 'Impossibile cambiare il tipo di conversazione';
  end if;

  return new;
end;
$$;

create or replace function public.prepare_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned record;
begin
  insert into private.account_deletion_context(user_id, transaction_id)
  values (old.id, txid_current());

  delete from public.messages where author_id = old.id;
  delete from public.reports where reporter_id = old.id;
  update public.reports set target_user_id = null where target_user_id = old.id;
  update public.restaurants
    set submitted_by = null,
        reviewed_by = case when reviewed_by = old.id then null else reviewed_by end
    where submitted_by = old.id or reviewed_by = old.id;

  for owned in
    select c.id,
      (
        select m.user_id
        from public.conversation_members m
        where m.conversation_id = c.id and m.user_id <> old.id
        order by m.joined_at, m.user_id
        limit 1
      ) as replacement_owner
    from public.conversations c
    where c.owner_id = old.id
  loop
    if owned.replacement_owner is null then
      delete from public.conversations where id = owned.id;
    else
      update public.conversations
      set owner_id = owned.replacement_owner
      where id = owned.id;

      update public.conversation_members
      set role = 'owner'
      where conversation_id = owned.id and user_id = owned.replacement_owner;
    end if;
  end loop;

  delete from private.account_deletion_context
  where user_id = old.id and transaction_id = txid_current();
  return old;
end;
$$;

drop trigger if exists prepare_profile_deletion on public.profiles;
create trigger prepare_profile_deletion
before delete on public.profiles
for each row execute function public.prepare_profile_deletion();

create index if not exists messages_author_media_idx
  on public.messages(author_id)
  where media_path is not null;

commit;
