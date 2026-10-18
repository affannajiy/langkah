-- Nearby-first search (guide Section 17.2).
-- search_places used to sort by match quality first, so near UTP "cafe" listed Ipoh
-- cafes 26 km away above V5 Cafe 391 m away. Now one blended score:
--   match quality (word similarity, plus a bonus when the name starts with the query)
--   minus a gentle distance cost (log of km, so 300 m against 1 km barely matters)
--   minus a fixed cost for places in the other pilot area (more than 15 km away).
-- A clearly better match still wins; among equally good matches, the nearer one wins.
-- Without a near point the order is the same as before. Same signature, so the grants stay.

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
  , ranked as (
    select *,
           sim
           + case when prefix then 0.25 else 0 end
           - case when dist is null then 0 else 0.12 * ln(1 + dist / 1000.0) end
           - case when dist > 15000 then 0.3 else 0 end as rank
    from uniq
  )
  select name, area, category,
         round(st_x(geom)::numeric, 5), round(st_y(geom)::numeric, 5),
         round(dist)::integer
  from ranked
  order by rank desc, dist nulls last, name
  limit 10;
$$;
