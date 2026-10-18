-- Phase 20: fix batch after the full test (guide Section 18, decided 2026-10-18).
--
-- 18.1 The "Try the demo" account is called Afrina. The one helper becomes a crew of
--      local names; each action takes its helper from a stable key, so retakes show
--      the same names. The crew list is near the top of this file (one name a line).
-- 18.2 Demo data stays in the demo: reports.is_demo hides demo reports from everyone
--      but their owner, demo votes count only on demo reports, and a street answer
--      needs a street the server asked about (street_asks) and a walk after it.
-- 18.3 route_safe allows 30 calls a minute and 300 a day per user (route_calls).
-- 18.7 community_export (unused) loses its anon grant.

-- ---------------------------------------------------------------------------
-- 18.1 The demo crew. Server-only accounts with no password, like seed_demo.py's.
-- n orders the crew; the old helper (id ...0005) becomes Haikal.
-- ---------------------------------------------------------------------------
create table private.demo_crew (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 20),
  n int not null unique
);
alter table private.demo_crew enable row level security;
revoke all on private.demo_crew from public, anon, authenticated;

do $$
declare
  crew text[] := array[
    'Haikal', 'Lee', 'Adam', 'Ali', 'Abu',
    'Subramaniam', 'Muthu', 'Chong', 'Aisyah', 'Nurul',
    'Siti', 'Farah', 'Hafiz', 'Iman', 'Mei Ling',
    'Wei Jie', 'Jia Hui', 'Kavitha', 'Priya', 'Rajesh'];
  i int;
  v_id uuid;
begin
  for i in 1 .. array_length(crew, 1) loop
    v_id := case when i = 1 then '6c616e67-6b61-4864-8065-6d6f00000005'::uuid
                 else ('6c616e67-6b61-4864-8065-6d6f000001' || lpad(to_hex(i), 2, '0'))::uuid end;
    insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token,
                            email_change_token_new, email_change, is_anonymous)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'crew' || i || '@langkah.invalid', '{"provider": "demo"}',
            jsonb_build_object('name', crew[i] || ' (demo)'), now(), now(), '', '', '', '', false)
    on conflict (id) do update set raw_user_meta_data = excluded.raw_user_meta_data;
    insert into public.profiles (id, display_name, updated_at) values (v_id, crew[i], now())
    on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
    insert into private.demo_crew (id, name, n) values (v_id, crew[i], i)
    on conflict (id) do update set name = excluded.name, n = excluded.n;
  end loop;
end;
$$;

-- The crew member for a key (a report, a street): the same key always gets the same one.
create or replace function public.demo_helper(p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from private.demo_crew c
  order by c.n
  offset (select mod(hashtext(coalesce(p_key, ''))::bigint + 2147483648, greatest(count(*), 1))
          from private.demo_crew)
  limit 1;
$$;

create or replace function public.demo_helper_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.name from private.demo_crew c where c.id = p_id;
$$;

-- A demo account: a "Try the demo" user or the crew.
create or replace function private.is_demo_account(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_id and p.is_demo)
      or exists (select 1 from private.demo_crew c where c.id = p_id);
$$;

-- ---------------------------------------------------------------------------
-- 18.2 reports.is_demo, set from the author when the report is made.
-- ---------------------------------------------------------------------------
alter table public.reports add column is_demo boolean not null default false;

create or replace function public.reports_set_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_demo := private.is_demo_account(new.user_id);
  return new;
end;
$$;

create trigger reports_set_demo
  before insert on public.reports
  for each row execute function public.reports_set_demo();

update public.reports r set is_demo = true where private.is_demo_account(r.user_id);

-- Direct reads (and map_in_view, which runs as the caller) see a demo report only
-- when it is the caller's own.
drop policy "Reports are readable by everyone" on public.reports;
create policy "Reports are readable by everyone, demo ones by their owner" on public.reports
  for select to anon, authenticated using (not is_demo or user_id = (select auth.uid()));

-- Server functions run as the owner and skip that policy, so they read this view.
create view private.visible_reports as
  select * from public.reports r where not r.is_demo or r.user_id = auth.uid();
revoke all on private.visible_reports from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Votes: a demo voter (a demo user or the crew) counts only on demo reports, so a
-- demo never makes a real report active, keeps it alive or pays its reporter.
-- ---------------------------------------------------------------------------
create or replace function public.report_refresh(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n_confirm int;
  n_up int;
  last_confirm timestamptz;
  n_gone int;
begin
  select kind, status, photo_path, user_id, is_demo into r
  from public.reports where id = p_id for update;
  if not found or r.status = 'expired' then
    return;
  end if;

  select count(*) filter (where v.vote = 'confirm'),
         count(*) filter (where v.vote = 'upvote'),
         max(v.created_at) filter (where v.vote = 'confirm')
    into n_confirm, n_up, last_confirm
  from public.report_votes v
  where v.report_id = p_id and v.user_id <> r.user_id
    and (r.is_demo or not private.is_demo_account(v.user_id));

  if r.kind = 'improvement' then
    if r.status = 'pending' and n_up >= 2 then
      update public.reports set status = 'active' where id = p_id;
    end if;
    return;
  end if;

  select count(*) into n_gone
  from public.report_votes v
  where v.report_id = p_id and v.user_id <> r.user_id and v.vote = 'gone'
    and (r.is_demo or not private.is_demo_account(v.user_id))
    and v.created_at > coalesce(last_confirm, '-infinity'::timestamptz);

  if n_gone >= 2 then
    update public.reports set status = 'expired', expires_at = least(expires_at, now()) where id = p_id;
  elsif r.status = 'pending' and (n_confirm >= 2 or (n_confirm >= 1 and r.photo_path is not null)) then
    update public.reports set status = 'active' where id = p_id;
  end if;
end;
$$;

create or replace function public.report_votes_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.report_id, old.report_id);
begin
  -- "Still there" keeps a hazard alive for another 7 days (a demo vote: demo reports only).
  if tg_op <> 'DELETE' and new.vote = 'confirm' then
    update public.reports
      set expires_at = greatest(coalesce(expires_at, now()), now() + interval '7 days')
    where id = v_id and kind = 'hazard' and status <> 'expired'
      and (is_demo or not private.is_demo_account(new.user_id));
  end if;
  perform public.report_refresh(v_id);
  return null;
end;
$$;

create or replace function public.report_votes_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.vote not in ('confirm', 'gone') then
    return null;
  end if;
  select id, user_id, kind, category, is_demo into r from public.reports where id = new.report_id;
  if not found or r.kind <> 'hazard' or r.user_id = new.user_id then
    return null;
  end if;

  perform public.points_add(new.user_id, 2, 'vote', new.report_id::text,
                            jsonb_build_object('cat', r.category));

  if new.vote = 'confirm' and (r.is_demo or not private.is_demo_account(new.user_id)) then
    -- A name only for the demo crew; real voters stay unnamed.
    perform public.points_add(r.user_id, 20, 'hazard_confirmed', new.report_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'cat', r.category,
        'street', public.report_street(r.id),
        'by', public.demo_helper_name(new.user_id))));
  end if;
  return null;
end;
$$;

-- A demo account's new hazard gets a crew member's Still there at once. The key is
-- the category and the spot (about 100 m), so a retake gets the same helper.
create or replace function public.reports_points()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_helper uuid;
begin
  if new.kind = 'improvement' and new.photo_path is not null
     and (tg_op = 'INSERT' or old.photo_path is null) then
    perform public.points_add(new.user_id, 10, 'improvement_photo', new.id::text,
      jsonb_strip_nulls(jsonb_build_object('cat', new.category, 'street', public.report_street(new.id))));
  end if;

  if tg_op = 'INSERT' and new.kind = 'hazard' and new.is_demo
     and current_setting('langkah.no_points', true) is distinct from 'on'
     and public.demo_writes_open()
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.is_demo) then
    v_helper := public.demo_helper(new.category || ':' || round(st_x(new.geom)::numeric, 3)
                                   || ':' || round(st_y(new.geom)::numeric, 3));
    if v_helper is not null then
      insert into public.report_votes (report_id, user_id, vote)
      values (new.id, v_helper, 'confirm')
      on conflict (report_id, user_id) do nothing;
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 18.1 The demo filler (body from migration 12): the account is Afrina, the crew
-- confirms the seeded hazard, and street answers and asks are wiped too. Reset demo
-- undoes every crew action: their votes go with the demo reports (on delete cascade).
-- ---------------------------------------------------------------------------
create or replace function public.demo_fill_base(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_today date := public.malaysia_today();
  v_hazard uuid;
  v_helper uuid := public.demo_helper('demo-hazard-0');
  v_walk1 uuid;
  v_walk2 uuid;
  v_seed uuid;
begin
  -- The scripted history below is the only source of points here.
  perform set_config('langkah.no_points', 'on', true);

  delete from public.point_ledger where user_id = p_user;
  delete from public.point_balances where user_id = p_user;
  delete from public.walks where user_id = p_user;
  delete from public.walk_ratings where user_id = p_user;
  delete from public.report_votes where user_id = p_user;
  delete from public.reports where user_id = p_user;
  delete from public.street_answers where user_id = p_user;
  delete from public.street_asks where user_id = p_user;

  insert into public.profiles (id, display_name, user_code, is_demo, updated_at)
  values (p_user, 'Afrina', 'LGK-DEMO-01', true, now())
  on conflict (id) do update
    set display_name = 'Afrina', user_code = 'LGK-DEMO-01', is_demo = true, updated_at = now();

  -- Three past reports near Ipoh Railway Station.
  insert into public.reports (user_id, kind, category, geom, note, created_at)
  values (p_user, 'hazard', 'broken_sidewalk', st_setsrid(st_makepoint(101.07702, 4.59812), 4326),
          'Demo: broken drain cover', now() - interval '2 days')
  returning id into v_hazard;
  insert into public.reports (user_id, kind, category, geom, note, created_at)
  values (p_user, 'hazard', 'no_light', st_setsrid(st_makepoint(101.07905, 4.59560), 4326),
          'Demo: street light out', now() - interval '1 day');
  insert into public.reports (user_id, kind, category, geom, note, created_at)
  values (p_user, 'improvement', 'kerb_ramp', st_setsrid(st_makepoint(101.07420, 4.59705), 4326),
          'Demo: no ramp for prams at this corner', now() - interval '3 days');

  if v_helper is not null then
    insert into public.report_votes (report_id, user_id, vote)
    values (v_hazard, v_helper, 'confirm')
    on conflict do nothing;
  end if;

  -- A few votes on the seeded demo hazards, when they exist (they count for nothing
  -- outside the demo, see report_refresh).
  for v_seed in
    select r.id from public.reports r
    where r.user_id = '6c616e67-6b61-4864-8065-6d6f00000001' and r.kind = 'hazard' and r.status = 'active'
    order by r.created_at
    limit 3
  loop
    insert into public.report_votes (report_id, user_id, vote) values (v_seed, p_user, 'confirm')
    on conflict do nothing;
  end loop;

  insert into public.walks (user_id, distance_m, duration_s, created_at)
  values (p_user, 1100, 900, now() - interval '3 hours') returning id into v_walk1;
  insert into public.walks (user_id, distance_m, duration_s, created_at)
  values (p_user, 2300, 1800, now() - interval '2 days') returning id into v_walk2;
  insert into public.walk_ratings (user_id, rating, mode, route_kind, score, distance_m, created_at)
  values (p_user, 4, 'day', 'safest', 82, 1100, now() - interval '3 hours'),
         (p_user, 3, 'night', 'safest', 64, 2300, now() - interval '2 days');

  perform set_config('langkah.no_points', 'off', true);

  -- Scripted ledger: 1,500 points. Check-ins end yesterday on day 3, so today's
  -- check-in shows day 4 of 7.
  perform public.points_add(p_user, 1100, 'topup', 'LGK-0042',
    jsonb_build_object('via', 'TigerBank', 'rm', '10.00'), now() - interval '6 days');
  perform public.points_add(p_user, 200, 'topup', 'LGK-0039',
    jsonb_build_object('via', 'GnG eWallet', 'rm', '2.00'), now() - interval '5 days');
  perform public.points_add(p_user, 23, 'walk', v_walk2::text,
    jsonb_build_object('m', 2300, 'to', 'Concubine Lane'), now() - interval '2 days');
  perform public.points_add(p_user, 5, 'rating', v_walk2::text, '{}'::jsonb, now() - interval '2 days');
  perform public.points_add(p_user, 16, 'walk', 'demo-walk-0',
    jsonb_build_object('m', 1600, 'to', 'Kinta Riverwalk'), now() - interval '4 days');
  perform public.points_add(p_user, 80, 'ad', 'demo-ads-0', jsonb_build_object('count', 4), now() - interval '4 days');
  perform public.points_add(p_user, 2, 'vote', 'demo-vote-0', '{}'::jsonb, now() - interval '4 days');
  perform public.points_add(p_user, 2, 'vote', 'demo-vote-1', '{}'::jsonb, now() - interval '3 days');
  perform public.points_add(p_user, 2, 'vote', 'demo-vote-2', '{}'::jsonb, now() - interval '3 days');
  perform public.points_add(p_user, 5, 'checkin', (v_today - 3)::text, jsonb_build_object('day', 1),
                            now() - interval '3 days');
  perform public.points_add(p_user, 5, 'checkin', (v_today - 2)::text, jsonb_build_object('day', 2),
                            now() - interval '2 days');
  perform public.points_add(p_user, 5, 'checkin', (v_today - 1)::text, jsonb_build_object('day', 3),
                            now() - interval '1 day');
  perform public.points_add(p_user, 10, 'improvement_photo', 'demo-photo-0',
    jsonb_build_object('cat', 'kerb_ramp'), now() - interval '3 days');
  perform public.points_add(p_user, 20, 'hazard_confirmed', v_hazard::text,
    jsonb_strip_nulls(jsonb_build_object('cat', 'broken_sidewalk', 'street', public.report_street(v_hazard),
                                         'by', coalesce(public.demo_helper_name(v_helper), 'Haikal'))),
    now() - interval '1 day');
  perform public.points_add(p_user, 11, 'walk', v_walk1::text,
    jsonb_build_object('m', 1100, 'to', 'Ipoh Railway Station'), now() - interval '3 hours');
  perform public.points_add(p_user, 5, 'rating', v_walk1::text, '{}'::jsonb, now() - interval '3 hours');
  perform public.points_add(p_user, 9, 'walk', 'demo-walk-1',
    jsonb_build_object('m', 900, 'to', 'Ipoh Padang'), now() - interval '5 days');
end;
$$;

-- ---------------------------------------------------------------------------
-- 18.2 street_asks: the streets route_safe asked this user about. An answer counts
-- only for a street asked in the last 6 hours with a finished walk after the ask.
-- ---------------------------------------------------------------------------
create table public.street_asks (
  user_id uuid not null references auth.users (id) on delete cascade,
  osm_id bigint not null,
  asked_at timestamptz not null default now(),
  primary key (user_id, osm_id)
);
alter table public.street_asks enable row level security;
revoke all on public.street_asks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 18.3 route_calls: one row per route_safe call, for the per-user limit. Callers
-- with no user (the API key alone) share one bucket under the nil id.
-- ---------------------------------------------------------------------------
create table public.route_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index route_calls_user_idx on public.route_calls (user_id, at);
alter table public.route_calls enable row level security;
revoke all on public.route_calls from anon, authenticated;

create or replace function private.route_calls_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.route_calls where at < now() - interval '1 day';
  delete from public.street_asks where asked_at < now() - interval '1 day';
$$;
revoke all on function private.route_calls_cleanup() from public, anon, authenticated;
select cron.schedule('langkah-route-calls-cleanup', '17 * * * *', 'select private.route_calls_cleanup()');

-- The route_safe body (migration 24) moves to private.route_safe_core. The new
-- route_safe counts the call, then records the street questions it returns.
alter function public.route_safe(double precision, double precision, double precision, double precision,
                                 text, boolean, boolean) rename to route_safe_core;
alter function public.route_safe_core(double precision, double precision, double precision, double precision,
                                      text, boolean, boolean) set schema private;
revoke all on function private.route_safe_core(double precision, double precision, double precision,
                                               double precision, text, boolean, boolean)
  from public, anon, authenticated;

create or replace function public.route_safe(
  start_lon double precision, start_lat double precision,
  end_lon double precision, end_lat double precision,
  mode text default 'day',
  p_cover boolean default false,
  p_step_free boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  v_key uuid;
  r jsonb;
begin
  -- Scripts on the database connection (no API role) are not limited.
  if auth.role() is not null then
    v_key := coalesce(me, '00000000-0000-0000-0000-000000000000'::uuid);
    perform pg_advisory_xact_lock(hashtext('route:' || v_key::text));
    if (select count(*) from route_calls c where c.user_id = v_key and c.at > now() - interval '1 minute') >= 30
       or (select count(*) from route_calls c where c.user_id = v_key and c.at > now() - interval '1 day') >= 300 then
      return jsonb_build_object('error', 'rate_limited');
    end if;
    insert into route_calls (user_id) values (v_key);
  end if;

  r := private.route_safe_core(start_lon, start_lat, end_lon, end_lat, mode, p_cover, p_step_free);

  if me is not null and not (r ? 'error') then
    insert into street_asks (user_id, osm_id, asked_at)
    select me, (w.value)::bigint, now()
    from jsonb_array_elements(coalesce(r -> 'safest' -> 'q', '[]'::jsonb) || coalesce(r -> 'fastest' -> 'q', '[]'::jsonb)) q,
         jsonb_array_elements_text(q -> 'w') w
    on conflict (user_id, osm_id) do update set asked_at = excluded.asked_at;
  end if;
  return r;
end;
$$;

revoke all on function public.route_safe(double precision, double precision, double precision, double precision,
                                         text, boolean, boolean) from public;
grant execute on function public.route_safe(double precision, double precision, double precision, double precision,
                                            text, boolean, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- street_answer (migration 21) plus: the street was asked of this user in the last
-- 6 hours and a walk was finished after that. A demo user's answer is kept for
-- them only: the crew "agrees" (the app shows Two walkers agree) but no street fact
-- is written, and demo answers never count towards a real one.
-- ---------------------------------------------------------------------------
create or replace function public.street_answer(p_ways bigint[], p_attr text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  v_demo boolean := public.is_demo_user();
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
  -- Only ways the server asked about, with a walk finished after the ask.
  v_ways := array(select a.osm_id from street_asks a
                  where a.user_id = me and a.osm_id = any (v_ways) and a.asked_at > now() - interval '6 hours'
                    and exists (select 1 from walks w where w.user_id = me and w.created_at >= a.asked_at));
  if coalesce(array_length(v_ways, 1), 0) = 0 then
    return jsonb_build_object('error', 'not_asked');
  end if;

  foreach v_way in array v_ways loop
    insert into street_answers (user_id, osm_id, attr, value)
    values (me, v_way, p_attr, p_value)
    on conflict (user_id, osm_id, attr) do update set value = excluded.value, created_at = now();

    continue when v_demo;

    -- Agreed: 2 or more real walkers, and more than said the opposite.
    select a.value, count(*) as n,
           (select count(*) from street_answers b
            where b.osm_id = v_way and b.attr = p_attr and b.value <> a.value
              and not private.is_demo_account(b.user_id)) as against
      into top
    from street_answers a
    where a.osm_id = v_way and a.attr = p_attr and not private.is_demo_account(a.user_id)
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

  return jsonb_build_object('ok', true, 'points', v_points,
                            'agreed', v_demo or coalesce(array_length(v_agreed, 1), 0) > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- F4: walk_finish takes the walk id from the phone, so a retry (the walk queue)
-- saves and pays the same walk once. rate_walk also answers a repeat with 0.
-- ---------------------------------------------------------------------------
drop function public.walk_finish(int, int, text);

create or replace function public.walk_finish(p_distance int, p_duration int, p_to text default null,
                                              p_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_walk uuid;
  v_points int := 0;
  v_distance int := least(greatest(coalesce(p_distance, 0), 0), 50000);
  v_duration int := least(greatest(coalesce(p_duration, 0), 0), 86400);
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  -- The same walk again (a retry): already saved, nothing more to pay.
  if p_id is not null and exists (select 1 from public.walks w where w.id = p_id) then
    if exists (select 1 from public.walks w where w.id = p_id and w.user_id = auth.uid()) then
      return jsonb_build_object('walk', p_id, 'points', 0);
    end if;
    raise exception 'bad_walk' using errcode = '42501';
  end if;
  if (select count(*) from public.walks w
      where w.user_id = auth.uid() and w.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_walks' using errcode = '54000';
  end if;

  insert into public.walks (id, user_id, distance_m, duration_s)
  values (coalesce(p_id, gen_random_uuid()), auth.uid(), v_distance, v_duration)
  returning id into v_walk;

  if v_duration >= 60 and v_distance <= v_duration * 3 then
    v_points := public.points_add(auth.uid(), v_distance / 100, 'walk', v_walk::text,
      jsonb_strip_nulls(jsonb_build_object('m', v_distance, 'to', left(nullif(trim(p_to), ''), 80))));
  end if;

  return jsonb_build_object('walk', v_walk, 'points', v_points);
end;
$$;

create or replace function public.rate_walk(
  p_rating int, p_mode text, p_kind text, p_score int default null, p_distance int default null,
  p_walk uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  -- Already rated (a retry from the walk queue).
  if p_walk is not null and exists (
       select 1 from public.point_ledger l
       where l.user_id = auth.uid() and l.reason = 'rating' and l.ref = p_walk::text) then
    return 0;
  end if;
  if (select count(*) from public.walk_ratings w
      where w.user_id = auth.uid() and w.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_ratings' using errcode = '54000';
  end if;
  insert into public.walk_ratings (user_id, rating, mode, route_kind, score, distance_m)
  values (auth.uid(), p_rating, p_mode, p_kind, p_score, p_distance);

  if p_walk is not null and exists (
       select 1 from public.walks w where w.id = p_walk and w.user_id = auth.uid()) then
    return public.points_add(auth.uid(), 5, 'rating', p_walk::text);
  end if;
  return 0;
end;
$$;

revoke execute on function public.walk_finish(int, int, text, uuid) from public, anon;
grant execute on function public.walk_finish(int, int, text, uuid) to authenticated;

-- Helpers stay private.
revoke execute on function
  public.demo_helper(text),
  public.demo_helper_name(uuid),
  private.is_demo_account(uuid),
  public.reports_set_demo()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Report reads below: bodies from their latest migrations, reading
-- private.visible_reports instead of reports (generated, see each header).
-- ---------------------------------------------------------------------------

-- private.route_net: body from 20261018000019_route_options.sql, 1 report read(s) now private.visible_reports.
create or replace function private.route_net(
  p_main bigint, p_box extensions.geometry,
  p_s bigint, p_sf double precision, p_e bigint, p_ef double precision,
  p_night boolean, p_step_free boolean default false)
returns table (id bigint, source bigint, target bigint, geom extensions.geometry, length_m double precision,
               pen double precision, hazard boolean, sidewalk text, lit boolean, footway text,
               crossing text, highway text, name text, is_unknown boolean, covered boolean)
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
           s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown, s.covered
    from road_segments s
    left join lateral (
      select true as hit from private.visible_reports r
      where r.kind = 'hazard' and r.status = 'active'
        and (r.expires_at is null or r.expires_at > now())
        and r.geom && st_expand(s.geom, 0.0003)
        and st_dwithin(r.geom::geography, s.geom::geography, 15)
      limit 1) h on true
    where s.component = p_main and s.geom && p_box
      -- Step-free: no stairs, except the edges the start or end sit on.
      and (not p_step_free or s.highway is distinct from 'steps' or s.id in (p_s, p_e))
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
         s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown, s.covered
  from seg s
  where s.id <> p_s and s.id <> p_e
  union all
  select c.pid, coalesce(c.vs, s.source), coalesce(c.vt, s.target),
         -- A zero-length piece keeps the graph connected; it is a two-point line on one spot.
         case when c.ft - c.ff < 1e-9
              then st_makeline(st_lineinterpolatepoint(s.geom, c.ff), st_lineinterpolatepoint(s.geom, c.ff))
              else st_linesubstring(s.geom, c.ff, c.ft) end,
         s.length_m * (c.ft - c.ff), s.pen, s.hazard,
         s.sidewalk, s.lit, s.footway, s.crossing, s.highway, s.name, s.is_unknown, s.covered
  from cuts c
  join seg s on s.id = c.edge;
end;
$$;

-- private.route_build: body from 20261011000016_final_test_fixes.sql, plus 'am' (G7), 1 report read(s) now private.visible_reports.
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
      'am', (select count(*) from amenities a                                      -- bus stops and shelters on route
             where a.kind in ('bus_stop', 'shelter')
               and a.geom && st_expand(line, 0.0003)
               and st_dwithin(a.geom::geography, line::geography, 20)),
      'ux', ux,                                                                    -- unmarked main-road crossings
      'hz', (select count(*) from private.visible_reports h                                        -- active hazards within 15 m
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

-- public.community_reports: body from 20261018000020_fixed_loop.sql, 1 report read(s) now private.visible_reports.
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
      from private.visible_reports r
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

-- public.council_data: body from 20261018000020_fixed_loop.sql, 12 report read(s) now private.visible_reports.
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
      'hz', (select count(*) from private.visible_reports
             where kind = 'hazard' and status = 'active'
               and (expires_at is null or expires_at > now())),
      'im', (select count(*) from private.visible_reports where kind = 'improvement' and status <> 'expired'
             and council_status <> 'fixed'),
      'fixed', (select count(*) from private.visible_reports where kind = 'improvement' and council_status = 'fixed'
                and council_at > since),
      'up', (select count(*) from report_votes v
             join private.visible_reports r on r.id = v.report_id
             where v.vote = 'upvote' and v.user_id <> r.user_id
               and r.kind = 'improvement' and r.status <> 'expired' and r.council_status <> 'fixed'),
      'month', (select count(*) from private.visible_reports where created_at > now() - interval '30 days')),

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
        from private.visible_reports r
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
      from (select * from private.visible_reports
            where kind = 'hazard' and created_at > since
            order by created_at desc
            limit 5000) r
      cross join lateral (
        select count(*) as n from report_votes x
        where x.report_id = r.id and x.vote = 'confirm' and x.user_id <> r.user_id) c), '[]'::jsonb),

    'weeks', (
      select jsonb_agg(jsonb_build_object(
               'w', w.d,
               'hz', (select count(*) from private.visible_reports r
                      where r.kind = 'hazard'
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date >= w.d
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date < w.d + 7),
               'im', (select count(*) from private.visible_reports r
                      where r.kind = 'improvement'
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date >= w.d
                        and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date < w.d + 7),
               'up', (select count(*) from report_votes v
                      join private.visible_reports r on r.id = v.report_id
                      where v.vote = 'upvote' and v.user_id <> r.user_id
                        and (v.created_at at time zone 'Asia/Kuala_Lumpur')::date >= w.d
                        and (v.created_at at time zone 'Asia/Kuala_Lumpur')::date < w.d + 7))
             order by w.d)
      from (select (week0 + 7 * i) as d from generate_series(0, 11) i) w),

    'cats', jsonb_build_object(
      'hazard', coalesce((
        select jsonb_agg(jsonb_build_object('cat', category, 'n', n) order by n desc, category)
        from (select category, count(*) as n from private.visible_reports
              where kind = 'hazard' and created_at > since group by category) c), '[]'::jsonb),
      'improvement', coalesce((
        select jsonb_agg(jsonb_build_object('cat', category, 'n', n) order by n desc, category)
        from (select category, count(*) as n from private.visible_reports
              where kind = 'improvement' and created_at > since group by category) c), '[]'::jsonb)));
end;
$$;

-- public.community_export: body from 20261011000009_reports_community.sql, 1 report read(s) now private.visible_reports.
create or replace function public.community_export()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(item order by up desc, created desc), '[]'::jsonb)
  from (
    select v.up, r.created_at as created,
           jsonb_build_object(
             'id', r.id,
             'cat', r.category,
             'lon', round(st_x(r.geom)::numeric, 5),
             'lat', round(st_y(r.geom)::numeric, 5),
             'upvotes', v.up,
             'status', r.status,
             'created', r.created_at,
             'street', s.name,
             'note', r.note) as item
    from private.visible_reports r
    cross join lateral (
      select count(*) as up from report_votes x
      where x.report_id = r.id and x.vote = 'upvote' and x.user_id <> r.user_id) v
    left join lateral (
      select g.name from road_segments g
      where g.name is not null and st_dwithin(g.geom, r.geom, 0.0004)
      order by g.geom <-> r.geom
      limit 1) s on true
    where r.kind = 'improvement' and r.status <> 'expired'
    order by v.up desc, r.created_at desc
    limit 1000
  ) q;
$$;

-- The council exports run in the browser from council_data; the old app export is unused.
revoke execute on function public.community_export() from public, anon;
