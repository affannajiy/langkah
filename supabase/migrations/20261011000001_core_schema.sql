-- Langkah core schema (guide Section 8).
-- RLS is switched on in this same migration for every table (CLAUDE.md, Security).

-- Extensions live in the "extensions" schema, as Supabase recommends.
create extension if not exists postgis with schema extensions;
create extension if not exists pgrouting with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- road_segments: the walk network used by pgRouting. Built by data-scripts.
-- One row per edge between two junctions. Separate sidewalks (footway=sidewalk)
-- and crossings (footway=crossing) are edges like any road (Section 7.5).
-- ---------------------------------------------------------------------------
create table public.road_segments (
  id bigint generated always as identity primary key,
  osm_id bigint,
  geom extensions.geometry(LineString, 4326) not null,
  source bigint,
  target bigint,
  length_m double precision,
  highway text not null,
  name text,
  -- Road-level sidewalk status from ipoh_extract.py. 'footpath' = the edge is itself a path.
  sidewalk text not null check (sidewalk in ('yes', 'no', 'unknown', 'footpath')),
  footway text,                                 -- 'sidewalk', 'crossing' or null
  lit boolean,                                  -- null = not yet checked
  crossing text,                                -- OSM crossing tag on crossing edges
  maxspeed integer,                             -- km/h, null when not tagged
  -- Penalties from Section 7.1 (0 = no known problem). Hazards are added at query time.
  score_day double precision not null default 0,
  score_night double precision not null default 0,
  is_unknown boolean not null default false,   -- "not yet checked" in the route stats
  data_source text not null default 'osm' check (data_source in ('osm', 'audit')),
  created_at timestamptz not null default now()
);

create index road_segments_geom_idx on public.road_segments using gist (geom);
create index road_segments_source_idx on public.road_segments (source);
create index road_segments_target_idx on public.road_segments (target);

alter table public.road_segments enable row level security;

-- Junctions produced by pgr_extractVertices. Server side only.
create table public.road_vertices (
  id bigint primary key,
  geom extensions.geometry(Point, 4326) not null
);
create index road_vertices_geom_idx on public.road_vertices using gist (geom);

alter table public.road_vertices enable row level security;

-- ---------------------------------------------------------------------------
-- amenities: crossings, bus stops, shelters, street lamps, traffic signals.
-- ---------------------------------------------------------------------------
create table public.amenities (
  id bigint generated always as identity primary key,
  osm_id bigint,
  kind text not null check (kind in ('crossing', 'bus_stop', 'shelter', 'street_lamp', 'traffic_signals')),
  geom extensions.geometry(Point, 4326) not null,
  name text,
  tags jsonb not null default '{}'::jsonb,      -- crossing type, bench, lit, tactile_paving
  source text not null default 'osm' check (source in ('osm', 'audit')),
  created_at timestamptz not null default now()
);

create index amenities_geom_idx on public.amenities using gist (geom);
create index amenities_kind_idx on public.amenities (kind);

alter table public.amenities enable row level security;

-- ---------------------------------------------------------------------------
-- places: Ipoh place names from OSM for search (pg_trgm).
-- ---------------------------------------------------------------------------
create table public.places (
  id bigint generated always as identity primary key,
  osm_id bigint,
  osm_type text check (osm_type in ('node', 'way', 'street')),
  name text not null,
  alt_names text[] not null default '{}',
  category text,
  area text,                                    -- nearest suburb or neighbourhood, for the result row
  search_text text not null,                    -- lower-case name plus alt names, filled by the loader
  geom extensions.geometry(Point, 4326) not null,
  created_at timestamptz not null default now()
);

create index places_search_trgm_idx on public.places using gin (search_text extensions.gin_trgm_ops);
create index places_geom_idx on public.places using gist (geom);

alter table public.places enable row level security;

-- ---------------------------------------------------------------------------
-- reports: hazards and improvements in one table (Section 7.2).
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('hazard', 'improvement')),
  category text not null check (category ~ '^[a-z_]{1,40}$'),
  geom extensions.geometry(Point, 4326) not null,
  note text check (char_length(note) <= 500),
  photo_path text check (char_length(photo_path) <= 200),
  post_anonymously boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired')),
  created_at timestamptz not null default now(),
  -- Hazards expire after 7 days unless confirmed. Improvements never expire. Set by trigger.
  expires_at timestamptz
);

create or replace function public.reports_set_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'hazard' then
    new.expires_at := now() + interval '7 days';
  else
    new.expires_at := null;
  end if;
  return new;
end;
$$;

create trigger reports_set_expiry
  before insert on public.reports
  for each row execute function public.reports_set_expiry();

create index reports_geom_idx on public.reports using gist (geom);
create index reports_status_idx on public.reports (kind, status);
create index reports_user_idx on public.reports (user_id);

alter table public.reports enable row level security;

-- ---------------------------------------------------------------------------
-- report_votes: one vote per user per report.
-- 'confirm' and 'gone' answer Still there / Gone on hazards; 'upvote' is for improvements.
-- ---------------------------------------------------------------------------
create table public.report_votes (
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vote text not null check (vote in ('confirm', 'gone', 'upvote')),
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create index report_votes_user_idx on public.report_votes (user_id);

alter table public.report_votes enable row level security;

-- ---------------------------------------------------------------------------
-- Grants and policies.
-- Map data is read-only for everyone. Only the loader (postgres role) writes it.
-- Guests (anonymous sign-in) may read but not write (Section 8).
-- ---------------------------------------------------------------------------
revoke all on public.road_segments, public.road_vertices, public.amenities, public.places,
  public.reports, public.report_votes from anon, authenticated;

grant select on public.amenities, public.places to anon, authenticated;
create policy "Map data is readable by everyone" on public.amenities
  for select to anon, authenticated using (true);
create policy "Place names are readable by everyone" on public.places
  for select to anon, authenticated using (true);
-- road_segments and road_vertices: no client access. Routes come from route_safe() (Phase 2).

-- Helper: true for a signed-in user who is not an anonymous guest.
create or replace function public.is_full_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

-- reports: user_id is never readable by clients, so "post anonymously" holds.
-- Status and expiry are server-controlled, so clients cannot write them.
grant select (id, kind, category, geom, note, photo_path, post_anonymously, status, created_at, expires_at)
  on public.reports to anon, authenticated;
grant insert (kind, category, geom, note, photo_path, post_anonymously) on public.reports to authenticated;
grant update (note, photo_path, post_anonymously) on public.reports to authenticated;
grant delete on public.reports to authenticated;

create policy "Reports are readable by everyone" on public.reports
  for select to anon, authenticated using (true);
create policy "Signed-in users create their own reports" on public.reports
  for insert to authenticated with check (public.is_full_user() and user_id = (select auth.uid()));
create policy "Users edit their own reports" on public.reports
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own reports" on public.reports
  for delete to authenticated using (user_id = (select auth.uid()));

-- report_votes: users only see and change their own votes. Counts come from server functions (Phase 5).
grant select, insert, delete on public.report_votes to authenticated;

create policy "Users see their own votes" on public.report_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Signed-in users vote once per report" on public.report_votes
  for insert to authenticated with check (public.is_full_user() and user_id = (select auth.uid()));
create policy "Users remove their own votes" on public.report_votes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Functions in public are callable through the API, so keep helpers private.
revoke execute on function public.reports_set_expiry() from public, anon, authenticated;
