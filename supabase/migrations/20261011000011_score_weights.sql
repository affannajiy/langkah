-- Phase 8: scoring weights in a table, for tuning (guide Section 7.1, Table 9).
-- Before, each penalty was a number inside rebuild_network(), so every change needed
-- a migration and a full network rebuild. Now the numbers live in
-- private.score_weights. To tune, in the dashboard SQL editor:
--   update private.score_weights set night = 1.2, updated_at = now() where rule = 'unlit';
--   select private.score_segments();   -- rescores every segment
-- The active_hazard weight applies at route time, so it needs no rescore.
-- Bodies of rebuild_network() (migration 7) and route_net() (migration 4) are copied
-- with only the fixed numbers swapped for table lookups.

create table private.score_weights (
  rule text primary key,
  day double precision not null check (day between 0 and 10),
  night double precision not null check (night between 0 and 10),
  note text not null,
  updated_at timestamptz not null default now()
);

alter table private.score_weights enable row level security;
revoke all on private.score_weights from public, anon, authenticated;

-- Starting values: Table 9, version 1.
insert into private.score_weights (rule, day, night, note) values
  ('main_no_sidewalk',       1.5, 2.0, 'No sidewalk on a main road (trunk, primary, secondary)'),
  ('minor_no_sidewalk',      0.3, 0.5, 'No sidewalk on a residential or other minor road'),
  ('unlit',                  0.0, 1.0, 'Road not lit'),
  ('unmarked_main_crossing', 1.0, 1.5, 'Crossing a main road without a marked crossing'),
  ('fast_traffic',           0.5, 0.7, 'Traffic at 60 km/h or more next to the path'),
  ('unchecked',              0.2, 0.4, 'Not yet audited (sidewalk or lighting unknown)'),
  ('active_hazard',          3.0, 3.0, 'Active confirmed hazard within 15 m (added at route time)')
on conflict (rule) do nothing;

-- ---------------------------------------------------------------------------
-- Scoring on its own, so tuning does not rebuild the topology.
-- ---------------------------------------------------------------------------
create or replace function private.score_segments()
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  d double precision;
  n double precision;
begin
  -- Each rule in Table 9 adds its penalty from private.score_weights.
  -- Hazards are added at query time (private.route_net).
  update road_segments set score_day = 0, score_night = 0, is_unknown = false;
  update road_vertices set unsafe_junction = false;

  -- No sidewalk on a main road (trunk, primary or secondary).
  select w.day, w.night into strict d, n from private.score_weights w where w.rule = 'main_no_sidewalk';
  update road_segments set score_day = score_day + d, score_night = score_night + n
  where sidewalk = 'no'
    and highway in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link');

  -- No sidewalk on a smaller road (residential and the other minor road types).
  select w.day, w.night into strict d, n from private.score_weights w where w.rule = 'minor_no_sidewalk';
  update road_segments set score_day = score_day + d, score_night = score_night + n
  where sidewalk = 'no'
    and highway not in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link');

  -- Road not lit (night only by default).
  select w.day, w.night into strict d, n from private.score_weights w where w.rule = 'unlit';
  update road_segments set score_day = score_day + d, score_night = score_night + n
  where lit = false;

  -- Traffic at 60 km/h or more: on the road itself, or on a separate sidewalk beside it.
  select w.day, w.night into strict d, n from private.score_weights w where w.rule = 'fast_traffic';
  update road_segments set score_day = score_day + d, score_night = score_night + n
  where maxspeed >= 60
     or (footway = 'sidewalk' and exists (
           select 1 from road_segments r
           where r.maxspeed >= 60
             and st_dwithin(r.geom::geography, road_segments.geom::geography, 15)));

  -- Crossing a main road without a marked crossing:
  -- (a) a crossing edge that is not marked and touches a main road;
  select w.day, w.night into strict d, n from private.score_weights w where w.rule = 'unmarked_main_crossing';
  update road_segments as c set score_day = score_day + d, score_night = score_night + n
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

  update road_segments as s set score_day = score_day + d, score_night = score_night + n
  where s.highway not in ('trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link')
    and coalesce(s.footway, '') <> 'crossing'
    and exists (select 1 from road_vertices v
                where v.unsafe_junction and (v.id = s.source or v.id = s.target));

  -- Not yet checked: sidewalk unknown on a road, or lighting not tagged.
  update road_segments set is_unknown = true
  where sidewalk = 'unknown' or lit is null;

  select w.day, w.night into strict d, n from private.score_weights w where w.rule = 'unchecked';
  update road_segments set score_day = score_day + d, score_night = score_night + n
  where is_unknown;

  analyze road_segments;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rebuild: steps 1 to 3 as before, then the scores.
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

  -- 4. Scores, from private.score_weights.
  perform private.score_segments();

  analyze road_segments;
  analyze road_vertices;

  return query select (select count(*) from road_segments), (select count(*) from road_vertices);
end;
$$;

revoke execute on function public.rebuild_network() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Route network: the hazard penalty now comes from the weights table.
-- ---------------------------------------------------------------------------
-- pen = mode score + active_hazard weight for an active hazard within 15 m.
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
  hz double precision := (select case when p_night then w.night else w.day end
                          from private.score_weights w where w.rule = 'active_hazard');
begin
  return query
  with seg as (
    select s.id, s.source, s.target, s.geom, s.length_m,
           (case when p_night then s.score_night else s.score_day end)
             + case when h.hit then coalesce(hz, 3.0) else 0 end as pen,
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

revoke all on all functions in schema private from public, anon, authenticated;
