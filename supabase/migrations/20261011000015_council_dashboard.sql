-- Phase 13: council dashboard (docs/revenue-plan.md Phase 13; guide Section 15.7).
-- One read-only function for the static web page in council/: ranked improvement
-- requests, hazards for the heatmap, weekly trends and top categories.
-- No names, no user ids, the same as the app export. Public for the prototype:
-- staff sign-in (magic link and a staff list) comes before a real council sale.

create index if not exists reports_created_idx on public.reports (created_at);

-- ---------------------------------------------------------------------------
-- council_data(p_days): everything the dashboard shows, in one call.
--   p_days  30, 90 or 365: the period for the heatmap and top categories
-- Returns:
--   sum    {hz: active hazards, im: open improvements, up: upvotes on them,
--           month: reports in the last 30 days}
--   im     open improvement requests ranked by upvotes (at most 500)
--   hz     hazards reported in the period, expired ones too, weight 1 + Still there
--   weeks  the last 12 weeks (Malaysian, Monday first): new hazards, improvements, upvotes
--   cats   reports per category in the period, for hazards and improvements
-- Votes by the reporter on their own report never count. Coordinates at 5 decimals.
-- ---------------------------------------------------------------------------
create or replace function public.council_data(p_days int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  since timestamptz;
  week0 date := date_trunc('week', (now() at time zone 'Asia/Kuala_Lumpur')::date)::date - 77;
begin
  if p_days not in (30, 90, 365) then
    return jsonb_build_object('error', 'bad_days');
  end if;
  since := now() - make_interval(days => p_days);

  return jsonb_build_object(
    'days', p_days,
    'at', now(),
    'sum', jsonb_build_object(
      'hz', (select count(*) from reports
             where kind = 'hazard' and status = 'active'
               and (expires_at is null or expires_at > now())),
      'im', (select count(*) from reports where kind = 'improvement' and status <> 'expired'),
      'up', (select count(*) from report_votes v
             join reports r on r.id = v.report_id
             where v.vote = 'upvote' and v.user_id <> r.user_id
               and r.kind = 'improvement' and r.status <> 'expired'),
      'month', (select count(*) from reports where created_at > now() - interval '30 days')),

    'im', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id,
               'cat', q.category,
               'lon', round(st_x(q.geom)::numeric, 5),
               'lat', round(st_y(q.geom)::numeric, 5),
               'upvotes', q.up,
               'status', q.status,
               'created', q.created_at,
               'street', s.name,
               'note', q.note,
               'photo', q.photo_path) order by q.up desc, q.created_at desc)
      from (
        select r.id, r.category, r.geom, r.status, r.created_at, r.note, r.photo_path, v.up
        from reports r
        cross join lateral (
          select count(*) as up from report_votes x
          where x.report_id = r.id and x.vote = 'upvote' and x.user_id <> r.user_id) v
        where r.kind = 'improvement' and r.status <> 'expired'
        order by v.up desc, r.created_at desc
        limit 500) q
      left join lateral (
        select g.name from road_segments g
        where g.name is not null and st_dwithin(g.geom, q.geom, 0.0004)
        order by g.geom <-> q.geom
        limit 1) s on true), '[]'::jsonb),

    -- Short keys: up to 5000 points travel to the browser.
    'hz', coalesce((
      select jsonb_agg(jsonb_build_array(
               round(st_x(r.geom)::numeric, 5),
               round(st_y(r.geom)::numeric, 5),
               r.category,
               1 + c.n,
               (r.created_at at time zone 'Asia/Kuala_Lumpur')::date,
               case when r.status <> 'expired' and r.expires_at <= now() then 'expired' else r.status end))
      from (select * from reports
            where kind = 'hazard' and created_at > since
            order by created_at desc
            limit 5000) r
      cross join lateral (
        select count(*) as n from report_votes x
        where x.report_id = r.id and x.vote = 'confirm' and x.user_id <> r.user_id) c), '[]'::jsonb),

    'weeks', (
      select jsonb_agg(jsonb_build_object(
               'w', w.d,
               'hz', (select count(*) from reports r
                      where r.kind = 'hazard'
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date >= w.d
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date < w.d + 7),
               'im', (select count(*) from reports r
                      where r.kind = 'improvement'
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date >= w.d
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date < w.d + 7),
               'up', (select count(*) from report_votes v
                      join reports r on r.id = v.report_id
                      where v.vote = 'upvote' and v.user_id <> r.user_id
                        and (v.created_at at time zone 'Asia/Kuala_Lumpur')::date >= w.d
                        and (v.created_at at time zone 'Asia/Kuala_Lumpur')::date < w.d + 7))
             order by w.d)
      from (select (week0 + 7 * i) as d from generate_series(0, 11) i) w),

    'cats', jsonb_build_object(
      'hazard', coalesce((
        select jsonb_agg(jsonb_build_object('cat', category, 'n', n) order by n desc, category)
        from (select category, count(*) as n from reports
              where kind = 'hazard' and created_at > since group by category) c), '[]'::jsonb),
      'improvement', coalesce((
        select jsonb_agg(jsonb_build_object('cat', category, 'n', n) order by n desc, category)
        from (select category, count(*) as n from reports
              where kind = 'improvement' and created_at > since group by category) c), '[]'::jsonb)));
end;
$$;

-- New functions start private (migration 13). The dashboard reads without signing in.
revoke execute on function public.council_data(int) from public, anon, authenticated;
grant execute on function public.council_data(int) to anon, authenticated;
