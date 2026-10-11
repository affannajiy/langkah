-- Phase 3: map data for the visible area, and "not yet checked" ranges on routes.
-- Guide Sections 6.2 (route lines, map icons), 6.3 screen 1 (peek sheet counts) and 7.4
-- (only the visible area, coordinates at 5 decimals).

-- ---------------------------------------------------------------------------
-- map_in_view: hazard pins, amenity icons and "near you" counts for one map view.
-- Runs as the caller, so the table policies still apply. Only reads columns that
-- clients may already read. A view wider than about 5.5 km returns {"error": "too_big"}:
-- the app only asks when zoomed in, so a bigger box is a mistake or abuse.
--   hz: [[id, lon, lat, category], ...]   active hazards that have not expired
--   am: [[kind, lon, lat], ...]           marked crossings, bus stops, shelters
--   n:  {"hz": active hazards, "im": open improvement requests}
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
              and (kind in ('bus_stop', 'shelter')
                   or (kind = 'crossing' and coalesce(tags ->> 'crossing', '') in
                       ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan')))
            limit 400) a), '[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- route_build: same as migration 4, plus the "u" ranges. route_safe is unchanged
-- and passes "u" through with the rest of each route.
-- ---------------------------------------------------------------------------

-- Build one route as JSON from a pgr_dijkstra run over the request network.
--   p_net:  SQL returning the network (a call to private.route_net)
--   p_cost: cost expression over that network
-- Phase 3 adds 'u': polyline index ranges [from, to] of "not yet checked" streets,
-- so the app can draw them dotted (Section 6.2).
create or replace function private.route_build(p_net text, p_cost text)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  r record;
  g geometry;
  prev_g geometry;
  prev_name text;
  prev_footway text;
  prev_highway text;
  pts geometry[] := '{}';
  edges bigint[] := '{}';
  steps jsonb := '[]';
  line geometry;
  seg_len double precision;
  leg double precision := 0;
  total double precision := 0;
  pen_sum double precision := 0;
  sw double precision := 0;
  lit double precision := 0;
  unk double precision := 0;
  nosw double precision := 0;
  ux integer := 0;
  heading_in double precision;
  heading_out double precision;
  delta double precision;
  step jsonb;
  el jsonb;
  kept jsonb;
  i integer;
  n integer;
  i0 integer;
  i1 integer;
  u_from integer[] := '{}';
  u_to integer[] := '{}';
  main constant text[] := array['primary', 'primary_link', 'secondary', 'secondary_link'];
begin
  for r in execute format(
    'select d.path_seq, d.node, n.* '
    'from pgr_dijkstra(%L, -1, -2, false) d '
    'join (%s) n on n.id = d.edge '
    'order by d.path_seq',
    format('select id, source, target, %s as cost from (%s) n', p_cost, p_net), p_net)
  loop
    -- Walk the edge in travel direction.
    g := case when r.node = r.source then r.geom else st_reverse(r.geom) end;
    seg_len := coalesce(r.length_m, 0);
    edges := edges || r.id;

    -- Stats, weighted by length.
    total := total + seg_len;
    pen_sum := pen_sum + seg_len * r.pen;
    if r.sidewalk in ('yes', 'footpath') then sw := sw + seg_len; end if;
    if r.lit then lit := lit + seg_len; end if;
    if r.is_unknown then unk := unk + seg_len; end if;
    if r.sidewalk = 'no' then nosw := nosw + seg_len; end if;

    -- Unmarked crossings: an unsafe main-road junction entered or left on a minor edge,
    -- or a crossing edge over a main road that is not marked.
    if r.node > 0 and (r.highway <> all (main) or prev_highway <> all (main))
       and exists (select 1 from road_vertices v where v.id = r.node and v.unsafe_junction) then
      ux := ux + 1;
    end if;
    if r.footway = 'crossing'
       and coalesce(r.crossing, 'unknown') in ('unmarked', 'no', 'unknown', 'informal')
       and exists (select 1 from road_segments m
                   where m.highway = any (main) and m.geom && r.geom and st_intersects(m.geom, r.geom)) then
      ux := ux + 1;
    end if;

    if array_length(pts, 1) is null then
      -- First edge: depart step.
      steps := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        't', 'depart',
        'n', coalesce(r.name, case when r.footway = 'sidewalk' then private.beside_road(r.geom) end),
        'i', 0)));
      leg := seg_len;
    elsif seg_len > 0 then
      -- Heading over the last 15 m in and the first 15 m out of this junction.
      heading_in := st_azimuth(
        st_lineinterpolatepoint(prev_g, greatest(0, 1 - 15 / greatest(st_length(prev_g::geography), 0.01))),
        st_endpoint(prev_g));
      heading_out := st_azimuth(
        st_startpoint(g),
        st_lineinterpolatepoint(g, least(1, 15 / greatest(seg_len, 0.01))));
      delta := degrees(heading_out - heading_in);
      delta := case when delta > 180 then delta - 360 when delta <= -180 then delta + 360 else delta end;

      step := null;
      if r.footway = 'crossing' and coalesce(prev_footway, '') <> 'crossing' then
        step := jsonb_build_object('t', 'cross',
          'x', case when r.crossing in ('traffic_signals', 'pelican', 'toucan') then 'signals'
                    when r.crossing in ('marked', 'zebra', 'uncontrolled') then 'marked'
                    else 'unmarked' end);
      elsif prev_footway = 'crossing' and coalesce(r.footway, '') <> 'crossing' then
        step := jsonb_build_object('t', private.turn_type(delta));
      elsif r.name is distinct from prev_name and coalesce(r.footway, '') <> 'sidewalk' then
        step := jsonb_build_object('t', private.turn_type(delta));
      elsif r.name is null and abs(coalesce(delta, 0)) >= 40 then
        step := jsonb_build_object('t', private.turn_type(delta));
      end if;

      if step is not null then
        n := jsonb_array_length(steps);
        steps := jsonb_set(steps, array[(n - 1)::text, 'd'], to_jsonb(round(leg)::int));
        -- Landmarks only on turns; a crossing step already says what kind of crossing it is.
        steps := steps || jsonb_strip_nulls(step || jsonb_build_object(
          'n', coalesce(r.name, case when r.footway = 'sidewalk' then private.beside_road(r.geom) end),
          'l', case when step ->> 't' in ('left', 'right', 'slight_left', 'slight_right')
                    then private.landmark(st_startpoint(g)) end,
          'i', array_length(pts, 1) - 1));
        leg := 0;
      end if;
      leg := leg + seg_len;
    end if;

    -- Append points, skipping repeats (the shared junction and zero-length pieces).
    i0 := greatest(coalesce(array_length(pts, 1), 1) - 1, 0);
    for i in 1 .. st_npoints(g) loop
      if array_length(pts, 1) is null or not st_equals(pts[array_length(pts, 1)], st_pointn(g, i)) then
        pts := pts || st_pointn(g, i);
      end if;
    end loop;

    -- Unchecked ranges: join this edge to the last range when they touch.
    i1 := array_length(pts, 1) - 1;
    if r.is_unknown and seg_len > 0 and i1 > i0 then
      n := coalesce(array_length(u_to, 1), 0);
      if n > 0 and u_to[n] = i0 then
        u_to[n] := i1;
      else
        u_from := u_from || i0;
        u_to := u_to || i1;
      end if;
    end if;

    if seg_len > 0 then
      prev_g := g;
      prev_name := r.name;
      prev_footway := r.footway;
      prev_highway := r.highway;
    end if;
  end loop;

  if array_length(pts, 1) is null then
    return null;
  end if;
  if array_length(pts, 1) = 1 then
    pts := pts || pts[1];
  end if;

  line := st_makeline(pts);
  n := jsonb_array_length(steps);
  steps := jsonb_set(steps, array[(n - 1)::text, 'd'], to_jsonb(round(leg)::int));
  steps := steps || jsonb_build_object('t', 'arrive', 'i', array_length(pts, 1) - 1);

  -- Drop legs under 15 m that are not crossings: GPS (5 to 10 m) cannot tell such
  -- jogs apart, and they would only add noise. Also drop "straight on" steps that
  -- stay on the street we are already on. Their distance joins the step before.
  kept := '[]';
  for el in select value from jsonb_array_elements(steps) loop
    n := jsonb_array_length(kept);
    if n > 0 and el ->> 't' not in ('depart', 'cross', 'arrive')
       and (coalesce((el ->> 'd')::int, 0) < 15
            or (el ->> 't' = 'straight'
                and kept -> (n - 1) ->> 't' <> 'cross'
                and el ->> 'n' is not distinct from kept -> (n - 1) ->> 'n')) then
      n := jsonb_array_length(kept);
      kept := jsonb_set(kept, array[(n - 1)::text, 'd'],
                        to_jsonb(coalesce((kept -> (n - 1) ->> 'd')::int, 0) + coalesce((el ->> 'd')::int, 0)));
    else
      kept := kept || el;
    end if;
  end loop;
  steps := kept;

  return jsonb_build_object(
    'poly', st_asencodedpolyline(line, 5),
    'dist', round(total)::int,
    'time', round(total / 1.3)::int,                      -- seconds at 1.3 m/s
    'score', case when total > 0
                  then greatest(0, least(100, round(100 - 25 * pen_sum / total)))::int
                  else 100 end,
    'stats', jsonb_build_object(
      'sw',   case when total > 0 then round(100 * sw / total)::int else 0 end,   -- % with sidewalk or path
      'lit',  case when total > 0 then round(100 * lit / total)::int else 0 end,  -- % lit
      'unk',  case when total > 0 then round(100 * unk / total)::int else 0 end,  -- % not yet checked
      'nosw', round(nosw)::int,                                                    -- metres with no sidewalk
      'mx', (select count(*) from amenities a                                      -- marked crossings on route
             where a.kind = 'crossing'
               and coalesce(a.tags ->> 'crossing', '') in
                   ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan')
               and a.geom && st_expand(line, 0.0001)
               and st_dwithin(a.geom::geography, line::geography, 8)),
      'ux', ux,                                                                    -- unmarked main-road crossings
      'hz', (select count(*) from reports h                                        -- active hazards within 15 m
             where h.kind = 'hazard' and h.status = 'active'
               and (h.expires_at is null or h.expires_at > now())
               and h.geom && st_expand(line, 0.0003)
               and st_dwithin(h.geom::geography, line::geography, 15))),
    'steps', steps,
    'u', coalesce((select jsonb_agg(jsonb_build_array(f, t) order by f)
                   from unnest(u_from, u_to) as x(f, t)), '[]'::jsonb),
    'edges', to_jsonb(edges));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
