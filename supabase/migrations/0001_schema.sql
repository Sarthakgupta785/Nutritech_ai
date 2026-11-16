-- NutriTrack AI — database schema. Run once in Supabase: SQL Editor → paste → Run.
-- Every table carries user_id and is protected by Row Level Security: a signed-in user can
-- only ever read or write their own rows. The service role (edge functions) bypasses RLS.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Helper: standard columns, RLS policy, updated_at trigger and sync index for a user-owned table.
create or replace function public.nt_secure(tbl text) returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format('drop policy if exists own_rows on public.%I', tbl);
  execute format('create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl);
  execute format('drop trigger if exists touch on public.%I', tbl);
  execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', tbl);
  execute format('create index if not exists %I on public.%I (user_id, updated_at)', tbl || '_sync_idx', tbl);
end $$;

-- 1. User profiles (id = auth user id)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null default '', sex text not null default 'male' check (sex in ('male','female')),
  age int not null default 30 check (age between 13 and 110),
  height_cm numeric not null default 175, weight_kg numeric not null default 93,
  activity text not null default 'sedentary', goal text not null default 'Fat loss while preserving muscle',
  timezone text not null default 'UTC', onboarded boolean not null default false,
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (id = user_id)
);

-- 2. Nutrition targets (id = auth user id)
create table if not exists public.nutrition_targets (
  id uuid primary key references auth.users on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kcal numeric not null, protein_g numeric not null, carbs_g numeric not null, fat_g numeric not null,
  fibre_g numeric not null default 30, water_ml numeric not null default 3000,
  professional_approved boolean not null default false,
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- 12. User preferences (id = auth user id)
create table if not exists public.user_preferences (
  id uuid primary key references auth.users on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  diet text not null default 'Non-vegetarian',
  preferred text[] not null default '{}', avoid text[] not null default '{}',
  whey_max_scoops int not null default 1, workouts_enabled boolean not null default true,
  fitness_level text not null default 'beginner',
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- 3. Food database. user_id null = built-in reference food (read-only to users); otherwise a user's custom food.
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  ref_key text unique,
  name text not null, category text, unit text not null default 'g' check (unit in ('g','ml')),
  kcal numeric not null, protein_g numeric not null default 0, carbs_g numeric not null default 0,
  fat_g numeric not null default 0, fibre_g numeric not null default 0,
  servings jsonb not null default '[]', source text not null default 'custom',
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
alter table public.foods enable row level security;
drop policy if exists foods_read on public.foods;
create policy foods_read on public.foods for select to authenticated using (user_id is null or user_id = (select auth.uid()));
drop policy if exists foods_write on public.foods;
create policy foods_write on public.foods for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists touch on public.foods;
create trigger touch before insert or update on public.foods for each row execute function public.touch_updated_at();

create table if not exists public.favourite_meals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  name text not null, items jsonb not null default '[]',
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- 4. Meal entries
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  local_date date not null, slot text not null default 'other', name text not null default '',
  eaten_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft','logged','skipped')),
  no_photo boolean not null default false, ai_analysis jsonb, ai_feedback text, notes text,
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists meals_day_idx on public.meals (user_id, local_date);

-- 5. Individual meal food items. Confirmed values here are the source of truth for every total.
create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  meal_id uuid not null references public.meals on delete cascade,
  name text not null, quantity numeric not null, unit text not null default 'g',
  kcal numeric not null default 0, protein_g numeric not null default 0, carbs_g numeric not null default 0,
  fat_g numeric not null default 0, fibre_g numeric not null default 0,
  per100 jsonb, source text not null default 'custom', food_ref text, cooking_method text, confidence numeric, sort int not null default 0,
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists meal_items_meal_idx on public.meal_items (meal_id);

-- 6. Meal photographs (files live in the private "meal-photos" storage bucket)
create table if not exists public.meal_photos (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  meal_id uuid not null references public.meals on delete cascade, storage_path text not null,
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- 7. Reminder schedules + what happened to each reminder each day
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('hydration','meal','review')), slot text, label text not null,
  time text not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'), enabled boolean not null default true, sort int not null default 0,
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.reminder_events (
  id uuid primary key, user_id uuid not null references auth.users on delete cascade,
  reminder_id uuid not null references public.reminders on delete cascade, local_date date not null,
  status text not null default 'sent' check (status in ('sent','completed','skipped','snoozed')),
  snoozed_until timestamptz, pushed_at timestamptz,
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (reminder_id, local_date)
);
create index if not exists reminder_events_snooze_idx on public.reminder_events (snoozed_until) where status = 'snoozed';

-- 8. Water intake   9. Weight history
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  local_date date not null, amount_ml numeric not null check (amount_ml > 0 and amount_ml <= 5000), logged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.weight_logs (
  id uuid primary key, user_id uuid not null references auth.users on delete cascade,
  local_date date not null, weight_kg numeric not null check (weight_kg between 20 and 400),
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (user_id, local_date)
);

-- 10. Daily AI reports   11. Weekly AI reports
create table if not exists public.daily_reports (
  id uuid primary key, user_id uuid not null references auth.users on delete cascade,
  local_date date not null, summary jsonb not null default '{}', report jsonb not null default '{}',
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (user_id, local_date)
);
create table if not exists public.weekly_reports (
  id uuid primary key, user_id uuid not null references auth.users on delete cascade,
  week_start date not null, summary jsonb not null default '{}', report jsonb not null default '{}',
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (user_id, week_start)
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user','assistant')), content text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- Optional home-workout module
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  local_date date not null, started_at timestamptz not null default now(), duration_min numeric not null default 0,
  category text not null default '', difficulty text not null default '', exercises jsonb not null default '[]',
  notes text, effort int check (effort between 1 and 10), est_kcal numeric not null default 0,
  source text not null default 'app', ai_feedback jsonb,
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- Web Push subscriptions (one per installed device)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null, user_agent text,
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

select public.nt_secure(t) from unnest(array[
  'profiles','nutrition_targets','user_preferences','favourite_meals','meals','meal_items','meal_photos','reminders',
  'reminder_events','water_logs','weight_logs','daily_reports','weekly_reports','coach_messages','workouts','push_subscriptions'
]) as t;

-- Private photo storage: each user can only touch files inside a folder named after their own user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "meal photos: own folder" on storage.objects;
create policy "meal photos: own folder" on storage.objects for all to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
