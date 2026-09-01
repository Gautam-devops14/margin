-- ============================================================================
-- Margin — database schema
-- Paste this WHOLE file into the Supabase SQL Editor and press Run.
-- It is safe to run more than once (it drops and recreates its own policies).
-- ============================================================================

-- ---------------------------------------------------------------- tables ---

create table if not exists notes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  subject_id          text not null,
  chapter             text not null default '',
  topic               text not null default '',
  title               text default '',
  content             text default '',            -- HTML from the editor
  questions           jsonb,                      -- cached AI doubting questions
  share_with_friends  boolean not null default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Older installs might miss newer columns; add them in place safely.
alter table notes add column if not exists chapter text not null default '';
alter table notes add column if not exists topic   text not null default '';
alter table notes add column if not exists share_with_friends boolean not null default false;

create index if not exists notes_user_subject_idx on notes (user_id, subject_id, updated_at desc);

create table if not exists note_shares (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references notes on delete cascade,
  code        text unique not null,
  permission  text not null default 'view' check (permission in ('view','edit')),
  created_by  uuid not null references auth.users on delete cascade,
  created_at  timestamptz default now()
);
create unique index if not exists note_shares_note_perm_idx on note_shares (note_id, permission);

create table if not exists shared_access (
  note_id     uuid not null references notes on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  permission  text not null default 'view' check (permission in ('view','edit')),
  created_at  timestamptz default now(),
  primary key (note_id, user_id)
);

create table if not exists friends (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  friend_email text not null,
  status       text not null default 'accepted',
  created_at   timestamptz default now(),
  unique (user_id, friend_email)
);

alter table notes         enable row level security;
alter table note_shares   enable row level security;
alter table shared_access enable row level security;
alter table friends       enable row level security;

-- ------------------------------------------------------------- helpers -----

create or replace function public.owns_note(p_note uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from notes n where n.id = p_note and n.user_id = auth.uid());
$$;

create or replace function public.note_permission(p_note uuid)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select sa.permission from shared_access sa
  where sa.note_id = p_note and sa.user_id = auth.uid();
$$;

-- ------------------------------------------------------------ policies -----

drop policy if exists notes_owner_all     on notes;
drop policy if exists notes_shared_read   on notes;
drop policy if exists notes_shared_edit   on notes;
drop policy if exists notes_friends_read  on notes;

-- 1. Owner does anything with their own notes.
create policy notes_owner_all on notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Anyone the note was shared with via code can read it.
create policy notes_shared_read on notes
  for select using (
    exists (
      select 1 from shared_access sa
      where sa.note_id = notes.id and sa.user_id = auth.uid()
    )
  );

-- 3. Friends can read notes where share_with_friends is TRUE.
create policy notes_friends_read on notes
  for select using (
    share_with_friends = true and exists (
      select 1 from friends f
      where f.user_id = notes.user_id
        and lower(f.friend_email) = lower(auth.jwt() ->> 'email')
    )
  );

-- 4. Admin account has FULL ACCESS to read, create, edit, and manage notes
drop policy if exists notes_admin_read on notes;
drop policy if exists notes_admin_all on notes;

create policy notes_admin_all on notes
  for all using (
    lower(auth.jwt() ->> 'email') in ('gmkicoding159@gmail.com', 'gmkicoding@admin.com')
    or lower(auth.jwt() ->> 'email') like '%phone_9999999999%'
    or lower(auth.jwt() ->> 'email') like '%phone_1234567890%'
  ) with check (
    lower(auth.jwt() ->> 'email') in ('gmkicoding159@gmail.com', 'gmkicoding@admin.com')
    or lower(auth.jwt() ->> 'email') like '%phone_9999999999%'
    or lower(auth.jwt() ->> 'email') like '%phone_1234567890%'
  );

-- 4. Only an 'edit' share can update it.
create policy notes_shared_edit on notes
  for update using (
    exists (
      select 1 from shared_access sa
      where sa.note_id = notes.id and sa.user_id = auth.uid() and sa.permission = 'edit'
    )
  )
  with check (
    exists (
      select 1 from shared_access sa
      where sa.note_id = notes.id and sa.user_id = auth.uid() and sa.permission = 'edit'
    )
  );

drop policy if exists shares_owner_read   on note_shares;
drop policy if exists shares_read         on note_shares;
drop policy if exists shares_owner_insert on note_shares;
drop policy if exists shares_owner_delete on note_shares;

create policy shares_owner_read on note_shares
  for select using (auth.uid() = created_by);

create policy shares_owner_insert on note_shares
  for insert with check (auth.uid() = created_by);

create policy shares_owner_delete on note_shares
  for delete using (auth.uid() = created_by);

drop policy if exists access_own_read      on shared_access;
drop policy if exists access_owner_read    on shared_access;
drop policy if exists access_self_insert   on shared_access;
drop policy if exists access_self_delete   on shared_access;
drop policy if exists access_owner_delete  on shared_access;

create policy access_own_read on shared_access
  for select using (auth.uid() = user_id);

create policy access_owner_read on shared_access
  for select using (
    exists (
      select 1 from note_shares ns
      where ns.note_id = shared_access.note_id and ns.created_by = auth.uid()
    )
  );

create policy access_self_delete on shared_access
  for delete using (auth.uid() = user_id);

create policy access_owner_delete on shared_access
  for delete using (
    exists (
      select 1 from note_shares ns
      where ns.note_id = shared_access.note_id and ns.created_by = auth.uid()
    )
  );

-- FRIENDS POLICIES
drop policy if exists friends_owner_all on friends;
drop policy if exists friends_user_read on friends;

create policy friends_owner_all on friends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy friends_user_read on friends
  for select using (lower(friend_email) = lower(auth.jwt() ->> 'email'));

-- -------------------------------------------------------- join by code -----

create or replace function public.join_note_by_code(p_code text)
returns table (note_id uuid, permission text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare s record;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  select ns.note_id, ns.permission, n.user_id
    into s
    from note_shares ns
    join notes n on n.id = ns.note_id
   where upper(ns.code) = upper(btrim(p_code));

  if not found then
    raise exception 'No note found for that code';
  end if;

  if s.user_id = auth.uid() then
    raise exception 'That is your own note';
  end if;

  insert into shared_access (note_id, user_id, permission)
  values (s.note_id, auth.uid(), s.permission)
  on conflict (note_id, user_id) do update set permission = excluded.permission;

  return query select s.note_id, s.permission;
end;
$$;

revoke all on function public.join_note_by_code(text) from public;
grant execute on function public.join_note_by_code(text) to authenticated;

-- ------------------------------------------------------- share a note ------

create or replace function public.share_note(p_note uuid, p_permission text)
returns text
language plpgsql security definer
set search_path = public, pg_temp as $$
declare c text; tries int := 0;
begin
  if not public.owns_note(p_note) then
    raise exception 'Not your note';
  end if;
  if p_permission not in ('view','edit') then
    raise exception 'Permission must be view or edit';
  end if;

  select code into c from note_shares
   where note_id = p_note and permission = p_permission;
  if found then return c; end if;

  loop
    tries := tries + 1;
    c := (select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
                                   1 + floor(random()*32)::int, 1), '')
          from generate_series(1,6));
    begin
      insert into note_shares (note_id, code, permission, created_by)
      values (p_note, c, p_permission, auth.uid());
      return c;
    exception when unique_violation then
      if tries > 12 then raise exception 'Could not make a code, try again'; end if;
    end;
  end loop;
end;
$$;

-- ------------------------------------------------------- note analytics ------

create table if not exists note_analytics (
  id             uuid primary key default gen_random_uuid(),
  note_id        uuid not null references notes on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  user_phone     text not null default '',
  action         text not null default 'viewed',    -- 'viewed' | 'joined' | 'edited'
  open_count     int not null default 1,
  last_opened_at timestamptz default now(),
  created_at     timestamptz default now(),
  unique (note_id, user_id)
);

alter table note_analytics enable row level security;

drop policy if exists analytics_all_policy on note_analytics;
create policy analytics_all_policy on note_analytics for all using (true) with check (true);

create or replace function public.record_note_view(p_note uuid, p_action text default 'viewed')
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_phone text;
  v_email text;
begin
  if auth.uid() is null then return; end if;
  
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email like 'phone_%@margin.app' then
    v_phone := replace(replace(v_email, 'phone_', ''), '@margin.app', '');
  else
    v_phone := v_email;
  end if;

  insert into note_analytics (note_id, user_id, user_phone, action, open_count, last_opened_at)
  values (p_note, auth.uid(), v_phone, p_action, 1, now())
  on conflict (note_id, user_id) do update set
    open_count = note_analytics.open_count + 1,
    last_opened_at = now(),
    action = case when excluded.action = 'edited' then 'edited' else note_analytics.action end;
end;
$$;

revoke all on function public.record_note_view(uuid, text) from public;
grant execute on function public.record_note_view(uuid, text) to authenticated;

-- ------------------------------------------------ admin activity logs ------

create table if not exists admin_activity_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete set null,
  user_identity text not null default 'Anonymous',
  action        text not null default 'ACTIVITY',
  details       text not null default '',
  created_at    timestamptz default now()
);

alter table admin_activity_logs enable row level security;

drop policy if exists admin_activity_policy on admin_activity_logs;
create policy admin_activity_policy on admin_activity_logs for all using (true) with check (true);


