# Vercel Deployment Notes

This project is Vercel-ready as a static app with serverless API routes.

## Recommended GitHub Repo Name

GitHub repository names cannot reliably use spaces. Use `Stocks-V2` or `stocks-v2` while displaying the project as "Stocks V2" in the UI and README.

## Environment Variables

Add these when moving out of Demo Mode:

- `ALPHA_VANTAGE_API_KEY`
- `COINGECKO_API_KEY`
- `COINGECKO_DEMO_API_KEY`
- `FINNHUB_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `DISCORD_WEBHOOK_URL`

Never expose service-role keys or provider secrets in frontend JavaScript.

See `docs/API_SETUP.md` for the current market-data setup steps.

## Build Settings

- Framework preset: Other
- Build command: leave empty
- Output directory: `.`
- Install command: leave empty

The app works without dependency installation. API routes live in `/api`.
