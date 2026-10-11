-- Phase 2: place search and safe routing (guide Sections 4.1, 6.3 screens 2 and 3, 7.1, 7.4).
--   search_places(q, near_lon, near_lat)            -> up to 10 places
--   route_safe(start_lon, start_lat, end_lon, end_lat, mode) -> safest and fastest routes as JSON
-- Helpers live in the "private" schema, which the API does not expose.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- New columns, filled by rebuild_network().
-- ---------------------------------------------------------------------------
alter table public.road_vertices
  add column component bigint,
  add column unsafe_junction boolean not null default false;  -- main-road junction with no marked crossing or signal

alter table public.road_segments
  add column component bigint;

create index road_segments_component_idx on public.road_segments (component);

-- ---------------------------------------------------------------------------
-- rebuild_network(): same as before, plus connected components and unsafe junctions.
-- ---------------------------------------------------------------------------
create or replace function public.rebuild_network()
returns table (segments bigint, vertices bigint)
language plpgsql
set search_path = public, extensions
as $$
begin
  -- 1. Length in metres.
  update road_segments set length_m = st_length(geom::geography);

  -- 2. Topology. The loader splits ways at shared OSM nodes, so edges meet at exact
  --    end points and pgr_extractVertices can number the junctions.
  truncate road_vertices;
  insert into road_vertices (id, geom)
  select id, geom
  from pgr_extractVertices('select id, geom from road_segments order by id');

  update road_segments as e set source = v.id
  from (select id, unnest(out_edges) as e_id
        from pgr_extractVertices('select id, geom from road_segments order by id')) as v
  where e.id = v.e_id;

  update road_segments as e set target = v.id
  from (select id, unnest(in_edges) as e_id
        from pgr_extractVertices('select id, geom from road_segments order by id')) as v
  where e.id = v.e_id;

  -- 3. Connected components. Routes only snap to the largest one (the main network),
  --    so a start point on an isolated service road cannot strand the search.
  update road_vertices v set component = c.component
  from pgr_connectedComponents(
    'select id, source, target, length_m as cost, length_m as reverse_cost from road_segments') c
  where v.id = c.node;

  update road_segments s set component = v.component
  from road_vertices v
  where v.id = s.source;

  -- 4. Scores. Each rule in Table 9 adds its penalty. Hazards are added at query time.
  update road_segments set score_day = 0, score_night = 0, is_unknown = false;

  -- No sidewalk on a main road (primary or secondary).
  update road_segments set score_day = score_day + 1.5, score_night = score_night + 2.0
  where sidewalk = 'no'
    and highway in ('primary', 'primary_link', 'secondary', 'secondary_link');

  -- No sidewalk on a smaller road (residential and the other minor road types).
  update road_segments set score_day = score_day + 0.3, score_night = score_night + 0.5
  where sidewalk = 'no'
    and highway not in ('primary', 'primary_link', 'secondary', 'secondary_link');

  -- Road not lit (night only).
  update road_segments set score_night = score_night + 1.0
  where lit = false;

  -- Traffic at 60 km/h or more: on the road itself, or on a separate sidewalk beside it.
  update road_segments set score_day = score_day + 0.5, score_night = score_night + 0.7
  where maxspeed >= 60
     or (footway = 'sidewalk' and exists (
           select 1 from road_segments r
           where r.maxspeed >= 60
             and st_dwithin(r.geom::geography, road_segments.geom::geography, 15)));

  -- Crossing a main road without a marked crossing:
  -- (a) a crossing edge that is not marked and touches a main road;
  update road_segments as c set score_day = score_day + 1.0, score_night = score_night + 1.5
  where c.footway = 'crossing'
    and coalesce(c.crossing, 'unknown') in ('unmarked', 'no', 'unknown', 'informal')
    and exists (
      select 1 from road_segments r
      where r.highway in ('primary', 'primary_link', 'secondary', 'secondary_link')
        and st_intersects(r.geom, c.geom));

  -- (b) a minor road or path that meets a main road at a junction with no marked
  --     crossing or traffic signal within 15 m. Version 1 approximation: walking
  --     through that junction usually means crossing the main road.
  update road_vertices v set unsafe_junction = true
  where exists (select 1 from road_segments r
                where (r.source = v.id or r.target = v.id)
                  and r.highway in ('primary', 'primary_link', 'secondary', 'secondary_link'))
    and not exists (select 1 from amenities a
                    where (a.kind = 'traffic_signals'
                           or (a.kind = 'crossing' and coalesce(a.tags ->> 'crossing', '') in
                               ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan')))
                      and st_dwithin(a.geom::geography, v.geom::geography, 15));

  update road_segments as s set score_day = score_day + 1.0, score_night = score_night + 1.5
  where s.highway not in ('primary', 'primary_link', 'secondary', 'secondary_link')
    and coalesce(s.footway, '') <> 'crossing'
    and exists (select 1 from road_vertices v
                where v.unsafe_junction and (v.id = s.source or v.id = s.target));

  -- Not yet checked: sidewalk unknown on a road, or lighting not tagged.
  update road_segments set is_unknown = true
  where sidewalk = 'unknown' or lit is null;

  update road_segments set score_day = score_day + 0.2, score_night = score_night + 0.4
  where is_unknown;

  analyze road_segments;
  analyze road_vertices;

  return query select (select count(*) from road_segments), (select count(*) from road_vertices);
end;
$$;

revoke execute on function public.rebuild_network() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Area labels for search results (screen 2 shows "Ipoh Railway Station, Jalan ...").
-- Nearest named street within 100 m, else nearest neighbourhood within 1 km, else Ipoh.
-- Called by load_to_supabase.py after each load.
-- ---------------------------------------------------------------------------
create or replace function private.label_places()
returns bigint
language plpgsql
set search_path = public, extensions
as $$
declare
  n bigint;
begin
  update places p set area = coalesce(
    -- A street's own name is not a useful label, so streets skip this step.
    case when p.osm_type <> 'street' then (
      select s.name from road_segments s
      where s.name is not null
        and s.name <> p.name
        and s.highway not in ('footway', 'path', 'steps', 'cycleway', 'corridor', 'track')
        and s.geom && st_expand(p.geom, 0.001)
        and st_dwithin(s.geom::geography, p.geom::geography, 100)
      order by s.geom <-> p.geom
      limit 1)
    end,
    (select h.name from places h
     where h.category in ('place:suburb', 'place:neighbourhood', 'place:quarter')
       and h.id <> p.id
       and st_dwithin(h.geom::geography, p.geom::geography, 1000)
     order by h.geom <-> p.geom
     limit 1),
    'Ipoh');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- search_places: fuzzy place search with pg_trgm (Section 7.4: at most 10 results).
-- word_similarity matches a short query against part of a longer name
-- ("clock tower" finds "Birch Memorial Clock Tower"). Optional near point adds distance.
-- ---------------------------------------------------------------------------
create or replace function public.search_places(
  q text,
  near_lon double precision default null,
  near_lat double precision default null)
returns table (name text, area text, category text, lon numeric, lat numeric, dist_m integer)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select lower(trim(left(q, 100))) as t,
           case when near_lon is not null and near_lat is not null
                then st_setsrid(st_makepoint(near_lon, near_lat), 4326) end as near
  ),
  hits as (
    select p.name, p.area, p.category, p.geom,
           word_similarity(i.t, p.search_text) as sim,
           p.search_text like (replace(replace(replace(i.t, '\', '\\'), '%', '\%'), '_', '\_') || '%') as prefix,
           case when i.near is not null
                then st_distance(p.geom::geography, i.near::geography) end as dist
    from places p, input i
    where char_length(i.t) >= 2
      and (i.t <% p.search_text
           or p.search_text like ('%' || replace(replace(replace(i.t, '\', '\\'), '%', '\%'), '_', '\_') || '%'))
  )
  -- One row per name per ~200 m cell (a bus station and its stop, a shop and its building).
  , uniq as (
    select distinct on (lower(name), st_snaptogrid(geom, 0.002)) *
    from hits
    order by lower(name), st_snaptogrid(geom, 0.002), sim desc
  )
  select name, area, category,
         round(st_x(geom)::numeric, 5), round(st_y(geom)::numeric, 5),
         round(dist)::integer
  from uniq
  order by prefix desc, sim desc, dist nulls last, name
  limit 10;
$$;

revoke execute on function public.search_places(text, double precision, double precision) from public;
grant execute on function public.search_places(text, double precision, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Routing helpers.
-- ---------------------------------------------------------------------------

-- The walk network around one request. The two snapped edges are cut at the snap
-- points, which become virtual vertices -1 (start) and -2 (end), so a route starts
-- exactly where the user is instead of at the junction behind them.
-- pen = mode score + 3.0 for an active hazard within 15 m (Table 9).
create or replace function private.route_net(
  p_main bigint, p_box extensions.geometry,
  p_s bigint, p_sf double precision, p_e bigint, p_ef double precision,
  p_night boolean)
returns table (id bigint, source bigint, target bigint, geom extensions.geometry, length_m double precision,
               pen double precision, hazard boolean, sidewalk text, lit boolean, footway text,
               crossing text, highway text, name text, is_unknown boolean)
language plpgsql
stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  f1 double precision := least(p_sf, p_ef);
  f2 double precision := greatest(p_sf, p_ef);
begin
  return query
  with seg as (
    select s.id, s.source, s.target, s.geom, s.length_m,
           (case when p_night then s.score_night else s.score_day end)
             + case when h.hit then 3.0 else 0 end as pen,
           coalesce(h.hit, false) as hazard,
           s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown
    from road_segments s
    left join lateral (
      select true as hit from reports r
      where r.kind = 'hazard' and r.status = 'active'
        and (r.expires_at is null or r.expires_at > now())
        and r.geom && st_expand(s.geom, 0.0003)
        and st_dwithin(r.geom::geography, s.geom::geography, 15)
      limit 1) h on true
    where s.component = p_main and s.geom && p_box
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
         s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown
  from seg s
  where s.id <> p_s and s.id <> p_e
  union all
  select c.pid, coalesce(c.vs, s.source), coalesce(c.vt, s.target),
         -- A zero-length piece keeps the graph connected; it is a two-point line on one spot.
         case when c.ft - c.ff < 1e-9
              then st_makeline(st_lineinterpolatepoint(s.geom, c.ff), st_lineinterpolatepoint(s.geom, c.ff))
              else st_linesubstring(s.geom, c.ff, c.ft) end,
         s.length_m * (c.ft - c.ff), s.pen, s.hazard,
         s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown
  from cuts c
  join seg s on s.id = c.edge;
end;
$$;

-- Landmark near a turn, for wording steps by landmark (CLAUDE.md, Section 7.5).
-- Priority: marked crossing, traffic signals, bus stop, shelter, named place.
create or replace function private.landmark(p extensions.geometry)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_strip_nulls(jsonb_build_object('k', k, 'n', n))
  from (
    select case a.kind when 'traffic_signals' then 'signals' else a.kind end as k, a.name as n,
           case a.kind when 'crossing' then 1 when 'traffic_signals' then 2 when 'bus_stop' then 3 else 4 end as pri,
           st_distance(a.geom::geography, p::geography) as d
    from amenities a
    where a.geom && st_expand(p, 0.0003)
      and st_dwithin(a.geom::geography, p::geography, 25)
      and a.kind in ('crossing', 'traffic_signals', 'bus_stop', 'shelter')
      and (a.kind <> 'crossing' or coalesce(a.tags ->> 'crossing', '') in
           ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan'))
    union all
    select 'place', pl.name, 5, st_distance(pl.geom::geography, p::geography)
    from places pl
    where pl.osm_type <> 'street'
      and pl.geom && st_expand(p, 0.0003)
      and st_dwithin(pl.geom::geography, p::geography, 25)
  ) x
  order by pri, d
  limit 1;
$$;

-- Name of the road a separate sidewalk runs beside, so steps say "Jalan X" not "path".
create or replace function private.beside_road(g extensions.geometry)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select r.name from road_segments r
  where r.name is not null
    and coalesce(r.footway, '') not in ('sidewalk', 'crossing')
    and r.geom && st_expand(g, 0.0003)
    and st_dwithin(r.geom::geography, g::geography, 20)
  order by r.geom <-> g
  limit 1;
$$;

-- Turn type from the change of heading in degrees (positive = clockwise = right).
create or replace function private.turn_type(delta double precision)
returns text
language sql
immutable
as $$
  select case
    when delta is null or abs(delta) < 20 then 'straight'
    when delta >= 20 and delta < 45 then 'slight_right'
    when delta >= 45 then 'right'
    when delta <= -20 and delta > -45 then 'slight_left'
    else 'left' end;
$$;

-- Build one route as JSON from a pgr_dijkstra run over the request network.
--   p_net:  SQL returning the network (a call to private.route_net)
--   p_cost: cost expression over that network
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
    for i in 1 .. st_npoints(g) loop
      if array_length(pts, 1) is null or not st_equals(pts[array_length(pts, 1)], st_pointn(g, i)) then
        pts := pts || st_pointn(g, i);
      end if;
    end loop;

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
    'edges', to_jsonb(edges));
end;
$$;

-- ---------------------------------------------------------------------------
-- route_safe: both routes in one call (Section 4.1 steps 2 to 5).
-- Safest cost = length x (1 + safety penalty + active hazard penalty); fastest cost = length.
-- Returns {"error": "..."} instead of failing, so the app can show a clear message.
-- Runs as the owner because road_segments has no client access; it only reads.
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

  -- The main network is the largest connected component.
  select component into v_main
  from road_vertices where component is not null
  group by component order by count(*) desc limit 1;

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

-- Helpers are private; route_safe reaches them as the owner.
revoke all on all functions in schema private from public, anon, authenticated;

-- The new columns and labels are filled by data-scripts/load_to_supabase.py,
-- which calls rebuild_network() and private.label_places() after each load.
