-- Stocks V2 production schema for Supabase Postgres.
-- Run in Supabase SQL editor or with `supabase db push`.

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  experience_level text not null default 'beginner' check (experience_level in ('beginner', 'intermediate', 'advanced')),
  preferred_theme text not null default 'system' check (preferred_theme in ('dark', 'light', 'system')),
  beginner_mode boolean not null default true,
  compact_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  default_watchlist_id uuid,
  default_chart_interval text not null default '1d',
  preferred_assets text[] not null default '{}',
  notification_preferences jsonb not null default '{"email": false, "in_app": true}'::jsonb,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  provider_symbol text not null,
  name text not null,
  asset_type text not null check (asset_type in ('stock', 'etf', 'index', 'crypto', 'option', 'fund')),
  exchange text,
  currency text default 'USD',
  country text,
  sector text,
  industry text,
  logo_url text,
  active boolean not null default true,
  provider text not null default 'local-universe',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (symbol),
  unique (provider, provider_symbol)
);

create table if not exists public.market_quotes (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  price numeric(24, 8) not null check (price >= 0),
  open numeric(24, 8) check (open is null or open >= 0),
  high numeric(24, 8) check (high is null or high >= 0),
  low numeric(24, 8) check (low is null or low >= 0),
  previous_close numeric(24, 8) check (previous_close is null or previous_close >= 0),
  change numeric(24, 8),
  change_percent numeric(14, 6),
  volume numeric(28, 4),
  market_cap numeric(28, 4),
  bid numeric(24, 8),
  ask numeric(24, 8),
  timestamp timestamptz not null,
  provider text not null,
  data_status text not null check (data_status in ('Live', 'Delayed', 'Cached', 'Demo', 'Temporarily unavailable', 'Market closed')),
  raw_payload_reference text,
  created_at timestamptz not null default now(),
  check (high is null or low is null or high >= low),
  unique (asset_id, timestamp, provider)
);

create table if not exists public.price_bars (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  interval text not null check (interval in ('5m', '15m', '1h', '1d', '1wk', '1mo')),
  timestamp timestamptz not null,
  open numeric(24, 8) not null check (open >= 0),
  high numeric(24, 8) not null check (high >= 0),
  low numeric(24, 8) not null check (low >= 0),
  close numeric(24, 8) not null check (close >= 0),
  adjusted_close numeric(24, 8),
  volume numeric(28, 4),
  provider text not null,
  data_quality text not null default 'normal' check (data_quality in ('verified', 'normal', 'incomplete', 'stale', 'suspicious', 'repaired', 'demo')),
  created_at timestamptz not null default now(),
  check (high >= low),
  unique (asset_id, interval, timestamp, provider)
);

create table if not exists public.market_snapshots (
  id bigserial primary key,
  timestamp timestamptz not null unique,
  market_status jsonb not null default '{}'::jsonb,
  major_index_values jsonb not null default '{}'::jsonb,
  advance_decline_data jsonb not null default '{}'::jsonb,
  volatility_data jsonb not null default '{}'::jsonb,
  sector_performance jsonb not null default '{}'::jsonb,
  trending_assets jsonb not null default '[]'::jsonb,
  market_breadth jsonb not null default '{}'::jsonb,
  crypto_market_summary jsonb not null default '{}'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.technical_indicators (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  interval text not null,
  timestamp timestamptz not null,
  sma_20 numeric(24, 8),
  sma_50 numeric(24, 8),
  sma_200 numeric(24, 8),
  ema_12 numeric(24, 8),
  ema_26 numeric(24, 8),
  rsi_14 numeric(12, 6),
  macd numeric(24, 8),
  macd_signal numeric(24, 8),
  macd_histogram numeric(24, 8),
  atr numeric(24, 8),
  volatility numeric(16, 8),
  bollinger_upper numeric(24, 8),
  bollinger_middle numeric(24, 8),
  bollinger_lower numeric(24, 8),
  relative_volume numeric(16, 8),
  support_levels numeric[] not null default '{}',
  resistance_levels numeric[] not null default '{}',
  calculated_at timestamptz not null default now(),
  unique (asset_id, interval, timestamp)
);

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  provider_article_id text not null unique,
  title text not null,
  summary text,
  source text,
  author text,
  article_url text,
  image_url text,
  published_at timestamptz not null,
  overall_sentiment text not null default 'Neutral' check (overall_sentiment in ('Positive', 'Neutral', 'Negative')),
  sentiment_score numeric(8, 4) not null default 0,
  relevance_score numeric(8, 4) not null default 0,
  provider text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.news_asset_links (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  sentiment text not null default 'Neutral' check (sentiment in ('Positive', 'Neutral', 'Negative')),
  relevance_score numeric(8, 4) not null default 0,
  primary key (article_id, asset_id)
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.user_settings
  add constraint user_settings_default_watchlist_fk
  foreign key (default_watchlist_id) references public.watchlists(id) on delete set null;

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  notes text,
  sort_order int not null default 0,
  added_at timestamptz not null default now(),
  unique (watchlist_id, asset_id)
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  generated_at timestamptz not null,
  prediction_horizon_days int not null check (prediction_horizon_days in (7, 14, 30, 60, 90)),
  direction text not null check (direction in ('bullish', 'bearish', 'neutral')),
  confidence int not null check (confidence between 0 and 100),
  starting_price numeric(24, 8) not null,
  predicted_low numeric(24, 8) not null,
  predicted_high numeric(24, 8) not null,
  predicted_price numeric(24, 8) not null,
  signal_score int not null check (signal_score between 0 and 100),
  market_regime text not null,
  explanation text not null,
  supporting_indicators jsonb not null default '{}'::jsonb,
  supporting_news jsonb not null default '{}'::jsonb,
  model_version text not null,
  data_timestamp timestamptz not null,
  status text not null default 'active' check (status in ('active', 'correct', 'incorrect', 'partially_correct', 'expired')),
  created_at timestamptz not null default now()
);

create table if not exists public.prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null unique references public.predictions(id) on delete cascade,
  evaluation_date date not null,
  actual_price numeric(24, 8) not null,
  actual_high numeric(24, 8),
  actual_low numeric(24, 8),
  direction_correct boolean not null,
  target_reached boolean not null,
  absolute_error numeric(24, 8),
  percentage_error numeric(14, 8),
  result text not null check (result in ('correct', 'incorrect', 'partially_correct', 'expired')),
  evaluated_at timestamptz not null default now()
);

create table if not exists public.signal_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('running', 'success', 'partial_success', 'failed')),
  assets_processed int not null default 0,
  predictions_created int not null default 0,
  model_version text,
  configuration jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.data_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  provider text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('running', 'success', 'partial_success', 'failed')),
  requested_symbols text[] not null default '{}',
  successful_symbols text[] not null default '{}',
  failed_symbols jsonb not null default '[]'::jsonb,
  rows_inserted int not null default 0,
  api_requests int not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.api_usage_logs (
  id bigserial primary key,
  provider text not null,
  endpoint text not null,
  requested_at timestamptz not null default now(),
  status_code int,
  response_time_ms int,
  success boolean not null,
  rate_limited boolean not null default false,
  cached boolean not null default false,
  error_type text,
  request_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  alert_type text not null,
  comparison text not null check (comparison in ('above', 'below', 'crosses_above', 'crosses_below', 'changes')),
  threshold numeric(24, 8),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_rule_id uuid not null references public.alert_rules(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  trigger_value numeric(24, 8),
  delivery_status text not null default 'pending',
  acknowledged_at timestamptz
);

create table if not exists public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  short_definition text not null,
  full_definition text not null,
  beginner_example text,
  formula text,
  related_terms text[] not null default '{}',
  category text not null default 'market-basics'
);

create table if not exists public.backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  symbol text,
  scope text not null check (scope in ('asset', 'watchlist', 'universe', 'repair', 'indicators')),
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failed', 'partial_success')),
  provider text,
  start_date date,
  end_date date,
  symbols_completed int not null default 0,
  symbols_remaining int not null default 0,
  rows_imported int not null default 0,
  failures jsonb not null default '[]'::jsonb,
  rate_limit_status text,
  estimated_provider_requests int,
  last_successful_timestamp timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  request_payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.asset_search_events (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  query text not null,
  selected_symbol text,
  created_at timestamptz not null default now()
);

create table if not exists public.trending_scores (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  timestamp timestamptz not null default now(),
  score int not null check (score between 0 and 100),
  reasons text[] not null default '{}',
  components jsonb not null default '{}'::jsonb,
  unique (asset_id, timestamp)
);

create index if not exists assets_symbol_search_idx on public.assets using gin (to_tsvector('simple', symbol || ' ' || name));
create index if not exists assets_type_active_idx on public.assets (asset_type, active);
create index if not exists market_quotes_asset_timestamp_idx on public.market_quotes (asset_id, timestamp desc);
create index if not exists market_quotes_status_timestamp_idx on public.market_quotes (data_status, timestamp desc);
create index if not exists price_bars_chart_idx on public.price_bars (asset_id, interval, timestamp desc);
create index if not exists prediction_eval_idx on public.predictions (status, generated_at, prediction_horizon_days);
create index if not exists prediction_asset_idx on public.predictions (asset_id, generated_at desc);
create index if not exists prediction_outcomes_date_idx on public.prediction_outcomes (evaluation_date desc);
create index if not exists news_publication_idx on public.news_articles (published_at desc);
create index if not exists watchlists_owner_idx on public.watchlists (user_id, created_at desc);
create index if not exists watchlist_items_watchlist_idx on public.watchlist_items (watchlist_id, sort_order);
create index if not exists ingestion_status_idx on public.data_ingestion_runs (status, started_at desc);
create index if not exists api_usage_provider_idx on public.api_usage_logs (provider, requested_at desc);
create index if not exists alert_rules_owner_idx on public.alert_rules (user_id, active);
create index if not exists backfill_status_idx on public.backfill_jobs (status, created_at desc);

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_user_settings_updated_at before update on public.user_settings for each row execute function public.set_updated_at();
create trigger set_assets_updated_at before update on public.assets for each row execute function public.set_updated_at();
create trigger set_watchlists_updated_at before update on public.watchlists for each row execute function public.set_updated_at();
create trigger set_alert_rules_updated_at before update on public.alert_rules for each row execute function public.set_updated_at();
create trigger set_backfill_jobs_updated_at before update on public.backfill_jobs for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  created_watchlist_id uuid;
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(split_part(new.email, '@', 1)) || '-' || substr(new.id::text, 1, 6),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.watchlists (user_id, name, description, is_default)
  values (new.id, 'Default Watchlist', 'Created automatically during signup.', true)
  on conflict (user_id, name) do update set is_default = true
  returning id into created_watchlist_id;

  insert into public.user_settings (user_id, default_watchlist_id)
  values (new.id, created_watchlist_id)
  on conflict (user_id) do update set default_watchlist_id = excluded.default_watchlist_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.assets enable row level security;
alter table public.market_quotes enable row level security;
alter table public.price_bars enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.technical_indicators enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_asset_links enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_outcomes enable row level security;
alter table public.signal_runs enable row level security;
alter table public.data_ingestion_runs enable row level security;
alter table public.api_usage_logs enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
alter table public.glossary_terms enable row level security;
alter table public.backfill_jobs enable row level security;
alter table public.admin_action_logs enable row level security;
alter table public.asset_search_events enable row level security;
alter table public.trending_scores enable row level security;

create policy "profiles own select" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "profiles own update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "settings own select" on public.user_settings for select using (auth.uid() = user_id or public.is_admin());
create policy "settings own update" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "assets public read" on public.assets for select using (true);
create policy "quotes public read" on public.market_quotes for select using (true);
create policy "bars public read" on public.price_bars for select using (true);
create policy "snapshots public read" on public.market_snapshots for select using (true);
create policy "indicators public read" on public.technical_indicators for select using (true);
create policy "news public read" on public.news_articles for select using (true);
create policy "news links public read" on public.news_asset_links for select using (true);
create policy "public predictions read" on public.predictions for select using (true);
create policy "public prediction outcomes read" on public.prediction_outcomes for select using (true);
create policy "glossary public read" on public.glossary_terms for select using (true);
create policy "trending public read" on public.trending_scores for select using (true);

create policy "watchlists own select" on public.watchlists for select using (auth.uid() = user_id);
create policy "watchlists own insert" on public.watchlists for insert with check (auth.uid() = user_id);
create policy "watchlists own update" on public.watchlists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "watchlists own delete" on public.watchlists for delete using (auth.uid() = user_id);

create policy "watchlist items own select" on public.watchlist_items for select using (
  exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
);
create policy "watchlist items own insert" on public.watchlist_items for insert with check (
  exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
);
create policy "watchlist items own update" on public.watchlist_items for update using (
  exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
) with check (
  exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
);
create policy "watchlist items own delete" on public.watchlist_items for delete using (
  exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
);

create policy "alert rules own select" on public.alert_rules for select using (auth.uid() = user_id or public.is_admin());
create policy "alert rules own insert" on public.alert_rules for insert with check (auth.uid() = user_id);
create policy "alert rules own update" on public.alert_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alert rules own delete" on public.alert_rules for delete using (auth.uid() = user_id);
create policy "alert events own select" on public.alert_events for select using (
  exists (select 1 from public.alert_rules r where r.id = alert_rule_id and r.user_id = auth.uid()) or public.is_admin()
);

create policy "admin signal runs" on public.signal_runs for all using (public.is_admin()) with check (public.is_admin());
create policy "admin ingestion runs" on public.data_ingestion_runs for select using (public.is_admin());
create policy "admin api logs" on public.api_usage_logs for select using (public.is_admin());
create policy "admin backfills" on public.backfill_jobs for all using (public.is_admin()) with check (public.is_admin());
create policy "admin action logs" on public.admin_action_logs for select using (public.is_admin());
create policy "search events own select" on public.asset_search_events for select using (auth.uid() = user_id or public.is_admin());
create policy "search events own insert" on public.asset_search_events for insert with check (auth.uid() = user_id or user_id is null);

-- Inserts/updates for market data, predictions, logs, and admin records are done
-- with the service-role key from server-only routes or Edge Functions, which
-- bypasses RLS. Do not expose the service-role key to browsers.
