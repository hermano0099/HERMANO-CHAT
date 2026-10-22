-- Registrazioni push private per utente e deduplicazione degli invii.
begin;

create table if not exists public.expo_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expo_push_tokens enable row level security;

drop policy if exists "Gestisci i tuoi token push" on public.expo_push_tokens;
create policy "Gestisci i tuoi token push" on public.expo_push_tokens
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.expo_push_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.expo_push_tokens to authenticated;
grant select, delete on public.expo_push_tokens to service_role;

create table if not exists public.message_push_deliveries (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_push_deliveries enable row level security;
revoke all on public.message_push_deliveries from public, anon, authenticated;
grant select, insert, delete on public.message_push_deliveries to service_role;

commit;
