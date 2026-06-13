-- Optional Supabase Cron setup.
-- Replace https://YOUR-VERCEL-DOMAIN with APP_URL and set CRON_SECRET in the
-- Supabase Vault or harden this call in your infrastructure before enabling.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Run approximately every five minutes. The application route is idempotent
-- and protected by CRON_SECRET.
select cron.schedule(
  'stocks-v2-five-minute-market-ingestion',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := current_setting('app.settings.app_url', true) || '/api/ingest/quotes',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
)
where not exists (
  select 1 from cron.job where jobname = 'stocks-v2-five-minute-market-ingestion'
);

-- Configure once per environment:
-- alter database postgres set app.settings.app_url = 'https://YOUR-VERCEL-DOMAIN';
-- alter database postgres set app.settings.cron_secret = 'YOUR_LONG_RANDOM_SECRET';
