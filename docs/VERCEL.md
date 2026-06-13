# Vercel Deployment Notes

This project deploys as a static app plus Vercel serverless API routes.

## Build settings

- Framework preset: Other
- Install command: `npm install`
- Build command: `npm run check`
- Output directory: `.`

## Environment variables

Add the variables from `.env.example` in Vercel Project Settings. Required for production live mode:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `APP_URL`
- At least one market provider key, usually `ALPHA_VANTAGE_API_KEY`

Recommended:

- `FINNHUB_API_KEY`
- `COINGECKO_API_KEY`
- `MARKET_DATA_PROVIDER=auto`
- `NEWS_DATA_PROVIDER=auto`

Never expose service-role keys or provider secrets in frontend JavaScript.

## Cron

If your Vercel plan supports five-minute cron jobs, configure:

```json
{
  "path": "/api/ingest/quotes",
  "schedule": "*/5 * * * *"
}
```

Set the `x-cron-secret` header to `CRON_SECRET` if using an external scheduler. For Vercel Cron without custom headers, prefer the Supabase Cron/Edge Function path documented in the README.

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
