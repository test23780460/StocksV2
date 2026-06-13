# Deployment Checklist

## Supabase

- [ ] Create project.
- [ ] Enable email/password Auth.
- [ ] Add production URL to Auth redirect URLs.
- [ ] Run `supabase/migrations/20260613153000_market_platform_schema.sql`.
- [ ] Seed `supabase/seed/glossary_terms.sql`.
- [ ] Promote trusted user profile to `role = 'admin'`.
- [ ] Confirm RLS is enabled on public tables.
- [ ] Confirm service-role key is not used in browser code.
- [ ] Deploy Edge Function `collect-market-data`.
- [ ] Confirm `supabase/config.toml` has `[functions.collect-market-data] verify_jwt = false`.
- [ ] Add Edge Function secrets: `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALPHA_VANTAGE_API_KEY`, optional `COINGECKO_API_KEY`.
- [ ] Enable `pg_cron`, `pg_net`, and `supabase_vault`.
- [ ] Store `CRON_SECRET` in Supabase Vault for Cron request headers.
- [ ] Create Supabase Cron schedule `stocks-v2-collect-market-data` with `*/5 * * * *`.
- [ ] Manually invoke `collect-market-data` and verify Edge Function logs before marking ingestion live.

## Vercel

- [ ] Add environment variables from `.env.example`.
- [ ] Set `APP_URL` to the deployed URL.
- [ ] Confirm `vercel.json` has no `crons` block.
- [ ] Do not configure Vercel Cron; scheduled collection runs in Supabase.
- [ ] Deploy and check `/api/health`.
- [ ] Check `/api/health/database`.
- [ ] Check `/api/health/providers`.
- [ ] Check `/api/markets`.

## Jobs

- [ ] Configure Supabase Cron/Edge Function for `*/5 * * * *`.
- [ ] Trigger `collect-market-data` once and confirm `data_ingestion_runs`.
- [ ] Trigger a small backfill for one symbol.
- [ ] Trigger indicator recalculation.
- [ ] Trigger prediction generation.
- [ ] Trigger prediction evaluation after a horizon expires.

## UI smoke test

- [ ] Landing page loads.
- [ ] Dashboard cards show data status/source/freshness.
- [ ] Search returns provider or labeled demo results.
- [ ] Asset page loads quote/chart/news.
- [ ] Refresh disables while loading.
- [ ] Beginner toggle changes explanations.
- [ ] Compact toggle changes spacing.
- [ ] Theme cycles dark/light/system without flashing.
- [ ] Signup/signin/password reset work.
- [ ] Signed-in watchlist sync works.
- [ ] Admin page rejects non-admins.
- [ ] Mobile navigation opens, highlights current page, and closes after navigation.
