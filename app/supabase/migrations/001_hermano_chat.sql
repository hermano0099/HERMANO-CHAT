-- HERMANO CHAT: prima migrazione per un progetto Supabase VUOTO.
-- Non eseguire su un database con tabelle omonime senza effettuare un backup.
-- Tutte le tabelle pubbliche hanno RLS. Eseguire nel SQL Editor come amministratore.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,25}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm','group','channel')),
  title text not null default '' check (char_length(title) <= 80),
  description text not null default '' check (char_length(description) <= 500),
  is_public boolean not null default false,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((kind = 'dm' and is_public = false) or kind <> 'dm'),
  check (kind = 'dm' or char_length(trim(title)) > 0)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index idx_messages_conv_created on public.messages(conversation_id, created_at desc);
create index idx_members_user on public.conversation_members(user_id);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  address text not null check (char_length(address) between 4 and 220),
  description text not null default '' check (char_length(description) <= 700),
  website text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  sponsored boolean not null default false,
  submitted_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_restaurants_approved on public.restaurants(status);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  target_message_id uuid references public.messages(id) on delete set null,
  reason text not null check (char_length(reason) between 4 and 500),
  created_at timestamptz not null default now(),
  check (target_user_id is not null or target_message_id is not null)
);

-- Funzioni RLS: usano SOLO auth.uid() e non accettano id utente arbitrari.
-- SECURITY DEFINER evita ricorsione nelle policy di conversation_members.
create or replace function public.is_member(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members
    where conversation_id = p_id and user_id = (select auth.uid()));
$$;

create or replace function public.is_owner(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations
    where id = p_id and owner_id = (select auth.uid()));
$$;

create or replace function public.is_public_conversation(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations
    where id = p_id and is_public = true and kind <> 'dm');
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;

create or replace function public.can_post(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_id
      and exists (select 1 from public.conversation_members me
                  where me.conversation_id = c.id and me.user_id = (select auth.uid()))
      and (c.kind <> 'channel' or c.owner_id = (select auth.uid()))
      and not exists (
        select 1 from public.conversation_members other
        join public.blocks b on
            (b.blocker_id = (select auth.uid()) and b.blocked_id = other.user_id)
         or (b.blocked_id = (select auth.uid()) and b.blocker_id = other.user_id)
        where other.conversation_id = c.id
          and other.user_id <> (select auth.uid())
          and c.kind = 'dm'
      )
  );
$$;

-- Profilo creato automaticamente dopo Auth Sign Up.
create or replace function public.create_profile_on_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user_' || replace(left(new.id::text, 12), '-', ''),
    coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'), 60), ''), 'Nuovo utente')
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_on_signup();

create or replace function public.add_creator_as_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversation_members(conversation_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
create trigger on_conversation_created after insert on public.conversations
for each row execute function public.add_creator_as_member();

create or replace function public.limit_dm_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text;
begin
  select kind into v_kind from public.conversations where id = new.conversation_id;
  if v_kind = 'dm' and (select count(*) from public.conversation_members where conversation_id = new.conversation_id) >= 2 then
    raise exception 'Una chat privata non può avere più di due partecipanti';
  end if;
  return new;
end;
$$;
create trigger before_member_add before insert on public.conversation_members
for each row execute function public.limit_dm_members();

-- Restrizioni extra: impediscono di cambiare owner, privacy o tipo attraverso UPDATE.
create or replace function public.guard_conversation_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id or new.kind is distinct from old.kind then
    raise exception 'Impossibile cambiare proprietario o tipo';
  end if;
  return new;
end;
$$;
create trigger guard_conversation before update on public.conversations
for each row execute function public.guard_conversation_update();

-- Row Level Security.
alter table public.profiles enable row level security;
alter table public.app_admins enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.blocks enable row level security;
alter table public.messages enable row level security;
alter table public.restaurants enable row level security;
alter table public.reports enable row level security;

create policy "Profili consultabili dai registrati" on public.profiles
for select to authenticated using (true);
create policy "Modifica solo il tuo profilo" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Admin vede proprio ruolo" on public.app_admins
for select to authenticated using (user_id = (select auth.uid()));

create policy "Vedi conversazioni tue o pubbliche" on public.conversations
for select to authenticated using (public.is_member(id) or is_public);
create policy "Crea conversazioni a tuo nome" on public.conversations
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Modifica solo le tue conversazioni" on public.conversations
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Vedi membri delle tue conversazioni" on public.conversation_members
for select to authenticated using (public.is_member(conversation_id));
create policy "Entra in gruppo pubblico o invita come owner" on public.conversation_members
for insert to authenticated with check (
  role = 'member' and
  ((user_id = (select auth.uid()) and public.is_public_conversation(conversation_id))
   or public.is_owner(conversation_id))
);
create policy "Esci o rimuovi membro se owner" on public.conversation_members
for delete to authenticated using (
  role = 'member' and ((user_id = (select auth.uid())) or public.is_owner(conversation_id))
);

create policy "Vedi i tuoi blocchi" on public.blocks
for select to authenticated using (blocker_id = (select auth.uid()));
create policy "Blocca tu" on public.blocks
for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "Sblocca tu" on public.blocks
for delete to authenticated using (blocker_id = (select auth.uid()));

create policy "Messaggi solo ai membri" on public.messages
for select to authenticated using (public.is_member(conversation_id));
create policy "Invia solo se autorizzato" on public.messages
for insert to authenticated with check (
  author_id = (select auth.uid()) and public.can_post(conversation_id)
);
create policy "Elimina solo propri messaggi" on public.messages
for delete to authenticated using (author_id = (select auth.uid()) and public.is_member(conversation_id));

create policy "Ristoranti approvati o propri o admin" on public.restaurants
for select to authenticated using (
  status = 'approved' or submitted_by = (select auth.uid()) or public.is_app_admin()
);
create policy "Proponi locale in attesa" on public.restaurants
for insert to authenticated with check (
  submitted_by = (select auth.uid()) and status = 'pending'
  and sponsored = false and reviewed_by is null and reviewed_at is null
);

create policy "Vedi tue segnalazioni o admin" on public.reports
for select to authenticated using (reporter_id = (select auth.uid()) or public.is_app_admin());
create policy "Segnala come utente autenticato" on public.reports
for insert to authenticated with check (reporter_id = (select auth.uid()));

-- Solo questa RPC, dopo aver verificato la whitelist, approva/rifiuta ristoranti.
create or replace function public.review_restaurant(p_restaurant uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Non autorizzato'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Stato non valido'; end if;
  update public.restaurants set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_restaurant;
end;
$$;

-- Permessi espliciti: rimuove i GRANT predefiniti (i trigger SECURITY DEFINER operano come owner).
revoke all on public.profiles, public.app_admins, public.conversations,
  public.conversation_members, public.blocks, public.messages,
  public.restaurants, public.reports from anon, authenticated;

-- Concedi esclusivamente le operazioni previste.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.app_admins to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert, delete on public.conversation_members to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert on public.restaurants to authenticated;
grant select, insert on public.reports to authenticated;
grant execute on function public.review_restaurant(uuid,text) to authenticated;

-- Postgres Changes: compatibile con Expo Go e adatto al primo MVP.
-- Per molti utenti, valutare Supabase Realtime Broadcast e stress test.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversation_members;

-- IMPORTANTE: nomina l'admin solo DOPO aver creato il primo utente nell'app:
-- insert into public.app_admins(user_id)
-- select id from public.profiles where username = 'USERNAME_SCEGLI';
