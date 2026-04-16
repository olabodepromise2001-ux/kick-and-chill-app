create extension if not exists pgcrypto;

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null check (format in ('round_robin', 'knockout', 'world_cup')),
  venue text not null default 'Kick and Chill Hub',
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  group_name text
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  stage text not null,
  home_team_id uuid not null references teams(id) on delete cascade,
  away_team_id uuid not null references teams(id) on delete cascade,
  home_score integer not null default 0,
  away_score integer not null default 0,
  status text not null check (status in ('upcoming', 'live', 'finished')),
  scheduled_at timestamptz not null default now(),
  phase text not null default 'league',
  group_name text
);

alter table tournaments drop constraint if exists tournaments_format_check;
alter table tournaments
  add constraint tournaments_format_check
  check (format in ('round_robin', 'knockout', 'world_cup'));

alter table teams add column if not exists group_name text;
alter table matches add column if not exists phase text not null default 'league';
alter table matches add column if not exists group_name text;

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  minute integer not null default 0
);
