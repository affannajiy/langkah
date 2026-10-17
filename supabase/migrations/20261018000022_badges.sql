-- Phase 22: badges and the weekly walk streak (guide Section 16.5, decided 2026-10-18).
--
-- Worked out from what is already stored (walks, reports, the points ledger, street
-- answers), so there is no new table and nothing to keep in step. Badges pay no
-- points and never touch the council ranking (Section 15.1). The streak counts
-- Malaysian weeks (Monday first) with at least one walk, so nobody has to walk
-- every day to keep it.

create or replace function public.my_badges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  v_walks int;
  v_m bigint;
  v_reports int;
  v_confirmed int;
  v_checkin7 boolean;
  v_answers int;
  v_fixed int;
  v_week date := date_trunc('week', (now() at time zone 'Asia/Kuala_Lumpur')::date)::date;
  v_this_week boolean;
  v_streak int := 0;
  d date;
begin
  if me is null then
    return jsonb_build_object('error', 'no_session');
  end if;

  select count(*), coalesce(sum(distance_m), 0) into v_walks, v_m from walks where user_id = me;
  select count(*) into v_reports from reports where user_id = me;
  select count(*) into v_confirmed from point_ledger where user_id = me and reason = 'hazard_confirmed';
  select exists (select 1 from point_ledger where user_id = me and reason = 'checkin' and meta ->> 'day' = '7')
    into v_checkin7;
  -- One answer covers every OSM way of a street, all stored in one go.
  select count(distinct (attr, created_at)) into v_answers from street_answers where user_id = me;
  select count(*) into v_fixed from reports where user_id = me and council_status = 'fixed';

  -- Weeks in a row with a walk. This week counts once walked; until then the streak
  -- runs to last week, so it does not break on a Monday morning.
  v_this_week := exists (select 1 from walks where user_id = me
                         and (created_at at time zone 'Asia/Kuala_Lumpur')::date >= v_week);
  d := case when v_this_week then v_week else v_week - 7 end;
  while exists (select 1 from walks where user_id = me
                and (created_at at time zone 'Asia/Kuala_Lumpur')::date >= d
                and (created_at at time zone 'Asia/Kuala_Lumpur')::date < d + 7) loop
    v_streak := v_streak + 1;
    d := d - 7;
    exit when v_streak >= 520;
  end loop;

  return jsonb_build_object(
    'weeks', v_streak,
    'thisWeek', v_this_week,
    'badges', jsonb_build_array(
      jsonb_build_object('id', 'first_walk', 'n', least(v_walks, 1), 'goal', 1),
      jsonb_build_object('id', 'km10', 'n', least(v_m, 10000), 'goal', 10000),
      jsonb_build_object('id', 'km50', 'n', least(v_m, 50000), 'goal', 50000),
      jsonb_build_object('id', 'first_report', 'n', least(v_reports, 1), 'goal', 1),
      jsonb_build_object('id', 'hazards5', 'n', least(v_confirmed, 5), 'goal', 5),
      jsonb_build_object('id', 'checkin7', 'n', case when v_checkin7 then 1 else 0 end, 'goal', 1),
      jsonb_build_object('id', 'street_checker', 'n', least(v_answers, 10), 'goal', 10),
      jsonb_build_object('id', 'got_fixed', 'n', least(v_fixed, 1), 'goal', 1)));
end;
$$;

revoke execute on function public.my_badges() from public, anon, authenticated;
grant execute on function public.my_badges() to authenticated;
