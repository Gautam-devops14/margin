-- ============================================================================
-- Margin — Feature Update: Revisions & Groups
-- Run this file in your Supabase SQL Editor to safely add the new tables,
-- functions, and RLS policies. It will NOT drop your existing data.
-- ============================================================================

-- -----------------------------------------------------------------
-- 1. REVISION SYSTEM (SPACED REPETITION)
-- -----------------------------------------------------------------

create table if not exists user_settings (
  user_id       uuid primary key references auth.users on delete cascade,
  timezone      text not null default 'Asia/Kolkata',
  evening_time  time not null default '18:00:00',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table user_settings enable row level security;
drop policy if exists user_settings_owner_all on user_settings;
create policy user_settings_owner_all on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists revisions (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references notes on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  schedule_type text not null check (schedule_type in ('evening', 'day_1', 'day_7')),
  scheduled_for timestamptz not null,
  completed_at  timestamptz,
  created_at    timestamptz default now()
);

-- Ensure a note doesn't get duplicate revisions of the same type
create unique index if not exists revisions_note_schedule_idx on revisions (note_id, schedule_type);

alter table revisions enable row level security;
drop policy if exists revisions_owner_all on revisions;
create policy revisions_owner_all on revisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trigger Function: Generate Revisions for New Notes
create or replace function public.calculate_note_revisions()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_tz text;
  v_evening_time time;
  v_local_now timestamp;
  v_local_evening timestamp;
  v_rev1_local timestamp;
  v_rev2_local timestamp;
  v_rev3_local timestamp;
begin
  -- Fetch user settings or defaults
  select timezone, evening_time into v_tz, v_evening_time
  from user_settings where user_id = new.user_id;

  if v_tz is null then
    v_tz := 'Asia/Kolkata';
    v_evening_time := '18:00:00'::time;
    -- Auto-initialize settings for user if missing
    insert into user_settings (user_id, timezone, evening_time)
    values (new.user_id, v_tz, v_evening_time)
    on conflict (user_id) do nothing;
  end if;

  -- Calculate local times based on the exact user timezone calendar
  v_local_now := timezone(v_tz, now());
  v_local_evening := date_trunc('day', v_local_now) + v_evening_time;

  -- Revision 1 Timing: If created before/at evening time, then today evening. Else next day evening.
  if v_local_now <= v_local_evening then
    v_rev1_local := v_local_evening;
  else
    v_rev1_local := v_local_evening + interval '1 day';
  end if;

  -- Revision 2 & 3: strict calendar days from Revision 1
  v_rev2_local := v_rev1_local + interval '1 day';
  v_rev3_local := v_rev1_local + interval '7 days';

  -- Insert securely ensuring user_id matches the note owner
  insert into revisions (note_id, user_id, schedule_type, scheduled_for)
  values 
    (new.id, new.user_id, 'evening', timezone(v_tz, v_rev1_local AT TIME ZONE v_tz)),
    (new.id, new.user_id, 'day_1', timezone(v_tz, v_rev2_local AT TIME ZONE v_tz)),
    (new.id, new.user_id, 'day_7', timezone(v_tz, v_rev3_local AT TIME ZONE v_tz))
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists notes_after_insert_revisions on notes;
create trigger notes_after_insert_revisions
  after insert on notes
  for each row execute function public.calculate_note_revisions();


-- -----------------------------------------------------------------
-- 2. SMALL PRIVATE GROUPS
-- -----------------------------------------------------------------

create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text unique not null,
  created_by  uuid not null references auth.users on delete cascade,
  created_at  timestamptz default now()
);

create table if not exists group_members (
  group_id    uuid not null references groups on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null default 'member' check (role in ('admin', 'member')),
  joined_at   timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists group_posts (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references groups on delete cascade,
  user_id            uuid not null references auth.users on delete cascade,
  type               text not null check (type in ('doubt', 'homework')),
  content            text not null,
  status             text not null default 'open' check (status in ('open', 'resolved')),
  referenced_note_id uuid references notes on delete set null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists group_replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references group_posts on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  content     text not null,
  created_at  timestamptz default now()
);

-- ENABLE RLS
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_posts enable row level security;
alter table group_replies enable row level security;

-- GROUPS RLS
drop policy if exists groups_select on groups;
drop policy if exists groups_insert on groups;
drop policy if exists groups_update on groups;
drop policy if exists groups_delete on groups;

create policy groups_select on groups for select using (
  auth.uid() = created_by or exists (select 1 from group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
);
create policy groups_insert on groups for insert with check (auth.uid() = created_by);
create policy groups_update on groups for update using (
  exists (select 1 from group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'admin')
);
create policy groups_delete on groups for delete using (auth.uid() = created_by);

-- GROUP MEMBERS RLS
drop policy if exists group_members_select on group_members;
drop policy if exists group_members_delete on group_members;

create policy group_members_select on group_members for select using (
  exists (select 1 from group_members my_gm where my_gm.group_id = group_members.group_id and my_gm.user_id = auth.uid())
);
create policy group_members_delete on group_members for delete using (
  auth.uid() = user_id or exists (select 1 from group_members my_gm where my_gm.group_id = group_members.group_id and my_gm.user_id = auth.uid() and my_gm.role = 'admin')
);

-- GROUP POSTS RLS
drop policy if exists group_posts_select on group_posts;
drop policy if exists group_posts_insert on group_posts;
drop policy if exists group_posts_update on group_posts;
drop policy if exists group_posts_delete on group_posts;

create policy group_posts_select on group_posts for select using (
  exists (select 1 from group_members gm where gm.group_id = group_posts.group_id and gm.user_id = auth.uid())
);
create policy group_posts_insert on group_posts for insert with check (
  auth.uid() = user_id and exists (select 1 from group_members gm where gm.group_id = group_posts.group_id and gm.user_id = auth.uid())
);
create policy group_posts_update on group_posts for update using (
  auth.uid() = user_id or exists (select 1 from group_members gm where gm.group_id = group_posts.group_id and gm.user_id = auth.uid() and gm.role = 'admin')
);
create policy group_posts_delete on group_posts for delete using (
  auth.uid() = user_id or exists (select 1 from group_members gm where gm.group_id = group_posts.group_id and gm.user_id = auth.uid() and gm.role = 'admin')
);

-- GROUP REPLIES RLS
drop policy if exists group_replies_select on group_replies;
drop policy if exists group_replies_insert on group_replies;
drop policy if exists group_replies_update on group_replies;
drop policy if exists group_replies_delete on group_replies;

create policy group_replies_select on group_replies for select using (
  exists (
    select 1 from group_posts gp 
    join group_members gm on gm.group_id = gp.group_id 
    where gp.id = group_replies.post_id and gm.user_id = auth.uid()
  )
);
create policy group_replies_insert on group_replies for insert with check (
  auth.uid() = user_id and exists (
    select 1 from group_posts gp 
    join group_members gm on gm.group_id = gp.group_id 
    where gp.id = group_replies.post_id and gm.user_id = auth.uid()
  )
);
create policy group_replies_update on group_replies for update using (
  auth.uid() = user_id or exists (
    select 1 from group_posts gp 
    join group_members gm on gm.group_id = gp.group_id 
    where gp.id = group_replies.post_id and gm.user_id = auth.uid() and gm.role = 'admin'
  )
);
create policy group_replies_delete on group_replies for delete using (
  auth.uid() = user_id or exists (
    select 1 from group_posts gp 
    join group_members gm on gm.group_id = gp.group_id 
    where gp.id = group_replies.post_id and gm.user_id = auth.uid() and gm.role = 'admin'
  )
);

-- JOIN GROUP BY CODE (SECURE RPC)
create or replace function public.join_group_by_code(p_code text)
returns table (group_id uuid, role text, name text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare 
  g record;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  select id, name, created_by into g from groups where upper(join_code) = upper(btrim(p_code));

  if not found then
    raise exception 'No group found for that code';
  end if;

  insert into group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return query select g.id, 'member'::text, g.name;
end;
$$;

revoke all on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated;

-- MARK REVISION COMPLETE
create or replace function public.mark_revision_complete(p_revision_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return; end if;

  update revisions
  set completed_at = now()
  where id = p_revision_id and user_id = auth.uid();
end;
$$;

revoke all on function public.mark_revision_complete(uuid) from public;
grant execute on function public.mark_revision_complete(uuid) to authenticated;
