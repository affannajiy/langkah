-- Langkah: trunk roads join the walk network as main roads.
-- In Ipoh, roads such as Jalan Panglima Bukit Gantang Wahab (between the railway
-- station and Ipoh Padang) are tagged highway=trunk. They were left out of the
-- network, so walks could not cross them and took long detours (Station to
-- Ipoh Padang: 400 m straight, 1.3 km routed). The loader now keeps trunk roads
-- unless foot=no, and they get every main-road penalty from Section 7.1.
-- Bodies are copied from migrations 4 and 5 with only the main-road lists changed.

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

  -- No sidewalk on a main road (trunk, primary or secondary).
  update road_segments set score_day = score_day + 1.5, score_night = score_night + 2.0
  where sidewalk = 'no'
    and highway in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link');

  -- No sidewalk on a smaller road (residential and the other minor road types).
  update road_segments set score_day = score_day + 0.3, score_night = score_night + 0.5
  where sidewalk = 'no'
    and highway not in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link');

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
      where r.highway in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link')
        and st_intersects(r.geom, c.geom));

  -- (b) a minor road or path that meets a main road at a junction with no marked
  --     crossing or traffic signal within 15 m. Version 1 approximation: walking
  --     through that junction usually means crossing the main road.
  update road_vertices v set unsafe_junction = true
  where exists (select 1 from road_segments r
                where (r.source = v.id or r.target = v.id)
                  and r.highway in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'))
    and not exists (select 1 from amenities a
                    where (a.kind = 'traffic_signals'
                           or (a.kind = 'crossing' and coalesce(a.tags ->> 'crossing', '') in
                               ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan')))
                      and st_dwithin(a.geom::geography, v.geom::geography, 15));

  update road_segments as s set score_day = score_day + 1.0, score_night = score_night + 1.5
  where s.highway not in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link')
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
  main constant text[] := array['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'];
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
