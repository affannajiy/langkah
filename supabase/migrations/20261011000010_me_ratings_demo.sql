-- Phase 6: arrival rating, the Me tab and demo mode.
-- Guide Sections 5.2 (screens 16 to 18), 6.3 (screen 8) and 8 (RLS on every table).

-- ---------------------------------------------------------------------------
-- Demo mode. One private switch, flipped only with SQL (dashboard SQL editor):
--   update public.app_flags set demo_open_writes = true,  updated_at = now();  -- demo on
--   update public.app_flags set demo_open_writes = false, updated_at = now();  -- demo off
-- While it is on, guests (anonymous accounts) may report and vote without Google
-- sign-in, so a demo works on phones with no Google account. Every other check
-- (categories, Ipoh only, 20 reports a day, no self-votes) still applies.
-- Turn it off after the demo.
-- ---------------------------------------------------------------------------
create table public.app_flags (
  id boolean primary key default true check (id), -- at most one row
  demo_open_writes boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.app_flags enable row level security;
revoke all on public.app_flags from anon, authenticated;

insert into public.app_flags (id) values (true) on conflict (id) do nothing;

create or replace function public.demo_writes_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.demo_open_writes from public.app_flags f where f.id), false);
$$;

-- "May this user write?" Signed in with Google, or any signed-in guest while demo
-- mode is on. Used by every write policy (reports, votes, photo uploads).
create or replace function public.is_full_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
          or public.demo_writes_open());
$$;

-- What the app needs to know about the server's switches.
create or replace function public.app_status()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('demo', public.demo_writes_open());
$$;

-- ---------------------------------------------------------------------------
-- walk_ratings: "How safe did this walk feel?" on the Arrival screen (1 to 5).
-- No route line, no start or end point: only the numbers needed to compare how
-- safe walks felt with the route's safety score. Guests may rate too.
-- No client access; written only through rate_walk().
-- ---------------------------------------------------------------------------
create table public.walk_ratings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  mode text not null check (mode in ('day', 'night')),
  route_kind text not null check (route_kind in ('safest', 'fastest')),
  score smallint check (score between 0 and 100),
  distance_m int check (distance_m between 0 and 50000),
  created_at timestamptz not null default now()
);

create index walk_ratings_user_idx on public.walk_ratings (user_id, created_at);

alter table public.walk_ratings enable row level security;
revoke all on public.walk_ratings from anon, authenticated;

create or replace function public.rate_walk(
  p_rating int, p_mode text, p_kind text, p_score int default null, p_distance int default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if (select count(*) from public.walk_ratings w
      where w.user_id = auth.uid() and w.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_ratings' using errcode = '54000';
  end if;
  insert into public.walk_ratings (user_id, rating, mode, route_kind, score, distance_m)
  values (auth.uid(), p_rating, p_mode, p_kind, p_score, p_distance);
end;
$$;

-- ---------------------------------------------------------------------------
-- Me tab: the user's own reports (every status, newest first) in the same shape as
-- community_reports, so the app reuses its rows and detail sheet.
-- ---------------------------------------------------------------------------
create or replace function public.my_reports(p_offset int default 0, p_limit int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(item order by created desc), '[]'::jsonb))
  from (
    select r.created_at as created,
           jsonb_build_object(
             'id', r.id,
             'kind', r.kind,
             'cat', r.category,
             'lon', round(st_x(r.geom)::numeric, 5),
             'lat', round(st_y(r.geom)::numeric, 5),
             'note', r.note,
             'photo', r.photo_path,
             'status', case when r.status <> 'expired' and r.expires_at <= now()
                            then 'expired' else r.status end,
             'created', r.created_at,
             'expires', r.expires_at,
             'by', case when r.post_anonymously then null else p.display_name end,
             'confirms', v.confirms,
             'gone', v.gone,
             'upvotes', v.upvotes,
             'mine', true,
             'myVote', null,
             'street', s.name,
             'dist', null) as item
    from reports r
    left join profiles p on p.id = r.user_id
    left join lateral (
      select count(*) filter (where x.vote = 'confirm') as confirms,
             count(*) filter (where x.vote = 'gone') as gone,
             count(*) filter (where x.vote = 'upvote') as upvotes
      from report_votes x
      where x.report_id = r.id and x.user_id <> r.user_id) v on true
    left join lateral (
      select g.name from road_segments g
      where g.name is not null and st_dwithin(g.geom, r.geom, 0.0004)
      order by g.geom <-> r.geom
      limit 1) s on true
    where auth.uid() is not null and r.user_id = auth.uid()
    order by r.created_at desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 30), 1), 50)
  ) q;
$$;

-- Contribution stats: reports posted, votes given, and how many times other people
-- agreed with the user's reports (Still there or upvote).
create or replace function public.my_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reports', (select count(*) from public.reports r where r.user_id = auth.uid()),
    'votes', (select count(*) from public.report_votes v where v.user_id = auth.uid()),
    'agreed', (select count(*) from public.report_votes v
               join public.reports r on r.id = v.report_id
               where r.user_id = auth.uid() and v.user_id <> auth.uid()
                 and v.vote in ('confirm', 'upvote')))
  where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Helpers stay private; app entry points are listed explicitly.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.demo_writes_open(),
  public.app_status(),
  public.rate_walk(int, text, text, int, int),
  public.my_reports(int, int),
  public.my_stats()
from public, anon;

-- is_full_user() and app_status() run as the caller, so callers need demo_writes_open().
grant execute on function public.demo_writes_open() to anon, authenticated;
grant execute on function public.app_status() to anon, authenticated;
grant execute on function
  public.rate_walk(int, text, text, int, int),
  public.my_reports(int, int),
  public.my_stats()
to authenticated;
