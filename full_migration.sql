-- (Just getting the schema contents)
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
-- ============================================================================
-- Margin V3 — Class Notes Platform Migration
-- Run in Supabase SQL Editor.
-- Safe to run multiple times (idempotent).
-- Does NOT drop existing tables or data.
-- ============================================================================

-- ----------------------------------------------------------------
-- 1. PROFILES TABLE
-- Stores name + role for each authenticated user.
-- role: 'student' (default) | 'cr' (class representative)
-- ----------------------------------------------------------------

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default '',
  role        text not null default 'student' check (role in ('student', 'cr')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists profiles_select_own on profiles;
drop policy if exists profiles_update_own on profiles;
drop policy if exists profiles_insert_own on profiles;
drop policy if exists profiles_cr_select_all on profiles;

-- Users can read/update their own profile
create policy profiles_select_own on profiles
  for select using (auth.uid() = id);

create policy profiles_update_own on profiles
  for update using (auth.uid() = id) with check (
    auth.uid() = id
    -- Prevent self-promotion: users cannot change their own role
    -- (role can only be changed via SQL by a superuser/service role)
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) = role
  );

create policy profiles_insert_own on profiles
  for insert with check (auth.uid() = id AND role = 'student');

-- CR can read all profiles (for moderation)
create policy profiles_cr_select_all on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'cr')
  );

-- Helper function: check if current user is CR
create or replace function public.is_cr()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'cr');
$$;

-- ----------------------------------------------------------------
-- 2. ADD published COLUMN TO NOTES
-- Existing notes default to false (not exposed to students).
-- ----------------------------------------------------------------

alter table notes add column if not exists published boolean not null default false;
create index if not exists notes_published_subject_idx on notes (published, subject_id, updated_at desc);

-- ----------------------------------------------------------------
-- 3. REPLACE OLD NOTE RLS POLICIES
-- Old model: owner all + friends + shared_access (complex)
-- New model: CR does everything, students read only published notes
-- ----------------------------------------------------------------

drop policy if exists notes_owner_all      on notes;
drop policy if exists notes_shared_read    on notes;
drop policy if exists notes_shared_edit    on notes;
drop policy if exists notes_friends_read   on notes;
drop policy if exists notes_admin_all      on notes;
drop policy if exists notes_admin_read     on notes;

-- CR can do everything
create policy notes_cr_all on notes
  for all using (public.is_cr()) with check (public.is_cr());

-- Students can only SELECT published notes
create policy notes_student_read on notes
  for select using (
    published = true
    AND NOT public.is_cr()
  );

-- ----------------------------------------------------------------
-- 4. COMMENTS TABLE (note-level discussion)
-- ----------------------------------------------------------------

create table if not exists comments (
  id                  uuid primary key default gen_random_uuid(),
  note_id             uuid not null references notes on delete cascade,
  user_id             uuid not null references auth.users on delete cascade,
  parent_comment_id   uuid references comments on delete cascade,
  content             text not null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists comments_note_idx on comments (note_id, created_at asc);
create index if not exists comments_parent_idx on comments (parent_comment_id);

alter table comments enable row level security;

drop policy if exists comments_student_read on comments;
drop policy if exists comments_student_insert on comments;
drop policy if exists comments_own_update on comments;
drop policy if exists comments_own_delete on comments;
drop policy if exists comments_cr_all on comments;

-- Students read comments on published notes
create policy comments_student_read on comments
  for select using (
    exists (
      select 1 from notes n
      where n.id = comments.note_id and n.published = true
    )
  );

-- Students can comment on published notes (only as themselves)
create policy comments_student_insert on comments
  for insert with check (
    auth.uid() = user_id
    AND exists (
      select 1 from notes n
      where n.id = note_id and n.published = true
    )
  );

-- Users can update their own comments
create policy comments_own_update on comments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Users can delete their own comments; CR can delete any comment
create policy comments_own_delete on comments
  for delete using (
    auth.uid() = user_id OR public.is_cr()
  );

-- CR can read ALL comments (including on unpublished notes for preview)
create policy comments_cr_all on comments
  for all using (public.is_cr()) with check (public.is_cr());

-- ----------------------------------------------------------------
-- 5. SAFE PUBLISH / UNPUBLISH RPC
-- Forces only CR to publish/unpublish, with audit trail.
-- ----------------------------------------------------------------

create or replace function public.publish_note(p_note_id uuid, p_publish boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_cr() then
    raise exception 'Only a CR can publish or unpublish notes';
  end if;

  update notes
  set published = p_publish, updated_at = now()
  where id = p_note_id;
end;
$$;

revoke all on function public.publish_note(uuid, boolean) from public;
grant execute on function public.publish_note(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------
-- 6. INSTRUCTIONS AFTER RUNNING
-- ----------------------------------------------------------------
-- After running this migration AND after you have logged in for the
-- first time via the app, run this ONCE in SQL Editor to make
-- yourself CR (replace with your actual user UUID from auth.users):
--
--   UPDATE profiles SET role = 'cr' WHERE id = auth.uid();
--
-- Or to grant another user CR access:
--   UPDATE profiles SET role = 'cr' WHERE id = '<their-uuid>';
--
-- To revoke:
--   UPDATE profiles SET role = 'student' WHERE id = '<their-uuid>';
-- ================================================================

-- Apply the RLS fix
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role = 'student'
  );
