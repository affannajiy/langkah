-- Langkah: route inside each pilot area's own network.
-- route_safe used to snap only to the single largest connected network, which is
-- central Ipoh, so every Seri Iskandar walk failed with start_off_network. The
-- main network is now the largest one near the start point, as long as it is
-- big enough to be a pilot area's street network (500+ junctions), so a start
-- on an isolated service road still cannot strand the search.
-- Body copied from migration 4 with only the main-network choice changed.

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

  return jsonb_build_object(
    'mode', mode,
    'same', safest -> 'edges' = fastest -> 'edges',
    'safest', safest - 'edges',
    'fastest', fastest - 'edges');
end;
$$;

revoke execute on function public.route_safe(double precision, double precision, double precision, double precision, text) from public;
grant execute on function public.route_safe(double precision, double precision, double precision, double precision, text) to anon, authenticated;
