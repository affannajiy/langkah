-- Phase 10: Langkah Points ledger, earn rules, daily check-in and the demo account.
-- Guide Section 15 (Langkah Points) and Section 8 (RLS on every table).
--
-- Rules:
-- - Points move only through the security definer functions below. The app cannot
--   insert ledger rows or change a balance.
-- - Reports, votes and upvotes stay free. An upvote earns nothing, so nobody can farm
--   the council ranking.
-- - Daily caps count by the Malaysian day (Asia/Kuala_Lumpur).

-- ---------------------------------------------------------------------------
-- point_ledger: every change to a balance, newest last. ref makes an earn happen
-- at most once (one vote per report, one rating per walk, one check-in per day).
-- meta holds what the app needs to word the line (street, km, place, bank).
-- ---------------------------------------------------------------------------
create table public.point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null check (amount <> 0),
  reason text not null check (reason in
    ('welcome', 'walk', 'hazard_confirmed', 'improvement_photo', 'vote', 'rating', 'checkin', 'ad', 'topup')),
  ref text check (char_length(ref) <= 80),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index point_ledger_once_idx on public.point_ledger (user_id, reason, ref) where ref is not null;
create index point_ledger_user_idx on public.point_ledger (user_id, created_at desc);

alter table public.point_ledger enable row level security;
revoke all on public.point_ledger from anon, authenticated;
grant select on public.point_ledger to authenticated;
create policy "Users read their own ledger" on public.point_ledger
  for select to authenticated using (user_id = (select auth.uid()));

create table public.point_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.point_balances enable row level security;
revoke all on public.point_balances from anon, authenticated;
grant select on public.point_balances to authenticated;
create policy "Users read their own balance" on public.point_balances
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- walks: one row per finished walk, so a rating earns once per walk and walk
-- points have a daily cap. Only the numbers: no track, no start or end point.
-- ---------------------------------------------------------------------------
create table public.walks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  distance_m int not null check (distance_m between 0 and 50000),
  duration_s int not null check (duration_s between 0 and 86400),
  created_at timestamptz not null default now()
);

create index walks_user_idx on public.walks (user_id, created_at);

alter table public.walks enable row level security;
revoke all on public.walks from anon, authenticated;

-- The demo profile: name and user code for the Me tab, and the demo flag that lets a
-- guest write while the server's demo switch is on.
alter table public.profiles
  add column is_demo boolean not null default false,
  add column user_code text check (char_length(user_code) <= 20);

-- ---------------------------------------------------------------------------
-- points_add: the only way points move. Private (no grant).
-- Returns the points actually added: 0 when the ref was already paid, a cap is hit,
-- or the demo filler turned points off for this transaction.
-- Caps: walk 50 points a day, improvement photo 5 a day, vote 20 a day, ad 5 a day.
-- ---------------------------------------------------------------------------
create or replace function public.malaysia_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kuala_Lumpur')::date;
$$;

create or replace function public.points_add(
  p_user uuid, p_amount int, p_reason text, p_ref text default null,
  p_meta jsonb default '{}'::jsonb, p_at timestamptz default now())
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
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

  insert into public.point_balances (user_id, balance, updated_at)
  values (p_user, v_amount, now())
  on conflict (user_id) do update
    set balance = public.point_balances.balance + excluded.balance, updated_at = now();

  return v_amount;
end;
$$;

-- The street nearest a report, for ledger lines ("Broken drain cover, Jalan ...").
create or replace function public.report_street(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select g.name
  from reports r
  join road_segments g on g.name is not null and st_dwithin(g.geom, r.geom, 0.0004)
  where r.id = p_id
  order by g.geom <-> r.geom
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Demo helpers. Afrina (demo) is a server-only account made by
-- data-scripts/seed_demo.py. Without her, the demo still works, with no live confirm.
-- ---------------------------------------------------------------------------
create or replace function public.demo_afrina()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select '6c616e67-6b61-4864-8065-6d6f00000005'::uuid;
$$;

create or replace function public.is_demo_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_demo);
$$;

-- "May this user write?" Signed in with Google, or the demo account while the
-- server's demo switch is on. Plain guests no longer write in demo mode.
create or replace function public.is_full_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
          or (public.demo_writes_open() and public.is_demo_user()));
$$;

-- ---------------------------------------------------------------------------
-- Earn: votes. +2 for a hazard vote (Still there or Gone), once per report.
-- The reporter gets +20 the first time someone else says Still there.
-- Upvotes earn nothing.
-- ---------------------------------------------------------------------------
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
  select id, user_id, kind, category into r from public.reports where id = new.report_id;
  if not found or r.kind <> 'hazard' or r.user_id = new.user_id then
    return null;
  end if;

  perform public.points_add(new.user_id, 2, 'vote', new.report_id::text,
                            jsonb_build_object('cat', r.category));

  if new.vote = 'confirm' then
    -- A name only for the demo helper; real voters stay unnamed.
    perform public.points_add(r.user_id, 20, 'hazard_confirmed', new.report_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'cat', r.category,
        'street', public.report_street(r.id),
        'by', case when new.user_id = public.demo_afrina() then 'Afrina' end)));
  end if;
  return null;
end;
$$;

create trigger report_votes_points
  after insert or update of vote on public.report_votes
  for each row execute function public.report_votes_points();

-- ---------------------------------------------------------------------------
-- Earn: +10 for an improvement report with a photo (at posting or added later),
-- 5 a day. Also: a demo account's new hazard gets Afrina's Still there at once.
-- ---------------------------------------------------------------------------
create or replace function public.reports_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'improvement' and new.photo_path is not null
     and (tg_op = 'INSERT' or old.photo_path is null) then
    perform public.points_add(new.user_id, 10, 'improvement_photo', new.id::text,
      jsonb_strip_nulls(jsonb_build_object('cat', new.category, 'street', public.report_street(new.id))));
  end if;

  if tg_op = 'INSERT' and new.kind = 'hazard'
     and current_setting('langkah.no_points', true) is distinct from 'on'
     and public.demo_writes_open()
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.is_demo)
     and exists (select 1 from auth.users u where u.id = public.demo_afrina()) then
    insert into public.report_votes (report_id, user_id, vote)
    values (new.id, public.demo_afrina(), 'confirm')
    on conflict (report_id, user_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger reports_points
  after insert or update of photo_path on public.reports
  for each row execute function public.reports_points();

-- ---------------------------------------------------------------------------
-- Earn: walks. The app measures the GPS track on the phone (jumps faster than
-- running are dropped) and sends only metres and seconds. The server rejects an
-- average faster than 3 m/s and pays 10 points per km, 50 a day.
-- Returns {walk, points}. Guests earn too.
-- ---------------------------------------------------------------------------
create or replace function public.walk_finish(p_distance int, p_duration int, p_to text default null)
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
  if (select count(*) from public.walks w
      where w.user_id = auth.uid() and w.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_walks' using errcode = '54000';
  end if;

  insert into public.walks (user_id, distance_m, duration_s)
  values (auth.uid(), v_distance, v_duration)
  returning id into v_walk;

  if v_duration >= 60 and v_distance <= v_duration * 3 then
    v_points := public.points_add(auth.uid(), v_distance / 100, 'walk', v_walk::text,
      jsonb_strip_nulls(jsonb_build_object('m', v_distance, 'to', left(nullif(trim(p_to), ''), 80))));
  end if;

  return jsonb_build_object('walk', v_walk, 'points', v_points);
end;
$$;

-- rate_walk gains the walk id (+5, once per walk) and returns the points added.
drop function public.rate_walk(int, text, text, int, int);

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

-- ---------------------------------------------------------------------------
-- Daily check-in, called by the app on its first open each Malaysian day.
-- +5 a day, +50 on day 7, then the cycle starts again. A missed day goes back to 1.
-- Returns {day, points}; points 0 when already checked in today.
-- ---------------------------------------------------------------------------
create or replace function public.checkin_day(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- The streak day of the last check-in, and whether it was today.
  select coalesce((
    select jsonb_build_object(
             'day', case when l.ref::date >= public.malaysia_today() - 1 then (l.meta ->> 'day')::int else 0 end,
             'today', l.ref::date = public.malaysia_today())
    from public.point_ledger l
    where l.user_id = p_user and l.reason = 'checkin'
    order by l.ref desc
    limit 1), jsonb_build_object('day', 0, 'today', false));
$$;

create or replace function public.daily_checkin()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_last jsonb;
  v_day int;
  v_points int;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_last := public.checkin_day(auth.uid());
  if (v_last ->> 'today')::boolean then
    return jsonb_build_object('day', (v_last ->> 'day')::int, 'points', 0);
  end if;
  v_day := ((v_last ->> 'day')::int % 7) + 1;
  v_points := public.points_add(auth.uid(), case when v_day = 7 then 50 else 5 end, 'checkin',
                                public.malaysia_today()::text, jsonb_build_object('day', v_day));
  return jsonb_build_object('day', v_day, 'points', v_points);
end;
$$;

-- ---------------------------------------------------------------------------
-- Me tab wallet: balance, the last 10 ledger lines, check-in day and the profile.
-- ---------------------------------------------------------------------------
create or replace function public.my_wallet()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'balance', coalesce((select b.balance from public.point_balances b where b.user_id = auth.uid()), 0),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'amount', l.amount, 'reason', l.reason, 'ref', l.ref, 'meta', l.meta, 'at', l.created_at)
             order by l.created_at desc, l.id desc)
      from (select * from public.point_ledger x
            where x.user_id = auth.uid()
            order by x.created_at desc, x.id desc
            limit 10) l), '[]'::jsonb),
    'checkin', public.checkin_day(auth.uid()),
    'demo', coalesce((select p.is_demo from public.profiles p where p.id = auth.uid()), false),
    'name', (select p.display_name from public.profiles p where p.id = auth.uid() and p.is_demo),
    'code', (select p.user_code from public.profiles p where p.id = auth.uid()))
  where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Welcome +1000: once per account, the first time it is signed in with Google.
-- sync_profile() is called by the app right after Google sign-in.
-- ---------------------------------------------------------------------------
create or replace function public.sync_profile()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return null;
  end if;

  select left(trim(coalesce(
           nullif(i.identity_data ->> 'given_name', ''),
           split_part(coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name', ''), ' ', 1))), 40)
    into v_name
  from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'google'
  order by i.last_sign_in_at desc nulls last
  limit 1;

  v_name := nullif(v_name, '');
  insert into public.profiles (id, display_name, updated_at)
  values (auth.uid(), v_name, now())
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  if exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'google') then
    perform public.points_add(auth.uid(), 1000, 'welcome', 'welcome');
  end if;
  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- The demo account. No password ships in the app: "Try the demo" makes a guest,
-- then demo_start() fills it with Demo Walker's history. Reset demo calls
-- demo_reset(), which wipes and fills again. Afrina's votes on the demo user's
-- reports go with the reports (on delete cascade).
-- ---------------------------------------------------------------------------
create or replace function public.demo_fill(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_today date := public.malaysia_today();
  v_hazard uuid;
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

  insert into public.profiles (id, display_name, user_code, is_demo, updated_at)
  values (p_user, 'Demo Walker', 'LGK-DEMO-01', true, now())
  on conflict (id) do update
    set display_name = 'Demo Walker', user_code = 'LGK-DEMO-01', is_demo = true, updated_at = now();

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

  if exists (select 1 from auth.users u where u.id = public.demo_afrina()) then
    insert into public.report_votes (report_id, user_id, vote)
    values (v_hazard, public.demo_afrina(), 'confirm')
    on conflict do nothing;
  end if;

  -- A few votes on the seeded demo hazards, when they exist.
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
  -- automatic check-in shows day 4 of 7.
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
                                         'by', 'Afrina')), now() - interval '1 day');
  perform public.points_add(p_user, 11, 'walk', v_walk1::text,
    jsonb_build_object('m', 1100, 'to', 'Ipoh Railway Station'), now() - interval '3 hours');
  perform public.points_add(p_user, 5, 'rating', v_walk1::text, '{}'::jsonb, now() - interval '3 hours');
  perform public.points_add(p_user, 9, 'walk', 'demo-walk-1',
    jsonb_build_object('m', 900, 'to', 'Ipoh Padang'), now() - interval '5 days');
end;
$$;

-- "Try the demo": only for a guest, only while the demo switch is on.
create or replace function public.demo_start()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not_a_guest' using errcode = '42501';
  end if;
  if not public.demo_writes_open() then
    raise exception 'demo_closed' using errcode = '42501';
  end if;
  perform public.demo_fill(auth.uid());
end;
$$;

-- Reset demo (Me tab, demo account only).
create or replace function public.demo_reset()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_demo_user() then
    raise exception 'not_demo' using errcode = '42501';
  end if;
  perform public.demo_fill(auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Helpers stay private; app entry points are listed explicitly.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.malaysia_today(),
  public.points_add(uuid, int, text, text, jsonb, timestamptz),
  public.report_street(uuid),
  public.demo_afrina(),
  public.is_demo_user(),
  public.walk_finish(int, int, text),
  public.rate_walk(int, text, text, int, int, uuid),
  public.checkin_day(uuid),
  public.daily_checkin(),
  public.my_wallet(),
  public.demo_fill(uuid),
  public.demo_start(),
  public.demo_reset()
from public, anon;

-- is_full_user() runs as the caller, so callers need is_demo_user().
grant execute on function public.is_demo_user() to authenticated;
grant execute on function
  public.walk_finish(int, int, text),
  public.rate_walk(int, text, text, int, int, uuid),
  public.daily_checkin(),
  public.my_wallet(),
  public.demo_start(),
  public.demo_reset()
to authenticated;
