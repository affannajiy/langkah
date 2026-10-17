-- Phase 23: map-the-gaps street checks (guide Section 16.6, decided 2026-10-18).
--
-- Almost every street in the pilot areas is "not yet checked" in OSM (10,346 of
-- 10,368 segments). After a walk, the Arrival screen asks up to 3 short questions
-- about named streets on the route just walked: is there a sidewalk, is it lit at
-- night, is it covered. Only the street (its OSM way id) and the answer are sent,
-- never the route.
--
-- Trust: an answer changes nothing alone. When 2 different signed-in walkers agree,
-- it becomes a street fact, fills in what OSM left unknown (never overrides OSM),
-- and those streets are rescored. Facts live apart from the OSM rows, so a data
-- refresh applies them again (score_segments). +2 points per answer, 5 paid a day.
-- Demo: Afrina (demo) agrees with the demo user at once, as with hazards.

create table public.street_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  osm_id bigint not null,
  attr text not null check (attr in ('sidewalk', 'lit', 'covered')),
  value text not null check (value in ('yes', 'no')),
  created_at timestamptz not null default now(),
  unique (user_id, osm_id, attr)
);
create index street_answers_way_idx on public.street_answers (osm_id, attr);
alter table public.street_answers enable row level security;
revoke all on public.street_answers from anon, authenticated;

create table private.street_facts (
  osm_id bigint not null,
  attr text not null check (attr in ('sidewalk', 'lit', 'covered')),
  value text not null check (value in ('yes', 'no')),
  agreed_by int not null,
  agreed_at timestamptz not null default now(),
  primary key (osm_id, attr)
);
alter table private.street_facts enable row level security;
revoke all on private.street_facts from public, anon, authenticated;

create index if not exists road_segments_osm_idx on public.road_segments (osm_id);

-- ---------------------------------------------------------------------------
-- apply_street_facts: copy agreed facts onto the segments of those ways, only
-- where OSM says nothing. p_osm null: every fact (after a data refresh).
-- ---------------------------------------------------------------------------
create or replace function private.apply_street_facts(p_osm bigint[])
returns void
language sql
set search_path = public, extensions
as $$
  update road_segments s set sidewalk = f.value
  from private.street_facts f
  where f.attr = 'sidewalk' and f.osm_id = s.osm_id and s.sidewalk = 'unknown'
    and coalesce(s.footway, '') = '' and (p_osm is null or s.osm_id = any (p_osm));

  update road_segments s set lit = (f.value = 'yes')
  from private.street_facts f
  where f.attr = 'lit' and f.osm_id = s.osm_id and s.lit is null
    and (p_osm is null or s.osm_id = any (p_osm));

  update road_segments s set covered = true
  from private.street_facts f
  where f.attr = 'covered' and f.value = 'yes' and f.osm_id = s.osm_id and not s.covered
    and (p_osm is null or s.osm_id = any (p_osm));
$$;

-- ---------------------------------------------------------------------------
-- rescore_ways: the Table 9 rules for the segments of a few ways only, so an
-- agreed answer shows in routes at once (a full rescore takes about 40 s).
-- Same rules as score_segments; junction flags are reused as they are, since
-- sidewalk and lighting answers do not change them.
-- ---------------------------------------------------------------------------
create or replace function private.rescore_ways(p_osm bigint[])
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  w record;
  main constant text[] := array['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'];
begin
  select
    max(day) filter (where rule = 'main_no_sidewalk') as mn_d, max(night) filter (where rule = 'main_no_sidewalk') as mn_n,
    max(day) filter (where rule = 'minor_no_sidewalk') as mi_d, max(night) filter (where rule = 'minor_no_sidewalk') as mi_n,
    max(day) filter (where rule = 'unlit') as ul_d, max(night) filter (where rule = 'unlit') as ul_n,
    max(day) filter (where rule = 'fast_traffic') as ft_d, max(night) filter (where rule = 'fast_traffic') as ft_n,
    max(day) filter (where rule = 'unmarked_main_crossing') as um_d, max(night) filter (where rule = 'unmarked_main_crossing') as um_n,
    max(day) filter (where rule = 'unchecked') as uc_d, max(night) filter (where rule = 'unchecked') as uc_n
  into w from private.score_weights;

  update road_segments s set
    is_unknown = (s.sidewalk = 'unknown' or s.lit is null),
    score_day =
        case when s.sidewalk = 'no' and s.highway = any (main) then w.mn_d else 0 end
      + case when s.sidewalk = 'no' and s.highway <> all (main) then w.mi_d else 0 end
      + case when s.lit = false then w.ul_d else 0 end
      + case when x.fast then w.ft_d else 0 end
      + case when x.unmarked then w.um_d else 0 end
      + case when x.junction then w.um_d else 0 end
      + case when s.sidewalk = 'unknown' or s.lit is null then w.uc_d else 0 end,
    score_night =
        case when s.sidewalk = 'no' and s.highway = any (main) then w.mn_n else 0 end
      + case when s.sidewalk = 'no' and s.highway <> all (main) then w.mi_n else 0 end
      + case when s.lit = false then w.ul_n else 0 end
      + case when x.fast then w.ft_n else 0 end
      + case when x.unmarked then w.um_n else 0 end
      + case when x.junction then w.um_n else 0 end
      + case when s.sidewalk = 'unknown' or s.lit is null then w.uc_n else 0 end
  from (
    select c.id,
      (c.maxspeed >= 60
       or (c.footway = 'sidewalk' and exists (
             select 1 from road_segments r
             where r.maxspeed >= 60 and st_dwithin(r.geom::geography, c.geom::geography, 15)))) as fast,
      (c.footway = 'crossing'
       and coalesce(c.crossing, 'unknown') in ('unmarked', 'no', 'unknown', 'informal')
       and exists (select 1 from road_segments r
                   where r.highway = any (main) and st_intersects(r.geom, c.geom))) as unmarked,
      (c.highway <> all (main) and coalesce(c.footway, '') <> 'crossing'
       and exists (select 1 from road_vertices v
                   where v.unsafe_junction and (v.id = c.source or v.id = c.target))) as junction
    from road_segments c
    where c.osm_id = any (p_osm)) x
  where s.id = x.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- score_segments (migration 11): applies the street facts first.
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
  -- Street checks agreed by walkers fill in what OSM left unknown (Phase 23).
  perform private.apply_street_facts(null);

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
-- points_add (migration 16): street answers pay 5 times a day.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.points_add(p_user uuid, p_amount integer, p_reason text, p_ref text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb, p_at timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_amount int := p_amount;
  v_day_start timestamptz := (public.malaysia_today()::timestamp at time zone 'Asia/Kuala_Lumpur');
  v_today_sum int;
  v_today_count int;
begin
  if p_user is null or coalesce(p_amount, 0) = 0
     or current_setting('langkah.no_points', true) = 'on' then
    return 0;
  end if;

  -- One writer per user at a time, so caps and the balance stay exact.
  perform pg_advisory_xact_lock(hashtext('points:' || p_user::text));

  if p_ref is not null and exists (
       select 1 from public.point_ledger l
       where l.user_id = p_user and l.reason = p_reason and l.ref = p_ref) then
    return 0;
  end if;

  select coalesce(sum(l.amount), 0), count(*) into v_today_sum, v_today_count
  from public.point_ledger l
  where l.user_id = p_user and l.reason = p_reason and l.created_at >= v_day_start;

  if p_reason = 'walk' then
    v_amount := least(v_amount, 50 - v_today_sum);
  elsif p_reason = 'improvement_photo' and v_today_count >= 5 then
    v_amount := 0;
  elsif p_reason = 'vote' and v_today_count >= 20 then
    v_amount := 0;
  elsif p_reason = 'ad' and v_today_count >= 5 then
    v_amount := 0;
  elsif p_reason = 'quest' and v_today_count >= 5 then
    v_amount := 0;
  end if;

  if v_amount <= 0 and p_amount > 0 then
    return 0;
  end if;

  insert into public.point_ledger (user_id, amount, reason, ref, meta, created_at)
  values (p_user, v_amount, p_reason, p_ref, coalesce(p_meta, '{}'::jsonb), p_at);

  -- Make sure the row exists, then add. An upsert with the amount itself fails for
  -- a spend: the balance >= 0 check runs on the proposed insert row first.
  insert into public.point_balances (user_id, balance, updated_at)
  values (p_user, 0, now())
  on conflict (user_id) do nothing;

  update public.point_balances
  set balance = balance + v_amount, updated_at = now()
  where user_id = p_user;

  return v_amount;
end;
$function$;

-- ---------------------------------------------------------------------------
-- add_quests: up to 3 named streets on a route with something unknown, longest
-- first, one question each (sidewalk, then lighting, then cover), leaving out what
-- this walker already answered. A street split into several OSM ways is asked once.
-- Returned as q: [{w: [way ids], n: name, a: attr}].
-- ---------------------------------------------------------------------------
create or replace function private.add_quests(r jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  ids bigint[];
  q jsonb;
begin
  if r is null then
    return null;
  end if;
  ids := array(select (jsonb_array_elements_text(coalesce(r -> 'edges', '[]'::jsonb)))::bigint);
  select coalesce(jsonb_agg(jsonb_build_object('w', w.ways, 'n', w.name, 'a', w.attr) order by w.m desc), '[]'::jsonb)
    into q
  from (select * from (
    select g.ways, g.name, g.m,
           case when g.sw_unknown and not exists (select 1 from street_answers a where a.user_id = auth.uid()
                                                  and a.osm_id = any (g.ways) and a.attr = 'sidewalk') then 'sidewalk'
                when g.lit_unknown and not exists (select 1 from street_answers a where a.user_id = auth.uid()
                                                   and a.osm_id = any (g.ways) and a.attr = 'lit') then 'lit'
                when g.cover_ask and not exists (select 1 from street_answers a where a.user_id = auth.uid()
                                                 and a.osm_id = any (g.ways) and a.attr = 'covered') then 'covered'
           end as attr
    from (
      select s.name, array_agg(distinct s.osm_id) as ways, sum(s.length_m) as m,
             bool_or(s.sidewalk = 'unknown' and coalesce(s.footway, '') = ''
                     and s.highway not in ('footway', 'path', 'pedestrian', 'steps', 'corridor', 'cycleway')) as sw_unknown,
             bool_or(s.lit is null) as lit_unknown,
             -- Shophouse streets where a five-foot way is likely: ask only once the rest is known.
             bool_and(not s.covered) and bool_or(s.highway in ('residential', 'tertiary', 'secondary', 'primary',
                                                              'unclassified', 'living_street')) as cover_ask
      from road_segments s
      where s.id = any (ids) and s.osm_id is not null and s.name is not null
      group by s.name
      having sum(s.length_m) >= 40) g
    ) x
    where x.attr is not null and auth.uid() is not null
    order by x.m desc
    limit 3) w;
  return r || jsonb_build_object('q', q);
end;
$$;

revoke all on function private.add_quests(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- route_safe (migration 19): plus q, the street questions for the Arrival screen.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- street_answer: one answer per walker, street and question (a new one replaces
-- it), stored for each OSM way of the street on the route (at most 10).
-- Google or demo accounts only, like reports (guests read, never write).
--   p_value: 'yes' or 'no' ("Not sure" is never sent)
-- ---------------------------------------------------------------------------
drop function if exists public.street_answer(bigint, text, text);

create or replace function public.street_answer(p_ways bigint[], p_attr text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  v_ways bigint[];
  v_way bigint;
  v_points int := 0;
  top record;
  v_agreed bigint[] := '{}';
begin
  if not public.is_full_user() then
    return jsonb_build_object('error', 'sign_in_needed');
  end if;
  if p_attr not in ('sidewalk', 'lit', 'covered') or p_value not in ('yes', 'no')
     or coalesce(array_length(p_ways, 1), 0) not between 1 and 10 then
    return jsonb_build_object('error', 'bad_input');
  end if;
  -- Only real, named ways, and all of one street.
  v_ways := array(select distinct s.osm_id from road_segments s where s.osm_id = any (p_ways) and s.name is not null);
  if coalesce(array_length(v_ways, 1), 0) = 0
     or (select count(distinct s.name) from road_segments s where s.osm_id = any (v_ways)) <> 1 then
    return jsonb_build_object('error', 'not_found');
  end if;

  foreach v_way in array v_ways loop
    insert into street_answers (user_id, osm_id, attr, value)
    values (me, v_way, p_attr, p_value)
    on conflict (user_id, osm_id, attr) do update set value = excluded.value, created_at = now();

    -- Demo: Afrina (demo) agrees at once, so the change shows on one phone.
    if public.is_demo_user() then
      insert into street_answers (user_id, osm_id, attr, value)
      values (public.demo_afrina(), v_way, p_attr, p_value)
      on conflict (user_id, osm_id, attr) do update set value = excluded.value;
    end if;

    -- Agreed: 2 or more walkers, and more than said the opposite.
    select a.value, count(*) as n,
           (select count(*) from street_answers b
            where b.osm_id = v_way and b.attr = p_attr and b.value <> a.value) as against
      into top
    from street_answers a
    where a.osm_id = v_way and a.attr = p_attr
    group by a.value
    order by count(*) desc
    limit 1;

    if top.n >= 2 and top.n > top.against then
      insert into private.street_facts (osm_id, attr, value, agreed_by)
      values (v_way, p_attr, top.value, top.n)
      on conflict (osm_id, attr) do update set value = excluded.value, agreed_by = excluded.agreed_by, agreed_at = now();
      v_agreed := v_agreed || v_way;
    end if;
  end loop;

  if array_length(v_agreed, 1) > 0 then
    perform private.apply_street_facts(v_agreed);
    perform private.rescore_ways(v_agreed);
  end if;

  -- One payment per street and question.
  v_points := public.points_add(me, 2, 'quest', v_ways[1]::text || ':' || p_attr,
                                jsonb_build_object('street', (select max(name) from road_segments where osm_id = v_ways[1])));

  return jsonb_build_object('ok', true, 'points', v_points, 'agreed', coalesce(array_length(v_agreed, 1), 0) > 0);
end;
$$;

revoke execute on function
  private.apply_street_facts(bigint[]),
  private.rescore_ways(bigint[])
from public, anon, authenticated;
revoke execute on function public.street_answer(bigint[], text, text) from public, anon, authenticated;
grant execute on function public.street_answer(bigint[], text, text) to authenticated;
