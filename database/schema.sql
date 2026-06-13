-- Stocks V2 / Market Signal Deck starter schema for Supabase or PostgreSQL.
-- Enable UUID helpers in Supabase before running this migration.

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key,
  email text not null unique,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  experience_level text not null default 'beginner' check (experience_level in ('beginner', 'intermediate', 'advanced')),
  beginner_mode boolean not null default true,
  compact_mode boolean not null default false,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text not null,
  asset_type text not null check (asset_type in ('stock', 'crypto', 'etf', 'index', 'option')),
  exchange text,
  sector text,
  industry text,
  provider_priority int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.market_quotes (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  provider text not null,
  price numeric(20, 8) not null,
  change_amount numeric(20, 8),
  change_pct numeric(12, 6),
  volume numeric(24, 4),
  market_status text,
  data_status text not null,
  observed_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  unique (asset_id, provider, observed_at)
);

create index market_quotes_asset_time_idx on public.market_quotes (asset_id, observed_at desc);

create table public.daily_snapshots (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  snapshot_date date not null,
  open numeric(20, 8),
  high numeric(20, 8),
  low numeric(20, 8),
  close numeric(20, 8),
  volume numeric(24, 4),
  provider text not null,
  data_status text not null,
  unique (asset_id, snapshot_date, provider)
);

create table public.asset_scores (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  technical_score int check (technical_score between 0 and 100),
  momentum_score int check (momentum_score between 0 and 100),
  news_sentiment_score int check (news_sentiment_score between 0 and 100),
  historical_score int check (historical_score between 0 and 100),
  confidence_score int check (confidence_score between 0 and 100),
  risk_score int check (risk_score between 0 and 100),
  liquidity_score int check (liquidity_score between 0 and 100),
  data_quality_score int check (data_quality_score between 0 and 100),
  overall_setup_score int check (overall_setup_score between 0 and 100),
  signal text check (signal in ('Watch', 'Wait', 'Avoid')),
  direction text check (direction in ('Bullish', 'Neutral', 'Bearish')),
  scoring_version text not null,
  calculated_at timestamptz not null default now()
);

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  folder text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.watchlist_assets (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  sort_order int not null default 0,
  notes text,
  target_price numeric(20, 8),
  added_at timestamptz not null default now(),
  primary key (watchlist_id, asset_id)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete cascade,
  alert_type text not null,
  trigger_value text,
  quiet_hours text,
  channels jsonb not null default '{"in_app": true}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  timeframe text not null,
  current_price numeric(20, 8) not null,
  estimated_low numeric(20, 8),
  estimated_high numeric(20, 8),
  confidence_score int check (confidence_score between 0 and 100),
  risk_score int check (risk_score between 0 and 100),
  methodology_version text not null,
  data_status text not null,
  created_at timestamptz not null default now()
);

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  source text not null,
  url text,
  category text,
  sentiment text check (sentiment in ('Positive', 'Neutral', 'Negative')),
  sentiment_confidence int check (sentiment_confidence between 0 and 100),
  estimated_impact text,
  published_at timestamptz,
  inserted_at timestamptz not null default now()
);

create table public.backend_job_logs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  job_type text not null,
  job_run_id text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  runtime_ms int,
  status text not null,
  provider text,
  assets_processed int not null default 0,
  records_received int not null default 0,
  records_created int not null default 0,
  records_updated int not null default 0,
  duplicate_records_skipped int not null default 0,
  invalid_records_rejected int not null default 0,
  api_requests_made int not null default 0,
  rate_limit_status text,
  error_count int not null default 0,
  warning_count int not null default 0,
  retry_count int not null default 0,
  last_successful_checkpoint text,
  next_scheduled_run timestamptz,
  details jsonb not null default '{}'
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_assets enable row level security;
alter table public.alerts enable row level security;
alter table public.predictions enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own" on public.profiles for select using (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);
create policy "watchlists read own or public" on public.watchlists for select using (auth.uid() = user_id or is_public);
create policy "watchlists write own" on public.watchlists for all using (auth.uid() = user_id);
create policy "alerts write own" on public.alerts for all using (auth.uid() = user_id);
create policy "predictions read own or public asset" on public.predictions for select using (user_id is null or auth.uid() = user_id);

-- Admin-only policies should be added with a stable helper such as public.is_admin().
