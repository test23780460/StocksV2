# Stocks V2 Market Signal Deck

Stocks V2 is a Vercel-ready market-research platform for stocks, ETFs, major indexes, and cryptocurrencies. It preserves the original Market Signal Deck visual identity while adding secure server-side provider adapters, Supabase Auth/Postgres integration, scheduled ingestion, historical backfill, explainable signals, immutable predictions, prediction evaluation, watchlists, glossary content, health checks, and production deployment docs.

Educational market research only. Nothing on this platform is financial advice. Market predictions are estimates and are not guarantees. Market data may be delayed, cached, estimated, demo, or unavailable.

## Architecture

- Static HTML/CSS/JS frontend hosted by Vercel.
- Vercel serverless routes under `/api` for normal user-facing routes, auth-backed mutations, health checks, news, predictions, and admin actions.
- Supabase Edge Function `collect-market-data` performs scheduled market-data collection; Vercel Cron is intentionally not used so the project remains compatible with Vercel Hobby.
- Provider contract in `lib/providerContract.js` with methods for search, quote, batch quote, historical bars, movers, market status, company profile, technical data, news, and crypto quotes.
- Supabase Postgres schema and RLS in `supabase/migrations`.
- Supabase Auth for email/password accounts and secure sessions.
- Supabase REST from server-side routes using `SUPABASE_SERVICE_ROLE_KEY`; browser code only receives public anon configuration.
- Deterministic rules engine in `lib/calculations.js` for indicators, signals, trending scores, predictions, and prediction outcome evaluation.
- Demo Mode remains an explicit fallback and is never mixed with live values.

## Local installation

```bash
npm install
npm start
```

Open `http://localhost:4173`.

Run checks and tests:

```bash
npm run check
npm test
```

## Environment variables

Copy `.env.example` and configure only providers you use:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
MARKET_DATA_PROVIDER=auto
NEWS_DATA_PROVIDER=auto
ALPHA_VANTAGE_API_KEY=
POLYGON_API_KEY=
FINNHUB_API_KEY=
COINGECKO_API_KEY=
CRON_SECRET=
APP_URL=
SENTRY_DSN=
```

Private provider keys used by scheduled collection must be stored as Supabase Edge Function secrets. Do not put provider keys in frontend code. Vercel can deploy the frontend and normal API routes without Vercel Cron. The app supports both Supabase's older `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` names and newer `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` names.

## Supabase setup

1. Create a Supabase project.
2. Copy the project URL into `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the anon public key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY` for server-only contexts. For scheduled collection, add it as a Supabase Edge Function secret. Do not expose it in browser code.
5. Run migrations:
   ```bash
   supabase db push
   ```
   Or paste these SQL files into the Supabase SQL editor in order:
   - `supabase/migrations/20260613153000_market_platform_schema.sql`
   - `supabase/migrations/20260613154000_cron_setup.sql` (optional cron)
6. Seed glossary terms:
   ```bash
   supabase db execute --file supabase/seed/glossary_terms.sql
   ```
7. In Supabase Auth settings, enable email/password signup and configure email verification/redirect URLs for your Vercel domain.
8. Create your first user, then promote that profile to admin:
   ```sql
   update public.profiles set role = 'admin' where id = 'YOUR_USER_UUID';
   ```

## RLS summary

- Users can read/update only their own profiles and settings.
- Users can create/update/delete only their own watchlists and watchlist items.
- Users can view only their own private alert rules/events.
- Assets, quotes, bars, public predictions, prediction outcomes, news, trending scores, and glossary terms are publicly readable.
- Market-data inserts, prediction inserts, ingestion logs, API logs, and backfill/admin records are written through trusted server routes with the service role.
- Admin actions require an admin profile or `CRON_SECRET` for scheduler calls.

## Provider configuration

Currently connected:

- Alpha Vantage for stock/ETF/index quote, search, and daily adjusted historical bars.
- CoinGecko public/pro for crypto quotes.
- Finnhub for market/company news when configured.
- Demo provider fallback for every page.

Set `MARKET_DATA_PROVIDER=auto` for automatic routing. To add another provider, implement the contract methods in `lib/providerContract.js`, normalize data with `normalizedQuote`, and never return raw payloads or keys to clients.

## Historical-data backfill

Admin route:

```bash
curl -X POST "$APP_URL/api/admin/backfill" \
  -H "content-type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"symbols":["AAPL","MSFT"],"startDate":"2021-01-01"}'
```

The job requests daily adjusted bars, validates rows, upserts with `asset_id + interval + timestamp + provider`, retries temporary failures, tracks rows imported/failures, and respects provider limits by processing controlled batches.

## Five-minute ingestion

Vercel Cron is intentionally not used. Vercel Hobby does not permit cron jobs more frequent than once per day, so the five-minute market collection schedule runs through Supabase Cron and the Supabase Edge Function named `collect-market-data`.

The Edge Function:

- Requires `CRON_SECRET` through `x-cron-secret` or `Authorization: Bearer`.
- Checks approximate U.S. stock-market hours.
- Exits quickly when the stock market is closed unless a crypto update is due.
- Fetches assets in batches.
- Writes `market_quotes` and `market_snapshots` directly to Supabase.
- Uses five-minute bucket timestamps and unique constraints to avoid duplicate market records.
- Logs each run in `data_ingestion_runs`.
- Uses cautious retries and request budgets to fit Supabase Free Plan execution limits.
- Returns a small JSON response.

Deploy and test:

```bash
supabase functions deploy collect-market-data --no-verify-jwt
supabase secrets set \
  CRON_SECRET="YOUR_LONG_RANDOM_SECRET" \
  SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
  ALPHA_VANTAGE_API_KEY="YOUR_ALPHA_VANTAGE_KEY" \
  COINGECKO_API_KEY="YOUR_COINGECKO_KEY"

curl -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/collect-market-data" \
  -H "content-type: application/json" \
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" \
  -d '{}'
```

The repository also includes `supabase/config.toml`:

```toml
[functions.collect-market-data]
verify_jwt = false
```

JWT verification is disabled only for this Edge Function because Supabase Cron does not sign in as a user. The function still rejects requests unless `x-cron-secret` or `Authorization: Bearer` matches `CRON_SECRET`.

Schedule with Supabase Cron:

```sql
select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'CRON_SECRET');

select cron.unschedule('stocks-v2-collect-market-data')
where exists (
  select 1 from cron.job where jobname = 'stocks-v2-collect-market-data'
);

select cron.schedule(
  'stocks-v2-collect-market-data',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.functions.supabase.co/collect-market-data',
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
);
```

The same setup is captured in `supabase/migrations/20260613154000_cron_setup.sql`.

## Predictions and evaluation

- `POST /api/predictions` generates explainable 7/14/30 day ruleset predictions.
- Predictions are immutable once inserted.
- `POST /api/admin/actions` with `evaluate-predictions` evaluates expired predictions.
- Outcome metrics include directional correctness, target-range accuracy, absolute error, percentage error, and result (`correct`, `incorrect`, `partially_correct`, `expired`).

## Demo Mode vs Live Mode

- Demo Mode is shown when provider keys or Supabase are missing.
- Valid provider keys automatically switch supported assets to connected data.
- Each card/table row shows source, data status, last updated time, and errors when available.
- Provider failures return cached/stored/demo data with clear labels instead of crashing pages.

## Vercel deployment

1. Import the repository in Vercel.
2. Framework preset: Other.
3. Build command: leave empty or use `npm run check`.
4. Output directory: `.`.
5. Add environment variables from `.env.example`.
6. Set `APP_URL` to the production Vercel URL.
7. Do not configure Vercel Cron. Scheduled collection runs in Supabase.
8. Redeploy.
9. Verify that `vercel.json` has no `crons` block, then check:
   - `/api/health`
   - `/api/health/database`
   - `/api/health/providers`
   - `/api/health/cron`
   - `/api/markets`

## API-rate-limit considerations

- Server routes use short cache windows and stale-while-revalidate headers.
- Search has an in-memory per-IP rate limit.
- Historical backfill processes controlled symbol batches and retries with exponential backoff.
- Prefer batch provider endpoints when adding providers with batch quote support.

## Database-growth considerations

- `price_bars` is indexed for `asset_id + interval + timestamp`.
- Five-minute bars can grow quickly; use rollups, retention policies, and partitioning if the tracked universe expands.
- Keep raw provider payloads in external object storage if needed and store only references in `raw_payload_reference`.

## Backup recommendations

- Enable Supabase daily backups.
- Export schema before major migrations.
- Periodically archive `market_quotes`, `price_bars`, `api_usage_logs`, and `data_ingestion_runs`.
- Keep prediction and outcome tables permanently for model evaluation.

## Security checklist

- Never expose service-role or provider keys to browser JavaScript.
- Enable RLS on all public tables.
- Validate authenticated user IDs on server mutations.
- Promote only trusted users to admin.
- Set a long random `CRON_SECRET`.
- Do not log passwords, auth tokens, or complete API keys.
- Configure Auth email redirect URLs.
- Review provider terms for data display and news storage limits.

## Troubleshooting

- If pages show Demo Mode, check `/api/status` and Vercel environment variables.
- If account actions fail, verify Supabase Auth is enabled and public URL/anon key are set.
- If admin actions fail with 401/403, sign in as a profile with `role='admin'` or use `x-cron-secret`.
- If provider calls fail, inspect `/api/health/providers` and provider rate-limit dashboards.
- If migrations fail, run them in order and confirm `pgcrypto`, `pg_cron`, and `pg_net` availability.

## Supabase Dashboard steps for scheduled collection

1. Deploy Edge Function:
   - Open Supabase Dashboard -> Edge Functions.
   - Choose Deploy a new function or use CLI:
     `supabase functions deploy collect-market-data --no-verify-jwt`.
   - Confirm `supabase/config.toml` contains `[functions.collect-market-data] verify_jwt = false`.
   - Confirm the function URL is:
     `https://YOUR_PROJECT_REF.functions.supabase.co/collect-market-data`.
2. Add Edge Function secrets:
   - Dashboard -> Project Settings -> Edge Functions -> Secrets.
   - Add:
     - `CRON_SECRET`
     - `SUPABASE_URL`
     - `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
     - `ALPHA_VANTAGE_API_KEY`
     - `COINGECKO_API_KEY` if used
     - `FINNHUB_API_KEY` if later used by the function
   - Provider API keys belong here, not in frontend code.
3. Enable Supabase Cron:
   - Dashboard -> Database -> Extensions.
   - Enable `pg_cron`, `pg_net`, and Supabase Vault (`supabase_vault`).
4. Create the five-minute schedule:
   - Dashboard -> SQL Editor.
   - Add the same `CRON_SECRET` to Vault:
     `select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'CRON_SECRET');`
   - Run `supabase/migrations/20260613154000_cron_setup.sql`, or run the schedule SQL shown above with your project ref in the function URL.
5. Test manually:
   - Dashboard -> Edge Functions -> `collect-market-data` -> Invoke, or run the `curl` command above with `x-cron-secret`.
   - A successful test returns compact JSON such as `status`, `processed`, `failed`, `rowsInserted`, and `bucket`.
6. View execution logs:
   - Dashboard -> Edge Functions -> `collect-market-data` -> Logs.
   - Database logs are in `data_ingestion_runs`.

Do not claim the scheduled job is working until this manual invocation and the Edge Function logs have been verified in your Supabase project.
