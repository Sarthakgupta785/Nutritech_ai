-- NutriTrack AI — reminder scheduler.
-- Run this LAST, after both edge functions are deployed and the secrets are set.
--
-- Replace the three placeholders below, then press Run:
--   YOUR-PROJECT-REF   the code in your Supabase URL, e.g. abcdefghijklmnop
--   YOUR-CRON-SECRET   the same value you saved as the CRON_SECRET function secret
--   YOUR-SERVICE-KEY   Settings -> API Keys -> the "service_role" key (or a "secret" sb_secret_... key).
--                      This stays inside your own database. Never put it in the app or share it.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('nutritrack-tick') where exists (select 1 from cron.job where jobname = 'nutritrack-tick');

select cron.schedule('nutritrack-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-SERVICE-KEY',
      'x-cron-secret', 'YOUR-CRON-SECRET'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);

-- Keep the cron log small.
select cron.unschedule('nutritrack-cron-cleanup') where exists (select 1 from cron.job where jobname = 'nutritrack-cron-cleanup');
select cron.schedule('nutritrack-cron-cleanup', '15 3 * * *', $$ delete from cron.job_run_details where end_time < now() - interval '3 days' $$);

-- Check it is running (wait a minute, then run this on its own):
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'nutritrack-tick')
--   order by start_time desc limit 5;
