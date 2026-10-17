-- Phases 20 and 24: route options (guide Sections 16.3 and 16.7, decided 2026-10-18).
--
-- 1. Prefer cover (Phase 20). When it rains or is very hot (the app asks Open-Meteo
--    for the pilot area, never the walker's own spot), or the walker taps the chip,
--    Safest pays extra for every metre that is not under cover, so it leans onto
--    five-foot ways and covered paths. Weight: private.score_weights 'uncovered_weather'.
--    The shown score does not change: weather is not a safety fact about a street.
-- 2. Step-free (Phase 24). Both routes skip highway=steps. stats.kx counts the
--    crossings on the route with no mapped kerb ramp near them, so the card can say
--    where kerbs are not checked. OSM in the pilot areas has very few ramps yet.
--
-- route_safe keeps its first five arguments, so older app builds still work.

insert into private.score_weights (rule, day, night, note) values
  ('uncovered_weather', 0.6, 0.6, 'Safest only, when rain or heat is on: extra cost per metre not under cover (not in the shown score)')
on conflict (rule) do nothing;

-- ---------------------------------------------------------------------------
-- route_net: body from migration 11, plus the covered column and the steps filter.
-- ---------------------------------------------------------------------------
drop function if exists private.route_net(bigint, extensions.geometry, bigint, double precision, bigint, double precision, boolean);

create or replace function private.route_net(
  p_main bigint, p_box extensions.geometry,
  p_s bigint, p_sf double precision, p_e bigint, p_ef double precision,
  p_night boolean, p_step_free boolean default false)
returns table (id bigint, source bigint, target bigint, geom extensions.geometry, length_m double precision,
               pen double precision, hazard boolean, sidewalk text, lit boolean, footway text,
               crossing text, highway text, name text, is_unknown boolean, covered boolean)
language plpgsql
stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  f1 double precision := least(p_sf, p_ef);
  f2 double precision := greatest(p_sf, p_ef);
  hz double precision := (select case when p_night then w.night else w.day end
                          from private.score_weights w where w.rule = 'active_hazard');
begin
  return query
  with seg as (
    select s.id, s.source, s.target, s.geom, s.length_m,
           (case when p_night then s.score_night else s.score_day end)
             + case when h.hit then coalesce(hz, 3.0) else 0 end as pen,
           coalesce(h.hit, false) as hazard,
           s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown, s.covered
    from road_segments s
    left join lateral (
      select true as hit from reports r
      where r.kind = 'hazard' and r.status = 'active'
        and (r.expires_at is null or r.expires_at > now())
        and r.geom && st_expand(s.geom, 0.0003)
        and st_dwithin(r.geom::geography, s.geom::geography, 15)
      limit 1) h on true
    where s.component = p_main and s.geom && p_box
      -- Step-free: no stairs, except the edges the start or end sit on.
      and (not p_step_free or s.highway is distinct from 'steps' or s.id in (p_s, p_e))
  ),
  -- Pieces of the snapped edges: (edge, from fraction, to fraction, from vertex, to vertex, piece id).
  cuts (edge, ff, ft, vs, vt, pid) as (
    select p_s, 0::float8, p_sf, null::bigint, -1::bigint, -11::bigint where p_s <> p_e
    union all select p_s, p_sf, 1, -1, null, -12 where p_s <> p_e
    union all select p_e, 0, p_ef, null, -2, -21 where p_s <> p_e
    union all select p_e, p_ef, 1, -2, null, -22 where p_s <> p_e
    -- Both points on one edge: three pieces, in order along the edge.
    union all select p_s, 0, f1, null, case when p_sf <= p_ef then -1 else -2 end, -11 where p_s = p_e
    union all select p_s, f1, f2, case when p_sf <= p_ef then -1 else -2 end,
                     case when p_sf <= p_ef then -2 else -1 end, -12 where p_s = p_e
    union all select p_s, f2, 1, case when p_sf <= p_ef then -2 else -1 end, null, -13 where p_s = p_e
  )
  select s.id, s.source, s.target, s.geom, s.length_m, s.pen, s.hazard,
         s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown, s.covered
  from seg s
  where s.id <> p_s and s.id <> p_e
  union all
  select c.pid, coalesce(c.vs, s.source), coalesce(c.vt, s.target),
         -- A zero-length piece keeps the graph connected; it is a two-point line on one spot.
         case when c.ft - c.ff < 1e-9
              then st_makeline(st_lineinterpolatepoint(s.geom, c.ff), st_lineinterpolatepoint(s.geom, c.ff))
              else st_linesubstring(s.geom, c.ff, c.ft) end,
         s.length_m * (c.ft - c.ff), s.pen, s.hazard,
         s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown, s.covered
  from cuts c
  join seg s on s.id = c.edge;
end;
$$;

revoke all on function private.route_net(bigint, extensions.geometry, bigint, double precision, bigint, double precision, boolean, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- add_kerbs: crossings on the route with no kerb ramp mapped within 12 m.
-- Step-free walks only.
-- ---------------------------------------------------------------------------
create or replace function private.add_kerbs(r jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  line geometry;
  kx int;
begin
  if r is null then
    return null;
  end if;
  line := st_linefromencodedpolyline(r ->> 'poly', 5);
  select count(*) into kx
  from amenities c
  where c.kind = 'crossing'
    and c.geom && st_expand(line, 0.0001)
    and st_dwithin(c.geom::geography, line::geography, 8)
    and not exists (select 1 from amenities k
                    where k.kind = 'kerb_ramp'
                      and k.geom && st_expand(c.geom, 0.0002)
                      and st_dwithin(k.geom::geography, c.geom::geography, 12));
  return r || jsonb_build_object('stats', (r -> 'stats') || jsonb_build_object('kx', kx));
end;
$$;

revoke all on function private.add_kerbs(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- route_safe: body from migration 17, plus p_cover and p_step_free.
-- ---------------------------------------------------------------------------
drop function if exists public.route_safe(double precision, double precision, double precision, double precision, text);

create or replace function public.route_safe(
  start_lon double precision, start_lat double precision,
  end_lon double precision, end_lat double precision,
  mode text default 'day',
  p_cover boolean default false,
  p_step_free boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  a geometry;
  b geometry;
  v_main bigint;
  s record;
  e record;
  box geometry;
  net text;
  safest jsonb;
  fastest jsonb;
  w_cover double precision;
  cost text := 'length_m * (1 + pen)';
begin
  if mode is null or mode not in ('day', 'night') then
    return jsonb_build_object('error', 'bad_mode');
  end if;
  if start_lon is null or start_lat is null or end_lon is null or end_lat is null
     or abs(start_lon) > 180 or abs(end_lon) > 180 or abs(start_lat) > 90 or abs(end_lat) > 90 then
    return jsonb_build_object('error', 'bad_point');
  end if;

  a := st_setsrid(st_makepoint(start_lon, start_lat), 4326);
  b := st_setsrid(st_makepoint(end_lon, end_lat), 4326);

  if st_distance(a::geography, b::geography) > 10000 then
    return jsonb_build_object('error', 'too_far');
  end if;
  if st_distance(a::geography, b::geography) < 15 then
    return jsonb_build_object('error', 'too_close');
  end if;

  -- The main network is the largest big component within 250 m of the start
  -- (one per pilot area). The end must snap to the same one.
  select rs.component into v_main
  from road_segments rs
  join (select component, count(*) as n from road_vertices
        where component is not null group by component having count(*) >= 500) c
    on c.component = rs.component
  where rs.geom && st_expand(a, 0.003)
    and st_dwithin(rs.geom::geography, a::geography, 250)
  order by c.n desc
  limit 1;
  if v_main is null then
    return jsonb_build_object('error', 'start_off_network');
  end if;

  -- Snap each point to the nearest edge of the main network (at most 250 m away).
  -- Step-free never snaps onto stairs.
  select id, st_linelocatepoint(geom, a) as f into s
  from road_segments
  where component = v_main and st_dwithin(geom::geography, a::geography, 250)
    and (not coalesce(p_step_free, false) or highway is distinct from 'steps')
  order by geom <-> a limit 1;
  if s.id is null then
    return jsonb_build_object('error', 'start_off_network');
  end if;

  select id, st_linelocatepoint(geom, b) as f into e
  from road_segments
  where component = v_main and st_dwithin(geom::geography, b::geography, 250)
    and (not coalesce(p_step_free, false) or highway is distinct from 'steps')
  order by geom <-> b limit 1;
  if e.id is null then
    return jsonb_build_object('error', 'end_off_network');
  end if;

  -- Only load the network around the trip (about 1.5 km margin) to keep each call fast.
  box := st_expand(st_envelope(st_collect(a, b)), 0.0135);

  net := format('select * from private.route_net(%s, %L::extensions.geometry, %s, %s, %s, %s, %L, %L)',
                v_main, box::text, s.id, s.f, e.id, e.f, mode = 'night', coalesce(p_step_free, false));

  if coalesce(p_cover, false) then
    select case when mode = 'night' then w.night else w.day end into w_cover
    from private.score_weights w where w.rule = 'uncovered_weather';
    cost := format('length_m * (1 + pen + case when covered then 0 else %s end)', coalesce(w_cover, 0.6));
  end if;

  safest := private.route_build(net, cost);
  fastest := private.route_build(net, 'length_m');

  if safest is null or fastest is null then
    return jsonb_build_object('error', case when coalesce(p_step_free, false) then 'no_step_free' else 'no_route' end);
  end if;

  safest := private.add_covered(safest);
  fastest := private.add_covered(fastest);
  if coalesce(p_step_free, false) then
    safest := private.add_kerbs(safest);
    fastest := private.add_kerbs(fastest);
  end if;

  return jsonb_build_object(
    'mode', mode,
    'cover', coalesce(p_cover, false),
    'stepFree', coalesce(p_step_free, false),
    'same', safest -> 'edges' = fastest -> 'edges',
    'safest', safest - 'edges',
    'fastest', fastest - 'edges');
end;
$$;

revoke execute on function public.route_safe(double precision, double precision, double precision, double precision, text, boolean, boolean) from public;
grant execute on function public.route_safe(double precision, double precision, double precision, double precision, text, boolean, boolean) to anon, authenticated;
