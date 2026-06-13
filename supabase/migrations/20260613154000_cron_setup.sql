-- Supabase Cron setup for five-minute market collection.
-- Vercel Cron is intentionally not used so the project remains compatible with
-- the Vercel Hobby plan.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

-- Before enabling the schedule:
-- 1. Deploy the Edge Function at:
--    https://YOUR_PROJECT_REF.functions.supabase.co/collect-market-data
-- 2. Store CRON_SECRET in Supabase Vault using the same value configured as an
--    Edge Function secret:
--    select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'CRON_SECRET');
-- The Edge Function is idempotent. It writes quotes with the five-minute bucket
-- timestamp and relies on unique(asset_id, timestamp, provider), plus
-- market_snapshots unique(timestamp), to prevent duplicate records.
select cron.unschedule('stocks-v2-collect-market-data')
where exists (
  select 1 from cron.job where jobname = 'stocks-v2-collect-market-data'
);

select cron.schedule(
  'stocks-v2-collect-market-data',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := 'https://pxhkotgxqxggukiswzxk.functions.supabase.co/collect-market-data',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'CRON_SECRET'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $$
)
where not exists (
  select 1 from cron.job where jobname = 'stocks-v2-collect-market-data'
);
