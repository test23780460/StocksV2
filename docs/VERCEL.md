# Vercel Deployment Notes

This project deploys as a static app plus normal user-facing Vercel serverless API routes. Scheduled market-data collection is not run by Vercel Cron so the project remains compatible with Vercel Hobby.

## Build settings

- Framework preset: Other
- Install command: `npm install`
- Build command: `npm run check`
- Output directory: `.`

## Environment variables

Add the browser-safe and normal API variables from `.env.example` in Vercel Project Settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY` only for server-side Vercel API routes that need authenticated Supabase writes

Scheduled collection provider keys are configured as Supabase Edge Function secrets, not Vercel Cron secrets.

Optional for normal on-demand server API routes:

- `FINNHUB_API_KEY`
- `COINGECKO_API_KEY`
- `ALPHA_VANTAGE_API_KEY`
- `MARKET_DATA_PROVIDER=auto`
- `NEWS_DATA_PROVIDER=auto`

Never expose service-role keys or provider secrets in frontend JavaScript.

## Cron

Do not configure Vercel Cron for this project. Vercel Hobby deployments fail when cron jobs run more than once per day. The five-minute schedule is implemented with Supabase Cron calling the Supabase Edge Function `collect-market-data`.

Verify `vercel.json` has no `crons` block before deploying to Vercel Hobby.

## Verification

After deployment, open:

- `/api/health`
- `/api/health/database`
- `/api/health/providers`
- `/api/health/cron`
- `/api/markets`

Then verify in the UI:

- Search returns provider results.
- Refresh disables while loading and updates freshness labels.
- Account forms reach Supabase Auth.
- Watchlists sync after sign-in.
- Admin actions reject non-admin users.
