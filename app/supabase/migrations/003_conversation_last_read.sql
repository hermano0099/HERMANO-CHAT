alter table public.conversation_members
  add column if not exists last_read_at timestamptz;

update public.conversation_members
set last_read_at = coalesce(last_read_at, joined_at, now())
where last_read_at is null;

alter table public.conversation_members
  alter column last_read_at set default now();

revoke update on public.conversation_members from authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

drop policy if exists "Aggiorna ultimo messaggio letto" on public.conversation_members;
create policy "Aggiorna ultimo messaggio letto" on public.conversation_members
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
