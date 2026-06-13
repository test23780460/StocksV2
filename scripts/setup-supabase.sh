#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-pxhkotgxqxggukiswzxk}"
FUNCTION_NAME="collect-market-data"
FUNCTION_URL="https://${PROJECT_REF}.functions.supabase.co/${FUNCTION_NAME}"

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required. Install it first, then rerun this script." >&2
  echo "Docs: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

need CRON_SECRET
need ALPHA_VANTAGE_API_KEY
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -z "${SUPABASE_SECRET_KEY:-}" ]]; then
  echo "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY" >&2
  exit 1
fi

echo "Linking Supabase project ${PROJECT_REF}..."
supabase link --project-ref "${PROJECT_REF}"

echo "Pushing database migrations..."
supabase db push

tmp_env="$(mktemp)"
cleanup() {
  rm -f "${tmp_env}"
}
trap cleanup EXIT
chmod 600 "${tmp_env}"

{
  echo "CRON_SECRET=${CRON_SECRET}"
  echo "ALPHA_VANTAGE_API_KEY=${ALPHA_VANTAGE_API_KEY}"
  [[ -n "${COINGECKO_API_KEY:-}" ]] && echo "COINGECKO_API_KEY=${COINGECKO_API_KEY}"
  [[ -n "${FINNHUB_API_KEY:-}" ]] && echo "FINNHUB_API_KEY=${FINNHUB_API_KEY}"
  [[ -n "${POLYGON_API_KEY:-}" ]] && echo "POLYGON_API_KEY=${POLYGON_API_KEY}"
  [[ -n "${MASSIVE_API_KEY:-}" ]] && echo "MASSIVE_API_KEY=${MASSIVE_API_KEY}"
  [[ -n "${SUPABASE_URL:-}" ]] && echo "SUPABASE_URL=${SUPABASE_URL}"
  [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] && echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
  [[ -n "${SUPABASE_SECRET_KEY:-}" ]] && echo "SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY}"
} > "${tmp_env}"

echo "Setting Edge Function secrets from environment variables..."
supabase secrets set --project-ref "${PROJECT_REF}" --env-file "${tmp_env}"

echo "Deploying ${FUNCTION_NAME} Edge Function..."
supabase functions deploy "${FUNCTION_NAME}" --project-ref "${PROJECT_REF}" --no-verify-jwt

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "SUPABASE_DB_URL is set, but psql is not installed. Skipping database cron settings." >&2
  else
    echo "Configuring Supabase Vault secret and collect_market_data_url database setting..."
    escaped_secret="${CRON_SECRET//\'/\'\'}"
    escaped_url="${FUNCTION_URL//\'/\'\'}"
    psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 <<SQL
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('${escaped_secret}', 'CRON_SECRET')
where not exists (
  select 1 from vault.decrypted_secrets where name = 'CRON_SECRET'
);
alter database postgres set app.settings.collect_market_data_url = '${escaped_url}';
SQL
    echo "Database setting configured. Reconnect sessions before running cron migration if needed."
  fi
else
  echo "SUPABASE_DB_URL was not provided, so Vault/database setting automation was skipped."
  echo "Set app.settings.collect_market_data_url and Vault CRON_SECRET manually in the Supabase SQL editor."
fi

echo "Setup command completed. Function URL: ${FUNCTION_URL}"
echo "Manually test with:"
echo "curl -X POST '${FUNCTION_URL}' -H 'content-type: application/json' -H 'x-cron-secret: \$CRON_SECRET' -d '{}'"
