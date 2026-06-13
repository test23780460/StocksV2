# Stocks V2

Stocks V2 is a Vercel-ready financial market research website based on the Market Signal Deck prompt.

It is intentionally in **Demo Mode** until real market-data providers, Supabase, and AI credentials are configured. Demo data is visibly labeled and should never be treated as live financial information.

## Included

- Responsive financial command-center UI
- Landing page, dashboard, markets, stocks, crypto, ETFs, indexes, options, research ideas, news, predictions, compare, screeners, watchlists, alerts, learn, status, account, settings, and admin monitoring pages
- Global asset search and ticker navigation
- Sortable/filterable/searchable asset tables
- Canvas charts and Market Mood gauge
- Local watchlists and alert workflow using browser storage
- Demo prediction ranges with no guaranteed outcomes
- Vercel `/api` routes for status, search, asset lookup, markets, and admin job logs
- Provider abstraction scaffold in `lib/providerContract.js`
- Supabase/PostgreSQL starter schema with RLS policy examples
- Vercel deployment notes in `docs/VERCEL.md`
- API setup notes in `docs/API_SETUP.md`

## Run Locally

If Node is available:

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

You can also open `index.html` directly in a browser for the frontend-only preview.

## Deploy To Vercel

1. Create a GitHub repo named `Stocks-V2`.
2. Add these files to the repo.
3. Import the repo in Vercel.
4. Use the settings in `docs/VERCEL.md`.
5. Add market-data keys using `docs/API_SETUP.md`.

## Financial Safety

This website is for educational and market-research purposes only. Nothing here is financial advice. Predictions are estimates, not guarantees. Users can lose money in financial markets. AI analysis may be incomplete or incorrect. Data may be live, delayed, cached, estimated, demo, or unavailable depending on provider configuration.
