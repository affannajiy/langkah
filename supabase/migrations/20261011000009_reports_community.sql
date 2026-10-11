-- Phase 5: reports, votes and the Community tab.
-- Guide Sections 5.2 (screens 11 to 15), 6.3 (screens 6 and 7), 7.2 (keeping reports
-- trustworthy) and 8 (data model, RLS).
--
-- Trust rules (Section 7.2, filled in where the guide is silent):
--   Hazard       pending -> active at 2 "Still there" votes from others, or 1 when the
--                report has a photo. The reporter's own report never counts.
--                Each "Still there" pushes expiry to now + 7 days.
--                2 "Gone" votes since the last "Still there" -> expired.
--                Expires 7 days after the last confirmation (nightly job below).
--   Improvement  never expires. pending -> active at 2 upvotes from others.
--                Ranked by upvotes, one vote per user.
-- Users can change their vote; status follows at once, so routing reacts at once.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Allowed categories per kind. Kept in one place for the insert check and the app.
-- ---------------------------------------------------------------------------
create or replace function public.report_category_ok(p_kind text, p_category text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'hazard' then p_category in
      ('broken_sidewalk', 'blocked_path', 'no_light', 'unsafe_crossing', 'flooding', 'other')
    when 'improvement' then p_category in
      ('zebra_crossing', 'repaint_crossing', 'fix_sidewalk', 'street_lights', 'shelter', 'kerb_ramp', 'other')
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: the name shown on reports that are not posted anonymously.
-- Only the first name from Google. No client access at all: names are read only
-- through community_reports(), and only for reports with post_anonymously = false.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

-- Called by the app after Google sign-in. Copies the given name from the linked
-- Google identity into profiles. Returns the name, or null for guests.
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
  if not public.is_full_user() then
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
  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- reports: checks on every insert and on a later photo, whoever writes.
-- ---------------------------------------------------------------------------
create or replace function public.reports_validate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.report_category_ok(new.kind, new.category) then
    raise exception 'bad_category' using errcode = '22023';
  end if;

  -- Ipoh only (the road data extent, padded). Coordinates at 5 decimals (Section 7.4).
  if st_x(new.geom) not between 100.85 and 101.15 or st_y(new.geom) not between 4.30 and 4.70 then
    raise exception 'outside_ipoh' using errcode = '22023';
  end if;
  new.geom := st_setsrid(st_makepoint(round(st_x(new.geom)::numeric, 5),
                                      round(st_y(new.geom)::numeric, 5)), 4326);

  -- A photo must be a file this user uploaded to report-photos, named <uuid>.jpg.
  -- Scripts that run without a user (auth.uid() is null) are trusted.
  if new.photo_path is not null and auth.uid() is not null
     and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path) then
    if new.photo_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
       or not exists (select 1 from storage.objects o
                      where o.bucket_id = 'report-photos' and o.name = new.photo_path
                        and o.owner_id = auth.uid()::text) then
      raise exception 'bad_photo' using errcode = '22023';
    end if;
  end if;

  -- Simple abuse limit: 20 reports per user per day.
  if tg_op = 'INSERT' and auth.uid() is not null
     and (select count(*) from public.reports r
          where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_reports' using errcode = '54000';
  end if;

  return new;
end;
$$;

create trigger reports_validate
  before insert or update of photo_path, geom, category, kind on public.reports
  for each row execute function public.reports_validate();

-- ---------------------------------------------------------------------------
-- Status from votes (Section 7.2). Runs as owner because clients cannot see other
-- users' votes or write status.
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
  select kind, status, photo_path, user_id into r
  from public.reports where id = p_id for update;
  if not found or r.status = 'expired' then
    return;
  end if;

  select count(*) filter (where v.vote = 'confirm'),
         count(*) filter (where v.vote = 'upvote'),
         max(v.created_at) filter (where v.vote = 'confirm')
    into n_confirm, n_up, last_confirm
  from public.report_votes v
  where v.report_id = p_id and v.user_id <> r.user_id;

  if r.kind = 'improvement' then
    if r.status = 'pending' and n_up >= 2 then
      update public.reports set status = 'active' where id = p_id;
    end if;
    return;
  end if;

  select count(*) into n_gone
  from public.report_votes v
  where v.report_id = p_id and v.user_id <> r.user_id and v.vote = 'gone'
    and v.created_at > coalesce(last_confirm, '-infinity'::timestamptz);

  if n_gone >= 2 then
    update public.reports set status = 'expired', expires_at = least(expires_at, now()) where id = p_id;
  elsif r.status = 'pending' and (n_confirm >= 2 or (n_confirm >= 1 and r.photo_path is not null)) then
    update public.reports set status = 'active' where id = p_id;
  end if;
end;
$$;

-- Vote time is the real clock time, and a changed vote counts as new, so
-- "since the last Still there" stays honest.
create or replace function public.report_votes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger report_votes_touch
  before insert or update on public.report_votes
  for each row execute function public.report_votes_touch();

create or replace function public.report_votes_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.report_id, old.report_id);
begin
  -- "Still there" keeps a hazard alive for another 7 days.
  if tg_op <> 'DELETE' and new.vote = 'confirm' then
    update public.reports
      set expires_at = greatest(coalesce(expires_at, now()), now() + interval '7 days')
    where id = v_id and kind = 'hazard' and status <> 'expired';
  end if;
  perform public.report_refresh(v_id);
  return null;
end;
$$;

create trigger report_votes_apply
  after insert or update or delete on public.report_votes
  for each row execute function public.report_votes_apply();

-- A photo added later can activate a hazard with one confirmation.
create or replace function public.reports_photo_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.report_refresh(new.id);
  return null;
end;
$$;

create trigger reports_photo_apply
  after update of photo_path on public.reports
  for each row when (new.photo_path is not null and old.photo_path is null)
  execute function public.reports_photo_apply();

-- ---------------------------------------------------------------------------
-- report_votes: who may vote. Not on your own report, not on an expired one, and the
-- vote must fit the kind ("confirm"/"gone" for hazards, "upvote" for improvements).
-- Security definer because reports.user_id is hidden from clients.
-- ---------------------------------------------------------------------------
create or replace function public.can_vote(p_report uuid, p_vote text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report
      and r.user_id <> auth.uid()
      and r.status <> 'expired'
      and (r.expires_at is null or r.expires_at > now())
      and ((r.kind = 'hazard' and p_vote in ('confirm', 'gone'))
           or (r.kind = 'improvement' and p_vote = 'upvote')));
$$;

drop policy "Signed-in users vote once per report" on public.report_votes;
create policy "Signed-in users vote once per report" on public.report_votes
  for insert to authenticated
  with check (public.is_full_user() and user_id = (select auth.uid()) and public.can_vote(report_id, vote));

grant update (vote) on public.report_votes to authenticated;
create policy "Users change their own votes" on public.report_votes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (public.is_full_user() and user_id = (select auth.uid()) and public.can_vote(report_id, vote));

-- ---------------------------------------------------------------------------
-- Client entry points for writing. Both run as the caller, so RLS decides.
-- ---------------------------------------------------------------------------
create or replace function public.report_create(
  p_kind text, p_category text, p_lon double precision, p_lat double precision,
  p_note text default null, p_photo text default null, p_anonymous boolean default true)
returns uuid
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  insert into reports (kind, category, geom, note, photo_path, post_anonymously)
  values (p_kind, p_category, st_setsrid(st_makepoint(p_lon, p_lat), 4326),
          nullif(trim(p_note), ''), p_photo, coalesce(p_anonymous, true))
  returning id into v_id;
  return v_id;
end;
$$;

-- p_vote null removes the vote.
create or replace function public.report_vote(p_id uuid, p_vote text)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  if p_vote is null then
    delete from report_votes where report_id = p_id and user_id = auth.uid();
  else
    insert into report_votes (report_id, vote) values (p_id, p_vote)
    on conflict (report_id, user_id) do update set vote = excluded.vote;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- community_reports: the Community list, map view and detail sheet.
-- Security definer for the vote counts and names, so it returns only public fields:
-- never user_id, and a name only when the report is not anonymous.
--   p_kind  'hazard' | 'improvement'
--   p_sort  'top' | 'newest' | 'nearest' (nearest needs p_lon/p_lat)
--   p_box   [min_lon, min_lat, max_lon, max_lat] for the map view, at most 0.05 degrees
--   p_id    one report, for the detail sheet (any status)
-- Expired reports are left out of lists. Coordinates at 5 decimals (Section 7.4).
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

-- Council export: improvement requests ranked by upvotes ("Most requested in Ipoh").
-- The app turns this into CSV or GeoJSON. No names, no user ids.
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
    from reports r
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

-- Street name at a point, for the report flow's "Place" step.
create or replace function public.street_at(p_lon double precision, p_lat double precision)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select g.name from road_segments g
  where g.name is not null
    and st_dwithin(g.geom, st_setsrid(st_makepoint(p_lon, p_lat), 4326), 0.0004)
  order by g.geom <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)
  limit 1;
$$;
-- road_segments is not readable by clients, so street_at needs to run as owner.
alter function public.street_at(double precision, double precision) security definer;

-- ---------------------------------------------------------------------------
-- Nightly expiry (Section 7.2). Plain SQL on pg_cron, no Edge Function: nothing to
-- deploy and no key to store. 19:00 UTC is 03:00 in Malaysia.
-- Routing already ignores hazards past expires_at; this keeps status honest.
-- ---------------------------------------------------------------------------
create or replace function public.expire_reports()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.reports set status = 'expired'
  where kind = 'hazard' and status <> 'expired' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

select cron.schedule('langkah-expire-reports', '0 19 * * *', 'select public.expire_reports()');

-- ---------------------------------------------------------------------------
-- Function grants. Functions in public are callable through the API unless revoked.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.reports_validate(),
  public.report_refresh(uuid),
  public.report_votes_touch(),
  public.report_votes_apply(),
  public.reports_photo_apply(),
  public.expire_reports()
from public, anon, authenticated;

revoke execute on function
  public.sync_profile(),
  public.can_vote(uuid, text),
  public.report_create(text, text, double precision, double precision, text, text, boolean),
  public.report_vote(uuid, text),
  public.community_reports(text, text, double precision, double precision, double precision[], uuid, int, int),
  public.community_export(),
  public.street_at(double precision, double precision),
  public.report_category_ok(text, text)
from public, anon;

-- Guests read; only signed-in users write (RLS still checks is_full_user()).
grant execute on function
  public.community_reports(text, text, double precision, double precision, double precision[], uuid, int, int),
  public.community_export(),
  public.street_at(double precision, double precision)
to anon, authenticated;

grant execute on function
  public.sync_profile(),
  public.can_vote(uuid, text),
  public.report_create(text, text, double precision, double precision, text, text, boolean),
  public.report_vote(uuid, text),
  public.report_category_ok(text, text)
to authenticated;
