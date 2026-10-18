-- Test-note fix N1 (guide Section 17.6).
-- With prefer cover on, Safest could become a line with a lower score or more hazards
-- than the plain Safest (700 m, 1 hazard, score 59 against 900 m, no hazards, 69).
-- Now the covered line is only used when it is at least as safe on both counts.
-- route_safe: body from migration 21, plus that check. Same signature, so the grants stay.

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
  plain jsonb;
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

  -- Cover may only trade a little walking for shade. If the covered line scores lower or
  -- passes more hazards than the plain safest line, keep the plain one (test note N1).
  if coalesce(p_cover, false) and safest is not null then
    plain := private.route_build(net, 'length_m * (1 + pen)');
    if plain is not null and (
         (safest ->> 'score')::numeric < (plain ->> 'score')::numeric
      or (safest -> 'stats' ->> 'hz')::numeric > (plain -> 'stats' ->> 'hz')::numeric) then
      safest := plain;
    end if;
  end if;

  if safest is null or fastest is null then
    return jsonb_build_object('error', case when coalesce(p_step_free, false) then 'no_step_free' else 'no_route' end);
  end if;

  safest := private.add_quests(private.add_covered(safest));
  fastest := private.add_quests(private.add_covered(fastest));
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
