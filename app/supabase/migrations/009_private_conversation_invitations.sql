-- Gli inviti ai gruppi e canali privati richiedono l'accettazione del destinatario.
begin;

create table if not exists public.conversation_invitations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (invited_user_id <> invited_by)
);

create unique index if not exists conversation_invitations_pending_unique
  on public.conversation_invitations(conversation_id, invited_user_id)
  where status = 'pending';

alter table public.conversation_invitations enable row level security;

drop policy if exists "Leggi inviti ricevuti o gestiti" on public.conversation_invitations;
create policy "Leggi inviti ricevuti o gestiti" on public.conversation_invitations
for select to authenticated
using (invited_user_id = (select auth.uid()) or public.is_owner(conversation_id));

drop policy if exists "I proprietari invitano alle community private" on public.conversation_invitations;
create policy "I proprietari invitano alle community private" on public.conversation_invitations
for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and public.is_owner(conversation_id)
  and not public.is_public_conversation(conversation_id)
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.kind in ('group', 'channel')
  )
  and not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversation_id and m.user_id = invited_user_id
  )
);

drop policy if exists "Annulla invito ricevuto o inviato" on public.conversation_invitations;
create policy "Annulla invito ricevuto o inviato" on public.conversation_invitations
for delete to authenticated
using (
  (invited_user_id = (select auth.uid()) and status = 'pending')
  or (invited_by = (select auth.uid()) and public.is_owner(conversation_id) and status = 'pending')
);

revoke all on public.conversation_invitations from public, anon, authenticated;
grant select, insert, delete on public.conversation_invitations to authenticated;

drop policy if exists "Vedi conversazioni tue o pubbliche" on public.conversations;
drop policy if exists "Vedi conversazioni tue, pubbliche o invitate" on public.conversations;
create policy "Vedi conversazioni tue, pubbliche o invitate" on public.conversations
for select to authenticated
using (
  public.is_member(id)
  or is_public
  or exists (
    select 1 from public.conversation_invitations i
    where i.conversation_id = conversations.id
      and i.invited_user_id = (select auth.uid())
      and i.status = 'pending'
  )
);

drop policy if exists "Entra in gruppo pubblico o invita come owner" on public.conversation_members;
create policy "Entra in gruppo pubblico o invita come owner" on public.conversation_members
for insert to authenticated
with check (
  role = 'member'
  and (
    (user_id = (select auth.uid()) and public.is_public_conversation(conversation_id))
    or (public.is_owner(conversation_id) and public.is_public_conversation(conversation_id))
  )
);

create or replace function public.respond_to_conversation_invitation(p_invitation uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.conversation_invitations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticazione richiesta';
  end if;
  if p_accept is null then
    raise exception 'Scelta di risposta non valida';
  end if;

  select * into invitation
  from public.conversation_invitations
  where id = p_invitation
  for update;

  if not found or invitation.invited_user_id is distinct from (select auth.uid()) then
    raise exception 'Invito non trovato o non autorizzato';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'L’invito è già stato gestito';
  end if;

  if p_accept then
    insert into public.conversation_members(conversation_id, user_id, role)
    values (invitation.conversation_id, invitation.invited_user_id, 'member')
    on conflict (conversation_id, user_id) do nothing;
  end if;

  update public.conversation_invitations
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = p_invitation;

  return invitation.conversation_id;
end;
$$;

grant execute on function public.respond_to_conversation_invitation(uuid, boolean) to authenticated;
revoke all on function public.respond_to_conversation_invitation(uuid, boolean) from public, anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_invitations'
  ) then
    alter publication supabase_realtime add table public.conversation_invitations;
  end if;
end;
$$;

commit;
