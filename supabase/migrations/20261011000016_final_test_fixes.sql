-- Final test fixes (docs/test-notes.md, 2026-10-17).
--   B2  every points spend failed: points_add upserted the balance with the amount
--       itself, and for a spend the balance >= 0 check rejected the proposed row.
--   G11 deleting your own report kept its points; now the lines are taken back.
--   G2  the shown route score treated "not yet checked" streets as safe. A display
--       only weight now lowers the score for unchecked metres (guide Section 7.1,
--       "never shown as safe"). Routing is unchanged: raising the routing weight
--       for unchecked streets made Safest pick shorter lines through hazards.

-- ---------------------------------------------------------------------------
-- B2: points_add (body from migration 12, only the balance write changed).
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
-- G11: a report deleted by its owner gives back what it earned (the photo bonus
-- and a hazard confirmation). Capped at the balance, so it never goes below 0.
-- Deletes by anyone else (seed scripts, account removal) are left alone.
-- ---------------------------------------------------------------------------
alter table public.point_ledger drop constraint point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in
  ('welcome', 'walk', 'hazard_confirmed', 'improvement_photo', 'vote', 'rating', 'checkin', 'ad', 'topup',
   'voucher', 'cosmetic', 'plus', 'report_deleted'));

create or replace function public.reports_points_undo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earned int;
  v_meta jsonb;
  v_balance int;
begin
  if auth.uid() is null or old.user_id is distinct from auth.uid() then
    return old;
  end if;

  perform pg_advisory_xact_lock(hashtext('points:' || old.user_id::text));
  select coalesce(sum(l.amount), 0), (array_agg(l.meta order by l.id))[1]
  into v_earned, v_meta
  from public.point_ledger l
  where l.user_id = old.user_id and l.ref = old.id::text
    and l.reason in ('improvement_photo', 'hazard_confirmed');

  v_balance := coalesce((select b.balance from public.point_balances b where b.user_id = old.user_id), 0);
  if v_earned > 0 and v_balance > 0 then
    perform public.points_add(old.user_id, -least(v_earned, v_balance), 'report_deleted', old.id::text,
      coalesce(v_meta, '{}'::jsonb) || jsonb_build_object('kind', old.kind));
  end if;
  return old;
end;
$$;

revoke execute on function public.reports_points_undo() from public, anon, authenticated;

drop trigger if exists reports_points_undo on public.reports;
create trigger reports_points_undo
  after delete on public.reports
  for each row execute function public.reports_points_undo();

-- ---------------------------------------------------------------------------
-- G2: display weight for unchecked metres, tunable like the others:
--   update private.score_weights set day = 1.0, night = 1.0, updated_at = now() where rule = 'unchecked_score';
-- 0.8 takes up to 20 points off a route that is all unchecked. Only day is read.
-- ---------------------------------------------------------------------------
insert into private.score_weights (rule, day, night, note) values
  ('unchecked_score', 0.8, 0.8, 'Shown score only, not routing: extra penalty per unchecked metre (day value used)')
on conflict (rule) do nothing;

-- route_build (body from migration 7, only the score line changed).
CREATE OR REPLACE FUNCTION private.route_build(p_net text, p_cost text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
                  then greatest(0, least(100, round(100 - 25 * (pen_sum + unk * coalesce(
                    (select w.day from private.score_weights w where w.rule = 'unchecked_score'), 0)) / total)))::int
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
$function$;

revoke all on all functions in schema private from public, anon, authenticated;
