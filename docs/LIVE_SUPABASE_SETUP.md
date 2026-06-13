# Live Supabase Setup for Stocks V2

Project ref:

```text
pxhkotgxqxggukiswzxk
```

Project URL:

```text
https://pxhkotgxqxggukiswzxk.supabase.co
```

Vercel URL:

```text
https://stocks-v2-git-cursor-production-m-165772-test23780460s-projects.vercel.app
```

Do not commit provider keys, database passwords, service-role keys, or cron secrets.

## What I can automate

The repo includes:

- `supabase/config.toml` linked to `pxhkotgxqxggukiswzxk`.
- `scripts/setup-supabase.sh`.
- Edge Function `supabase/functions/collect-market-data`.
- Supabase Cron SQL in `supabase/migrations/20260613154000_cron_setup.sql`.

The script can:

1. Link the Supabase project.
2. Push migrations.
3. Set Edge Function secrets from local environment variables.
4. Deploy `collect-market-data`.
5. Optionally configure Vault and `collect_market_data_url` if `SUPABASE_DB_URL` is provided.

## Required local environment variables

Set these in your terminal before running the script:

```bash
export SUPABASE_PROJECT_REF="pxhkotgxqxggukiswzxk"
export SUPABASE_URL="https://pxhkotgxqxggukiswzxk.supabase.co"
export CRON_SECRET="REPLACE_WITH_LONG_RANDOM_SECRET"
export ALPHA_VANTAGE_API_KEY="REPLACE_WITH_ALPHA_VANTAGE_KEY"
export FINNHUB_API_KEY="REPLACE_WITH_FINNHUB_KEY"
export POLYGON_API_KEY="REPLACE_WITH_POLYGON_OR_MASSIVE_KEY"

# Required if the Edge Function does not already receive default Supabase secrets.
export SUPABASE_SERVICE_ROLE_KEY="REPLACE_WITH_SERVICE_ROLE_KEY"

# Optional but recommended so the script can configure Vault and database settings.
export SUPABASE_DB_URL="postgresql://postgres:YOUR_DATABASE_PASSWORD@db.pxhkotgxqxggukiswzxk.supabase.co:5432/postgres"
```

CoinGecko is optional:

```bash
export COINGECKO_API_KEY="REPLACE_WITH_COINGECKO_KEY"
```

## Run setup

Install and authenticate the Supabase CLI first:

```bash
supabase login
```

Then run:

```bash
bash scripts/setup-supabase.sh
```

## If you prefer Supabase Dashboard only

1. Dashboard -> SQL Editor:
   - Run `supabase/migrations/20260613153000_market_platform_schema.sql`.
   - Run `supabase/seed/glossary_terms.sql`.
2. Dashboard -> Edge Functions:
   - Deploy `collect-market-data`.
   - Disable JWT verification for this function or deploy with `--no-verify-jwt`.
3. Dashboard -> Project Settings -> Edge Functions -> Secrets:
   - Add `CRON_SECRET`.
   - Add `ALPHA_VANTAGE_API_KEY`.
   - Add `FINNHUB_API_KEY`.
   - Add `POLYGON_API_KEY` or `MASSIVE_API_KEY` if used by future adapters.
   - Add `SUPABASE_URL`.
   - Add `SUPABASE_SERVICE_ROLE_KEY` if not automatically present.
4. Dashboard -> Database -> Extensions:
   - Enable `pg_cron`.
   - Enable `pg_net`.
   - Enable `supabase_vault`.
5. Dashboard -> SQL Editor:
   ```sql
   select vault.create_secret('REPLACE_WITH_THE_SAME_CRON_SECRET', 'CRON_SECRET');

   alter database postgres set app.settings.collect_market_data_url =
     'https://pxhkotgxqxggukiswzxk.functions.supabase.co/collect-market-data';
   ```
6. Dashboard -> SQL Editor:
   - Run `supabase/migrations/20260613154000_cron_setup.sql`.

## Manual test

After secrets are set and the function is deployed:

```bash
curl -X POST "https://pxhkotgxqxggukiswzxk.functions.supabase.co/collect-market-data" \
  -H "content-type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{}'
```

Expected response shape:

```json
{
  "status": "success",
  "processed": 3,
  "failed": 0,
  "rowsInserted": 3,
  "apiRequests": 1,
  "bucket": "2026-06-13T15:30:00.000Z",
  "runtimeMs": 1200
}
```

If the stock market is closed and crypto is not due, this is also valid:

```json
{
  "status": "skipped",
  "reason": "stock market closed and crypto update not due"
}
```

## Verify logs

1. Dashboard -> Edge Functions -> `collect-market-data` -> Logs.
2. Dashboard -> Table Editor -> `data_ingestion_runs`.
3. Dashboard -> Table Editor -> `market_quotes`.
4. Dashboard -> Table Editor -> `market_snapshots`.

Do not mark scheduled collection as working until the manual function invocation and logs have been verified.
