# API Setup

Stocks V2 keeps API keys server-side in Vercel environment variables. Do not put keys in `index.html`, `assets/app.js`, or any other frontend file.

## Minimum Market Data Setup

Add these in Vercel:

| Name | Required | Purpose |
| --- | --- | --- |
| `ALPHA_VANTAGE_API_KEY` | Yes for stocks/ETFs | Stock, ETF, and index quote support through Alpha Vantage `GLOBAL_QUOTE` |
| `COINGECKO_API_KEY` | Optional | Crypto quote support through CoinGecko Pro |
| `COINGECKO_DEMO_API_KEY` | Optional | Alternate CoinGecko key name |

Crypto quotes can use CoinGecko's public endpoint without a key, but a key is better for rate limits.

## Optional Future Services

| Name | Purpose |
| --- | --- |
| `FINNHUB_API_KEY` | Future news, company profile, and market news integration |
| `SUPABASE_URL` | Future database and auth integration |
| `SUPABASE_ANON_KEY` | Future browser-safe Supabase auth key |
| `SUPABASE_SERVICE_ROLE_KEY` | Future server-only database admin key |
| `OPENAI_API_KEY` | Future AI market brief and structured research reports |
| `DISCORD_WEBHOOK_URL` | Future optional Discord alerts |

## Vercel Steps

1. Open the Vercel project.
2. Go to `Settings` -> `Environment Variables`.
3. Add `ALPHA_VANTAGE_API_KEY` and choose `Production`, `Preview`, and `Development`.
4. Add `COINGECKO_API_KEY` if you have one.
5. Save the variables.
6. Redeploy the latest production deployment, or push another commit to trigger deployment.

## Check It

After deployment, open:

```text
https://YOUR-VERCEL-DOMAIN/api/status
```

You should see `Stock market API` as `Configured` when `ALPHA_VANTAGE_API_KEY` is present.

Then open:

```text
https://YOUR-VERCEL-DOMAIN/api/markets
```

Assets that successfully connected will show:

```json
"dataStatus": "Connected data"
```

If a provider is missing, rate-limited, or does not support a symbol, that asset falls back to demo/unavailable labels instead of breaking the whole page.
