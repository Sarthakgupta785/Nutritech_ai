-- NutriTrack AI — measurement unit preference. Run after 0001_schema.sql.
alter table public.user_preferences add column if not exists units text not null default 'metric';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_units_check') then
    alter table public.user_preferences
      add constraint user_preferences_units_check check (units in ('metric', 'imperial'));
  end if;
end $$;

comment on column public.user_preferences.units is 'metric = kg and ml; imperial = lb and US fl oz. Food is always stored in grams.';
