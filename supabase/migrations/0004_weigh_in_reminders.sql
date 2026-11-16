-- NutriTrack AI — weekly weigh-in reminders. Run this after 0001_schema.sql.
-- Adds a 'weight' reminder kind and an optional weekday, so a reminder can repeat weekly
-- instead of daily. Existing reminders are unaffected (weekday null = every day).

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.reminders'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%kind%'
  loop execute format('alter table public.reminders drop constraint %I', c.conname); end loop;
end $$;

alter table public.reminders
  add constraint reminders_kind_check check (kind in ('hydration','meal','review','weight'));

alter table public.reminders add column if not exists weekday smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reminders_weekday_check') then
    alter table public.reminders
      add constraint reminders_weekday_check check (weekday is null or weekday between 0 and 6);
  end if;
end $$;

comment on column public.reminders.weekday is '0=Monday .. 6=Sunday; null = fires every day';
