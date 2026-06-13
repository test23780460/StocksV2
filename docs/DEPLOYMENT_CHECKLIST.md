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

## Vercel

- [ ] Add environment variables from `.env.example`.
- [ ] Set `APP_URL` to the deployed URL.
- [ ] Set `CRON_SECRET` to a long random value.
- [ ] Configure provider keys.
- [ ] Deploy and check `/api/health`.
- [ ] Check `/api/health/database`.
- [ ] Check `/api/health/providers`.
- [ ] Check `/api/markets`.

## Jobs

- [ ] Configure either Supabase Cron/Edge Function or Vercel Cron for `*/5 * * * *`.
- [ ] Trigger `/api/ingest/quotes` once and confirm `data_ingestion_runs`.
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
