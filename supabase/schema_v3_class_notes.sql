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
