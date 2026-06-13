# Vercel Deployment Notes

This project is Vercel-ready as a static app with serverless API routes.

## Recommended GitHub Repo Name

GitHub repository names cannot reliably use spaces. Use `Stocks-V2` or `stocks-v2` while displaying the project as "Stocks V2" in the UI and README.

## Environment Variables

Add these later when moving out of Demo Mode:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STOCK_PROVIDER_KEY`
- `CRYPTO_PROVIDER_KEY`
- `NEWS_PROVIDER_KEY`
- `OPENAI_API_KEY`
- `DISCORD_WEBHOOK_URL`

Never expose service-role keys or provider secrets in frontend JavaScript.

## Build Settings

- Framework preset: Other
- Build command: leave empty
- Output directory: `.`
- Install command: leave empty

The app works without dependency installation. API routes live in `/api`.
