-- Phase 21: the Fixed loop (guide Section 16.4, decided 2026-10-18).
--
-- Council staff sign in on the dashboard by email magic link. A staff list in SQL,
-- not the sign-in itself, decides who may change a request: Open, Planned or Fixed.
-- When a request is fixed, its reporter gets +50 points and a notice the next time
-- they open the app. Points never touch the ranking (Section 15.1): upvotes still
-- earn nothing, and fixed requests simply leave the open list.
--
-- Add a staff member (SQL editor, never in git):
--   insert into private.council_staff (email, name) values ('someone@mbi.gov.my', 'Name');

alter table public.reports
  add column council_status text not null default 'open'
    check (council_status in ('open', 'planned', 'fixed')),
  add column council_at timestamptz;

create table private.council_staff (
  email text primary key check (email = lower(email) and email like '%_@_%'),
  name text check (char_length(name) <= 80),
  added_at timestamptz not null default now()
);
alter table private.council_staff enable row level security;
revoke all on private.council_staff from public, anon, authenticated;

-- What a reporter is told the next time they open the app.
create table public.user_notices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('planned', 'fixed')),
  report_id uuid not null references public.reports (id) on delete cascade,
  points int not null default 0,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (report_id, kind)
);
create index user_notices_user_idx on public.user_notices (user_id) where seen_at is null;
alter table public.user_notices enable row level security;
revoke all on public.user_notices from anon, authenticated;

-- New ledger reasons: a fixed request (this phase) and a street answer (Phase 23).
alter table public.point_ledger drop constraint point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in
  ('welcome', 'walk', 'hazard_confirmed', 'improvement_photo', 'vote', 'rating', 'checkin', 'ad', 'topup',
   'voucher', 'cosmetic', 'plus', 'report_deleted', 'report_fixed', 'quest'));

-- ---------------------------------------------------------------------------
-- Staff check: the signed-in email is on the staff list. Anonymous sessions have
-- no email, so they never pass.
-- ---------------------------------------------------------------------------
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.council_staff s
    where s.email = lower(coalesce(auth.jwt() ->> 'email', '')) and s.email <> '');
$$;
revoke execute on function private.is_staff() from public, anon, authenticated;

create or replace function public.council_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('email', auth.jwt() ->> 'email', 'staff', private.is_staff());
$$;

-- ---------------------------------------------------------------------------
-- council_set_status: staff only. Planned and Fixed tell the reporter once each;
-- Fixed also pays +50 once (the ledger ref stops a second payment after a reopen).
-- ---------------------------------------------------------------------------
create or replace function public.council_set_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_points int := 0;
begin
  if not private.is_staff() then
    return jsonb_build_object('error', 'not_staff');
  end if;
  if p_status not in ('open', 'planned', 'fixed') then
    return jsonb_build_object('error', 'bad_status');
  end if;

  select id, user_id, kind, category, status, council_status into r
  from public.reports where id = p_id for update;
  if not found or r.kind <> 'improvement' or r.status = 'expired' then
    return jsonb_build_object('error', 'not_found');
  end if;
  if r.council_status = p_status then
    return jsonb_build_object('ok', true, 'status', p_status);
  end if;

  update public.reports set council_status = p_status, council_at = now() where id = p_id;

  if p_status = 'fixed' then
    v_points := public.points_add(r.user_id, 50, 'report_fixed', p_id::text,
                                  jsonb_build_object('cat', r.category, 'kind', 'improvement'));
  end if;
  if p_status in ('planned', 'fixed') then
    insert into public.user_notices (user_id, kind, report_id, points)
    values (r.user_id, p_status, p_id, v_points)
    on conflict (report_id, kind) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- my_notices: unseen notices from the last 30 days. notices_seen marks them read.
-- ---------------------------------------------------------------------------
create or replace function public.my_notices()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id,
           'kind', n.kind,
           'report', n.report_id,
           'cat', r.category,
           'points', n.points,
           'street', s.name,
           'at', n.created_at) order by n.created_at), '[]'::jsonb)
  from user_notices n
  join reports r on r.id = n.report_id
  left join lateral (
    select g.name from road_segments g
    where g.name is not null and st_dwithin(g.geom, r.geom, 0.0004)
    order by g.geom <-> r.geom
    limit 1) s on true
  where auth.uid() is not null and n.user_id = auth.uid()
    and n.seen_at is null and n.created_at > now() - interval '30 days';
$$;

create or replace function public.notices_seen(p_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_notices set seen_at = now()
  where user_id = auth.uid() and id = any (p_ids) and seen_at is null;
$$;

-- ---------------------------------------------------------------------------
-- community_reports (migration 9) and my_reports (migration 10): plus cs, the
-- council status, and csAt. Fixed requests sort last in Community.
-- ---------------------------------------------------------------------------
create or replace function public.community_reports(
  p_kind text default 'hazard',
  p_sort text default 'top',
  p_lon double precision default null,
  p_lat double precision default null,
  p_box double precision[] default null,
  p_id uuid default null,
  p_offset int default 0,
  p_limit int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  here geography;
  box geometry;
begin
  if p_id is null and p_kind not in ('hazard', 'improvement') then
    return jsonb_build_object('error', 'bad_kind');
  end if;
  if p_lon is not null and p_lat is not null then
    here := st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography;
  end if;
  if p_box is not null then
    if array_length(p_box, 1) <> 4 or p_box[1] >= p_box[3] or p_box[2] >= p_box[4] then
      return jsonb_build_object('error', 'bad_box');
    end if;
    if p_box[3] - p_box[1] > 0.05 or p_box[4] - p_box[2] > 0.05 then
      return jsonb_build_object('error', 'too_big');
    end if;
    box := st_makeenvelope(p_box[1], p_box[2], p_box[3], p_box[4], 4326);
  end if;

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(item order by ord)
    from (
      select row_number() over (order by
               case when r.council_status = 'fixed' then 1 else 0 end,
               case when p_sort = 'nearest' and here is not null
                    then st_distance(r.geom::geography, here) end asc nulls last,
               case when p_sort = 'top' then
                    case when r.kind = 'hazard' then v.confirms else v.upvotes end end desc nulls last,
               r.created_at desc) as ord,
             jsonb_build_object(
               'id', r.id,
               'kind', r.kind,
               'cat', r.category,
               'lon', round(st_x(r.geom)::numeric, 5),
               'lat', round(st_y(r.geom)::numeric, 5),
               'note', r.note,
               'photo', r.photo_path,
               'status', case when r.status <> 'expired' and r.expires_at <= now()
                              then 'expired' else r.status end,
               'cs', r.council_status,
               'csAt', r.council_at,
               'created', r.created_at,
               'expires', r.expires_at,
               'by', case when r.post_anonymously then null else p.display_name end,
               'confirms', v.confirms,
               'gone', v.gone,
               'upvotes', v.upvotes,
               'mine', coalesce(r.user_id = me, false),
               'myVote', mv.vote,
               'street', s.name,
               'dist', case when here is not null
                            then round(st_distance(r.geom::geography, here)::numeric) end) as item
      from reports r
      left join profiles p on p.id = r.user_id
      left join lateral (
        select count(*) filter (where x.vote = 'confirm') as confirms,
               count(*) filter (where x.vote = 'gone') as gone,
               count(*) filter (where x.vote = 'upvote') as upvotes
        from report_votes x
        where x.report_id = r.id and x.user_id <> r.user_id) v on true
      left join report_votes mv on mv.report_id = r.id and mv.user_id = me
      left join lateral (
        select g.name from road_segments g
        where g.name is not null and st_dwithin(g.geom, r.geom, 0.0004)
        order by g.geom <-> r.geom
        limit 1) s on true
      where (p_id is not null and r.id = p_id)
         or (p_id is null
             and r.kind = p_kind
             and r.status <> 'expired'
             and (r.expires_at is null or r.expires_at > now())
             and (box is null or r.geom && box))
      order by ord
      offset greatest(coalesce(p_offset, 0), 0)
      limit least(greatest(coalesce(p_limit, 30), 1), 50)
    ) q), '[]'::jsonb));
end;
$$;

create or replace function public.my_reports(p_offset int default 0, p_limit int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(item order by created desc), '[]'::jsonb))
  from (
    select r.created_at as created,
           jsonb_build_object(
             'id', r.id,
             'kind', r.kind,
             'cat', r.category,
             'lon', round(st_x(r.geom)::numeric, 5),
             'lat', round(st_y(r.geom)::numeric, 5),
             'note', r.note,
             'photo', r.photo_path,
             'status', case when r.status <> 'expired' and r.expires_at <= now()
                            then 'expired' else r.status end,
             'cs', r.council_status,
             'csAt', r.council_at,
             'created', r.created_at,
             'expires', r.expires_at,
             'by', case when r.post_anonymously then null else p.display_name end,
             'confirms', v.confirms,
             'gone', v.gone,
             'upvotes', v.upvotes,
             'mine', true,
             'myVote', null,
             'street', s.name,
             'dist', null) as item
    from reports r
    left join profiles p on p.id = r.user_id
    left join lateral (
      select count(*) filter (where x.vote = 'confirm') as confirms,
             count(*) filter (where x.vote = 'gone') as gone,
             count(*) filter (where x.vote = 'upvote') as upvotes
      from report_votes x
      where x.report_id = r.id and x.user_id <> r.user_id) v on true
    left join lateral (
      select g.name from road_segments g
      where g.name is not null and st_dwithin(g.geom, r.geom, 0.0004)
      order by g.geom <-> r.geom
      limit 1) s on true
    where auth.uid() is not null and r.user_id = auth.uid()
    order by r.created_at desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 30), 1), 50)
  ) q;
$$;

-- ---------------------------------------------------------------------------
-- council_data (migration 15): plus cs and csAt on each request, fixed requests
-- after the open ones, and sum.fixed (fixed in the period).
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
      'im', (select count(*) from reports where kind = 'improvement' and status <> 'expired'
             and council_status <> 'fixed'),
      'fixed', (select count(*) from reports where kind = 'improvement' and council_status = 'fixed'
                and council_at > since),
      'up', (select count(*) from report_votes v
             join reports r on r.id = v.report_id
             where v.vote = 'upvote' and v.user_id <> r.user_id
               and r.kind = 'improvement' and r.status <> 'expired' and r.council_status <> 'fixed'),
      'month', (select count(*) from reports where created_at > now() - interval '30 days')),

    'im', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id,
               'cat', q.category,
               'lon', round(st_x(q.geom)::numeric, 5),
               'lat', round(st_y(q.geom)::numeric, 5),
               'upvotes', q.up,
               'status', q.status,
               'cs', q.council_status,
               'csAt', q.council_at,
               'created', q.created_at,
               'street', s.name,
               'note', q.note,
               'photo', q.photo_path) order by q.council_status = 'fixed', q.up desc, q.created_at desc)
      from (
        select r.id, r.category, r.geom, r.status, r.council_status, r.council_at, r.created_at,
               r.note, r.photo_path, v.up
        from reports r
        cross join lateral (
          select count(*) as up from report_votes x
          where x.report_id = r.id and x.vote = 'upvote' and x.user_id <> r.user_id) v
        where r.kind = 'improvement' and r.status <> 'expired'
          -- Open and planned requests rank; fixed ones show for a year, after them.
          and (r.council_status <> 'fixed' or r.council_at > now() - interval '365 days')
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

revoke execute on function
  public.council_me(),
  public.council_set_status(uuid, text),
  public.my_notices(),
  public.notices_seen(bigint[])
from public, anon, authenticated;
grant execute on function
  public.council_me(),
  public.council_set_status(uuid, text),
  public.my_notices(),
  public.notices_seen(bigint[])
to authenticated;
