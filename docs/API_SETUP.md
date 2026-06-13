# API Setup

Stocks V2 keeps API keys server-side in Vercel environment variables. Do not put provider keys in `index.html`, `assets/app.js`, or any frontend file.

## Providers currently wired

| Provider | Environment variable | Purpose |
| --- | --- | --- |
| Alpha Vantage | `ALPHA_VANTAGE_API_KEY` | Stock/ETF/index search, quotes, and daily adjusted history |
| CoinGecko | `COINGECKO_API_KEY` | Cryptocurrency quotes. Public CoinGecko fallback works with tighter limits |
| Finnhub | `FINNHUB_API_KEY` | Market and asset news |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Auth, Postgres storage, RLS-protected user data, backend writes |

Optional variables:

- `MARKET_DATA_PROVIDER=auto`
- `NEWS_DATA_PROVIDER=auto`
- `CRON_SECRET`
- `APP_URL`
- `SENTRY_DSN`

## Check provider health

```text
https://YOUR-VERCEL-DOMAIN/api/status
https://YOUR-VERCEL-DOMAIN/api/health/providers
https://YOUR-VERCEL-DOMAIN/api/markets
```

Successful connected data uses one of these states:

```json
"dataStatus": "Live"
"dataStatus": "Delayed"
"dataStatus": "Cached"
"dataStatus": "Market closed"
```

Fallback states are explicit:

```json
"dataStatus": "Demo"
"dataStatus": "Temporarily unavailable"
```

If a provider is missing, rate-limited, or does not support a symbol, the route returns the most useful cached/demo/unavailable response it can and labels it clearly.
