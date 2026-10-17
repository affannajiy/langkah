-- More detail for walkers (guide Sections 2, 5.2, 6.2 and 8, updated 2026-10-17).
--   1. Covered walkways: road_segments.covered marks five-foot ways (kaki lima),
--      arcades and covered paths, set by load_to_supabase.py. Display and route
--      stats only: scores and routing do not change.
--   2. New amenity kinds from OSM: kerb_ramp (lowered or flush kerb), tactile
--      (tactile paving), bench, toilets, drinking_water. Shown as map layers only;
--      wheelchair routing stays future work (Section 14).
--   3. map_in_view returns the new kinds and "cv", the covered lines in view.
--   4. route_safe adds stats.cov (% of the route covered) and "cv", the covered
--      lines on the route, for the route breakdown and the walk screen.
-- Load the data again afterwards (data-scripts/load_to_supabase.py), or covered
-- stays false everywhere.

alter table public.road_segments add column covered boolean not null default false;

alter table public.amenities drop constraint amenities_kind_check;
alter table public.amenities add constraint amenities_kind_check check (kind in (
  'crossing', 'bus_stop', 'shelter', 'street_lamp', 'traffic_signals',
  'kerb_ramp', 'tactile', 'bench', 'toilets', 'drinking_water'));

-- ---------------------------------------------------------------------------
-- covered_in_view: covered walk lines inside one map view, as encoded polylines
-- (5 decimals). road_segments has no read policy, so this runs as the owner and
-- returns only the lines, nothing else about the network.
-- ---------------------------------------------------------------------------
create or replace function public.covered_in_view(
  min_lon double precision, min_lat double precision,
  max_lon double precision, max_lat double precision)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(st_asencodedpolyline(c.geom, 5)), '[]'::jsonb)
  from (select geom from road_segments
        where covered
          and min_lon < max_lon and min_lat < max_lat
          and max_lon - min_lon <= 0.05 and max_lat - min_lat <= 0.05
          and geom && st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)
        limit 300) c;
$$;

revoke execute on function public.covered_in_view(double precision, double precision, double precision, double precision) from public;
grant execute on function public.covered_in_view(double precision, double precision, double precision, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- add_covered: covered metres and lines for one built route (needs its "edges").
-- The partial edges at the start and end (negative ids) are not counted.
-- ---------------------------------------------------------------------------
create or replace function private.add_covered(r jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  ids bigint[];
  m double precision;
  lines jsonb;
  total double precision := coalesce((r ->> 'dist')::double precision, 0);
begin
  if r is null then
    return null;
  end if;
  ids := array(select (jsonb_array_elements_text(coalesce(r -> 'edges', '[]'::jsonb)))::bigint);
  select coalesce(sum(length_m), 0), coalesce(jsonb_agg(st_asencodedpolyline(geom, 5)), '[]'::jsonb)
    into m, lines
  from road_segments
  where covered and id = any (ids);
  return r
    || jsonb_build_object('cv', lines)
    || jsonb_build_object('stats', (r -> 'stats')
         || jsonb_build_object('cov', case when total > 0 then least(100, round(100 * m / total))::int else 0 end));
end;
$$;

revoke all on function private.add_covered(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- route_safe: body from migration 8, only the two add_covered lines are new.
-- ---------------------------------------------------------------------------
create or replace function public.route_safe(
  start_lon double precision, start_lat double precision,
  end_lon double precision, end_lat double precision,
  mode text default 'day')
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
  select id, st_linelocatepoint(geom, a) as f into s
  from road_segments
  where component = v_main and st_dwithin(geom::geography, a::geography, 250)
  order by geom <-> a limit 1;
  if s.id is null then
    return jsonb_build_object('error', 'start_off_network');
  end if;

  select id, st_linelocatepoint(geom, b) as f into e
  from road_segments
  where component = v_main and st_dwithin(geom::geography, b::geography, 250)
  order by geom <-> b limit 1;
  if e.id is null then
    return jsonb_build_object('error', 'end_off_network');
  end if;

  -- Only load the network around the trip (about 1.5 km margin) to keep each call fast.
  box := st_expand(st_envelope(st_collect(a, b)), 0.0135);

  net := format('select * from private.route_net(%s, %L::extensions.geometry, %s, %s, %s, %s, %L)',
                v_main, box::text, s.id, s.f, e.id, e.f, mode = 'night');

  safest := private.route_build(net, 'length_m * (1 + pen)');
  fastest := private.route_build(net, 'length_m');

  if safest is null or fastest is null then
    return jsonb_build_object('error', 'no_route');
  end if;

  safest := private.add_covered(safest);
  fastest := private.add_covered(fastest);

  return jsonb_build_object(
    'mode', mode,
    'same', safest -> 'edges' = fastest -> 'edges',
    'safest', safest - 'edges',
    'fastest', fastest - 'edges');
end;
$$;

revoke execute on function public.route_safe(double precision, double precision, double precision, double precision, text) from public;
grant execute on function public.route_safe(double precision, double precision, double precision, double precision, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- map_in_view: body from migration 14, plus the new kinds and "cv".
--   am: [[kind, lon, lat], ...]  kinds as above, street lamps and signals excluded
--   cv: ["encoded polyline", ...]  covered walk lines in view
-- ---------------------------------------------------------------------------
create or replace function public.map_in_view(
  min_lon double precision, min_lat double precision,
  max_lon double precision, max_lat double precision)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  box geometry;
begin
  if min_lon is null or min_lat is null or max_lon is null or max_lat is null
     or min_lon < -180 or max_lon > 180 or min_lat < -90 or max_lat > 90
     or min_lon >= max_lon or min_lat >= max_lat then
    return jsonb_build_object('error', 'bad_box');
  end if;
  if max_lon - min_lon > 0.05 or max_lat - min_lat > 0.05 then
    return jsonb_build_object('error', 'too_big');
  end if;

  box := st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326);

  return jsonb_build_object(
    'hz', coalesce((
      select jsonb_agg(jsonb_build_array(r.id, round(st_x(r.geom)::numeric, 5),
                                         round(st_y(r.geom)::numeric, 5), r.category)
                       order by r.created_at desc)
      from (select id, geom, category, created_at from reports
            where kind = 'hazard' and status = 'active'
              and (expires_at is null or expires_at > now())
              and geom && box
            order by created_at desc
            limit 200) r), '[]'::jsonb),
    'am', coalesce((
      select jsonb_agg(jsonb_build_array(a.kind, round(st_x(a.geom)::numeric, 5),
                                         round(st_y(a.geom)::numeric, 5)))
      from (select kind, geom from amenities
            where geom && box
              and (kind in ('bus_stop', 'shelter', 'kerb_ramp', 'tactile', 'bench', 'toilets', 'drinking_water')
                   or (kind = 'crossing' and coalesce(tags ->> 'crossing', '') in
                       ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan')))
            -- The first three kinds go first, so busy streets never push them out.
            order by kind not in ('crossing', 'bus_stop', 'shelter')
            limit 600) a), '[]'::jsonb),
    'cv', public.covered_in_view(min_lon, min_lat, max_lon, max_lat),
    'sp', coalesce((
      select jsonb_agg(jsonb_build_array(q.id, round(st_x(q.geom)::numeric, 5), round(st_y(q.geom)::numeric, 5),
                                         q.name, q.offer_en, q.offer_ms, q.rm_off, q.item, q.cost, q.address)
                       order by q.d)
      from (select p.id, p.geom, p.name, p.offer_en, p.offer_ms, p.rm_off, p.address,
                   s.id as item, s.cost, p.geom <-> st_centroid(box) as d
            from partners p
            join shop_items s on s.partner_id = p.id
            where p.geom && box
            order by d
            limit 3) q), '[]'::jsonb),
    'n', jsonb_build_object(
      'hz', (select count(*) from reports
             where kind = 'hazard' and status = 'active'
               and (expires_at is null or expires_at > now()) and geom && box),
      'im', (select count(*) from reports
             where kind = 'improvement' and status <> 'expired' and geom && box)));
end;
$$;

revoke execute on function public.map_in_view(double precision, double precision, double precision, double precision) from public;
grant execute on function public.map_in_view(double precision, double precision, double precision, double precision) to anon, authenticated;
