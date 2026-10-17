-- Phase 18: share a live walk (guide Section 16.1, decided 2026-10-18).
--
-- Rules:
-- - Opt-in only: a row exists only after the walker taps Share during a walk.
-- - One row per walker. It holds the latest position only, overwritten in place,
--   never a track. Coordinates at 5 decimals.
-- - When the walk ends or arrives, the position, route and destination are wiped
--   at once. The emptied row stays 15 minutes so the friend's page can say
--   "Arrived" or "Ended", then pg_cron deletes it. Any row is gone 2 hours after
--   the walk started, whatever happens on the phone.
-- - The friend's page reads one row by its random token through share_view, with
--   the public anon key. No user id ever leaves the database.
-- - Guests may share too: a share is never public content.

create table public.walk_shares (
  token text primary key check (token ~ '^[0-9a-f]{32}$'),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  dest_name text check (char_length(dest_name) <= 120),
  dest extensions.geometry(Point, 4326),
  route text check (char_length(route) <= 20000), -- encoded polyline, 5 decimals
  pos extensions.geometry(Point, 4326),
  eta_s int check (eta_s between 0 and 86400),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  arrived boolean not null default false,
  expires_at timestamptz not null default now() + interval '2 hours'
);

alter table public.walk_shares enable row level security;
revoke all on public.walk_shares from anon, authenticated;

-- A point from the app, or null when either part is missing or out of range.
create or replace function private.share_point(p_lon double precision, p_lat double precision)
returns extensions.geometry
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lon is null or p_lat is null or abs(p_lon) > 180 or abs(p_lat) > 90 then null
    else extensions.st_setsrid(extensions.st_makepoint(round(p_lon::numeric, 5), round(p_lat::numeric, 5)), 4326)
  end;
$$;

-- ---------------------------------------------------------------------------
-- share_start: a fresh link for this walk. Replaces any older share by the same
-- walker, so an old link stops working.
-- ---------------------------------------------------------------------------
create or replace function public.share_start(
  p_dest_name text, p_dest_lon double precision, p_dest_lat double precision,
  p_route text, p_lon double precision, p_lat double precision, p_eta_s int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
  v_dest extensions.geometry := private.share_point(p_dest_lon, p_dest_lat);
begin
  if v_user is null then
    return jsonb_build_object('error', 'no_session');
  end if;
  if v_dest is null or coalesce(btrim(p_dest_name), '') = '' then
    return jsonb_build_object('error', 'bad_input');
  end if;

  delete from public.walk_shares where user_id = v_user;
  insert into public.walk_shares (token, user_id, dest_name, dest, route, pos, eta_s)
  values (v_token, v_user, left(btrim(p_dest_name), 120), v_dest, left(p_route, 20000),
          private.share_point(p_lon, p_lat), least(greatest(coalesce(p_eta_s, 0), 0), 86400));

  return jsonb_build_object('token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- share_update: the walker's latest position and time left. A new route only
-- after a reroute (null keeps the old one). Nothing happens once it has ended.
-- ---------------------------------------------------------------------------
create or replace function public.share_update(
  p_lon double precision, p_lat double precision, p_eta_s int, p_route text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pos extensions.geometry := private.share_point(p_lon, p_lat);
  v_n int;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'no_session');
  end if;

  update public.walk_shares
  set pos = coalesce(v_pos, pos),
      eta_s = least(greatest(coalesce(p_eta_s, eta_s, 0), 0), 86400),
      route = coalesce(left(p_route, 20000), route),
      updated_at = now()
  where user_id = auth.uid() and ended_at is null and expires_at > now();
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', v_n > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- share_stop: the walk arrived or ended. Location data is wiped now.
-- ---------------------------------------------------------------------------
create or replace function public.share_stop(p_arrived boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'no_session');
  end if;

  update public.walk_shares
  set pos = null, route = null, dest = null, eta_s = null,
      arrived = coalesce(p_arrived, false),
      ended_at = now(),
      expires_at = least(expires_at, now() + interval '15 minutes')
  where user_id = auth.uid() and ended_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- share_view: what the friend's page shows, by token. Only the walker's first
-- name (when they signed in with Google), never an id or an email.
--   state: live | arrived | ended | gone
-- ---------------------------------------------------------------------------
create or replace function public.share_view(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('state', 'gone');
  end if;

  select s.*, p.display_name into r
  from public.walk_shares s
  left join public.profiles p on p.id = s.user_id
  where s.token = p_token and s.expires_at > now();

  if not found then
    return jsonb_build_object('state', 'gone');
  end if;

  if r.ended_at is not null then
    return jsonb_strip_nulls(jsonb_build_object(
      'state', case when r.arrived then 'arrived' else 'ended' end,
      'name', r.display_name,
      'at', r.ended_at));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'live',
    'name', r.display_name,
    'to', r.dest_name,
    'dest', jsonb_build_array(round(extensions.st_x(r.dest)::numeric, 5), round(extensions.st_y(r.dest)::numeric, 5)),
    'pos', case when r.pos is null then null
                else jsonb_build_array(round(extensions.st_x(r.pos)::numeric, 5), round(extensions.st_y(r.pos)::numeric, 5)) end,
    'route', r.route,
    'eta', r.eta_s,
    'updated', r.updated_at,
    'started', r.started_at,
    'expires', r.expires_at));
end;
$$;

revoke execute on function
  private.share_point(double precision, double precision),
  public.share_start(text, double precision, double precision, text, double precision, double precision, int),
  public.share_update(double precision, double precision, int, text),
  public.share_stop(boolean),
  public.share_view(text)
from public, anon, authenticated;

-- Guests are signed in anonymously, so they have the authenticated role too.
grant execute on function
  public.share_start(text, double precision, double precision, text, double precision, double precision, int),
  public.share_update(double precision, double precision, int, text),
  public.share_stop(boolean)
to authenticated;
grant execute on function public.share_view(text) to anon, authenticated;

-- Old and ended shares go every 10 minutes.
create or replace function private.share_cleanup()
returns void
language sql
set search_path = ''
as $$
  delete from public.walk_shares where expires_at <= now();
$$;
revoke execute on function private.share_cleanup() from public, anon, authenticated;

select cron.schedule('langkah-share-cleanup', '*/10 * * * *', 'select private.share_cleanup()');
