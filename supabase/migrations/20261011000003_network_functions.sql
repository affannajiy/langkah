-- Routing topology and safety scoring (guide Sections 4.1, 7.1 and 7.5).
-- Called by data-scripts/load_to_supabase.py after it loads the segments:
--   select public.rebuild_network();

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

  -- 3. Scores. Each rule in Table 9 adds its penalty. Hazards are added at query time.
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
  with main_junctions as (
    select v.id
    from road_vertices v
    where exists (select 1 from road_segments r
                  where (r.source = v.id or r.target = v.id)
                    and r.highway in ('primary', 'primary_link', 'secondary', 'secondary_link'))
      and not exists (select 1 from amenities a
                      where (a.kind = 'traffic_signals'
                             or (a.kind = 'crossing' and coalesce(a.tags ->> 'crossing', '') in
                                 ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan')))
                        and st_dwithin(a.geom::geography, v.geom::geography, 15))
  )
  update road_segments as s set score_day = score_day + 1.0, score_night = score_night + 1.5
  where s.highway not in ('primary', 'primary_link', 'secondary', 'secondary_link')
    and coalesce(s.footway, '') <> 'crossing'
    and (s.source in (select id from main_junctions) or s.target in (select id from main_junctions));

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

-- Only the loader (postgres role) may run it. Never callable through the API.
revoke execute on function public.rebuild_network() from public, anon, authenticated;

-- Coverage summary that mirrors data-scripts/out/coverage-report.md, for checking the load.
-- Server side only (no grants to API roles).
create view public.network_coverage
with (security_invoker = true) as
select
  round((sum(length_m) filter (where sidewalk <> 'footpath') / 1000)::numeric, 1) as road_km,
  round((sum(length_m) filter (where sidewalk = 'yes') / 1000)::numeric, 1)       as sidewalk_yes_km,
  round((sum(length_m) filter (where sidewalk = 'no') / 1000)::numeric, 1)        as sidewalk_no_km,
  round((sum(length_m) filter (where sidewalk = 'unknown') / 1000)::numeric, 1)   as sidewalk_unknown_km,
  round((sum(length_m) filter (where sidewalk <> 'footpath' and lit is not null) / 1000)::numeric, 1) as lit_tagged_km,
  round((sum(length_m) filter (where sidewalk = 'footpath') / 1000)::numeric, 1)  as footpath_km,
  round((sum(length_m) filter (where footway = 'sidewalk') / 1000)::numeric, 1)   as separate_sidewalk_km,
  count(*)                                                                        as segments,
  round(avg(score_day)::numeric, 2)                                               as avg_score_day,
  round(avg(score_night)::numeric, 2)                                             as avg_score_night
from public.road_segments;

revoke all on public.network_coverage from anon, authenticated;
