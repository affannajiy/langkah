-- Phase 12: shops on the map (docs/revenue-plan.md Phase 12; guide Section 15).
-- Partner shops with a place on the map and one voucher each, sponsored pins in
-- map_in_view (at most 3), and private view, tap and redeem counts for the partner
-- report. Shop names are proper nouns and the offers carry their own EN and BM text,
-- so a new partner needs no app update.

-- ---------------------------------------------------------------------------
-- partners: one row per shop. Open from starts_on to ends_on (Malaysian dates).
-- Anyone may read an open partner: the map shows them to guests too.
-- ---------------------------------------------------------------------------
create table public.partners (
  id text primary key check (char_length(id) <= 40),
  name text not null check (char_length(name) between 1 and 60),
  offer_en text not null check (char_length(offer_en) between 1 and 80),
  offer_ms text not null check (char_length(offer_ms) between 1 and 80),
  address text not null check (char_length(address) between 1 and 80),
  rm_off int not null check (rm_off between 1 and 50),
  geom geometry(Point, 4326) not null,
  starts_on date not null,
  ends_on date,
  check (ends_on is null or ends_on >= starts_on)
);

create index partners_geom_idx on public.partners using gist (geom);

alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;
grant select on public.partners to anon, authenticated;
-- Inline date: policies run as the caller, who cannot execute malaysia_today().
create policy "Anyone reads open partners" on public.partners
  for select to anon, authenticated
  using (starts_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date
         and (ends_on is null or ends_on >= (now() at time zone 'Asia/Kuala_Lumpur')::date));

-- Made-up shops on real Old Town and New Town streets (no real shop is named).
insert into public.partners (id, name, offer_en, offer_ms, address, rm_off, geom, starts_on, ends_on) values
  ('kopi_kinta', 'Kopi Kinta Corner', 'Any kopi or teh', 'Mana-mana kopi atau teh', 'Jalan Sultan Yusuf, Old Town', 2,
   st_setsrid(st_makepoint(101.07672, 4.59466), 4326), '2026-10-01', null),
  ('roti_pak_mat', 'Roti Bakar Pak Mat', 'Kaya toast set', 'Set roti bakar kaya', 'Jalan Bandar Timah, Old Town', 3,
   st_setsrid(st_makepoint(101.07754, 4.59496), 4326), '2026-10-01', null),
  ('tau_fu_fa', 'Lorong Tau Fu Fa', 'Any bowl', 'Mana-mana mangkuk', 'Lorong Panglima (Concubine Lane)', 1,
   st_setsrid(st_makepoint(101.07854, 4.59617), 4326), '2026-10-01', null),
  ('kinta_bookstop', 'Kinta Bookstop', 'Books over RM30', 'Buku melebihi RM30', 'Hale Lane, Old Town', 5,
   st_setsrid(st_makepoint(101.07768, 4.59727), 4326), '2026-10-01', null),
  ('cendol_maharajalela', 'Cendol Maharajalela', 'Any cendol or ais kacang', 'Mana-mana cendol atau ais kacang',
   'Jalan Dato Maharajalela, near the station', 2,
   st_setsrid(st_makepoint(101.07600, 4.59730), 4326), '2026-10-01', '2026-12-31'),
  ('kasut_kinta', 'Kasut Kinta', 'Walking shoes over RM100', 'Kasut berjalan melebihi RM100', 'Jalan Sultan Idris Shah, New Town', 5,
   st_setsrid(st_makepoint(101.08086, 4.59773), 4326), '2026-10-01', null);

-- ---------------------------------------------------------------------------
-- shop_items: each voucher now belongs to a partner, and shows only while that
-- partner is open. Prices are public, so guests before sign-in may read them too.
-- ---------------------------------------------------------------------------
alter table public.shop_items add column partner_id text unique references public.partners (id);

insert into public.shop_items (id, kind, cost, sort) values
  ('cendol_maharajalela', 'voucher', 250, 5),
  ('kasut_kinta', 'voucher', 600, 6);

update public.shop_items set partner_id = id where kind = 'voucher';

alter table public.shop_items
  add constraint shop_items_voucher_partner check ((kind = 'voucher') = (partner_id is not null));

drop policy "Signed-in users read the shop" on public.shop_items;
grant select on public.shop_items to anon;
-- The partners lookup runs under the partners policy, so a closed partner hides its voucher.
create policy "Anyone reads the open shop" on public.shop_items
  for select to anon, authenticated
  using (active and (partner_id is null
                     or exists (select 1 from public.partners p where p.id = partner_id)));

-- ---------------------------------------------------------------------------
-- partner_events: views and taps on sponsored pins, once per user, shop and
-- Malaysian day. Private: no grants, written only by partner_seen. Sample rows
-- for the sales pitch have no user, a count in n, and demo = true
-- (seed_demo.py --partner-stats). Redeems come from user_items.
-- ---------------------------------------------------------------------------
create table public.partner_events (
  id bigint generated always as identity primary key,
  partner_id text not null references public.partners (id) on delete cascade,
  kind text not null check (kind in ('view', 'tap', 'redeem')),
  day date not null,
  user_id uuid references auth.users (id) on delete cascade,
  n int not null default 1 check (n > 0),
  demo boolean not null default false,
  check (demo or (user_id is not null and n = 1 and kind in ('view', 'tap')))
);

create unique index partner_events_once_idx on public.partner_events (partner_id, kind, day, user_id)
  where user_id is not null;
create index partner_events_day_idx on public.partner_events (day);

alter table public.partner_events enable row level security;
revoke all on public.partner_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- partner_seen: the app reports which sponsored pins were on screen ('view') or
-- tapped ('tap'). Unknown or closed partners are skipped. Repeats the same day
-- change nothing, so panning around cannot inflate the count.
-- ---------------------------------------------------------------------------
create or replace function public.partner_seen(p_ids text[], p_kind text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_kind not in ('view', 'tap') or p_ids is null or cardinality(p_ids) > 5 then
    raise exception 'bad_input' using errcode = '22023';
  end if;
  insert into public.partner_events (partner_id, kind, day, user_id)
  select p.id, p_kind, public.malaysia_today(), auth.uid()
  from public.partners p
  where p.id = any (p_ids)
    and p.starts_on <= public.malaysia_today()
    and (p.ends_on is null or p.ends_on >= public.malaysia_today())
  on conflict (partner_id, kind, day, user_id) where user_id is not null do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- shop_buy: as in migration 13, plus: a voucher needs an open partner, and the
-- ledger line keeps the shop name so old lines still read right after it closes.
-- ---------------------------------------------------------------------------
create or replace function public.shop_buy(p_item text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.shop_items;
  v_name text;
  v_id uuid;
  v_code text;
  v_balance int;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_item from public.shop_items s where s.id = p_item and s.active;
  if not found then
    raise exception 'no_item' using errcode = '22023';
  end if;
  if v_item.kind = 'voucher' then
    select p.name into v_name from public.partners p
    where p.id = v_item.partner_id
      and p.starts_on <= public.malaysia_today()
      and (p.ends_on is null or p.ends_on >= public.malaysia_today());
    if v_name is null then
      raise exception 'no_item' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('points:' || auth.uid()::text));
  if v_item.kind <> 'voucher' and exists (
       select 1 from public.user_items u where u.user_id = auth.uid() and u.item_id = p_item) then
    raise exception 'owned' using errcode = '23505';
  end if;
  v_balance := coalesce((select b.balance from public.point_balances b where b.user_id = auth.uid()), 0);
  if v_balance < v_item.cost then
    raise exception 'not_enough' using errcode = '54000';
  end if;

  if v_item.kind = 'voucher' then
    v_code := 'LGK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  insert into public.user_items (user_id, item_id, code) values (auth.uid(), p_item, v_code)
  returning id into v_id;

  perform public.points_add(auth.uid(), -v_item.cost,
    case when v_item.kind = 'voucher' then 'voucher' else 'cosmetic' end, v_id::text,
    jsonb_strip_nulls(jsonb_build_object('item', p_item, 'name', v_name)));

  return jsonb_build_object('id', v_id, 'item', p_item, 'code', v_code, 'balance', v_balance - v_item.cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- my_items: what the caller bought, newest first, with the shop for a voucher
-- even after the partner has closed (the code may still be shown at the counter).
--   [{id, item, code, at, p: {name, en, ms, rm, addr} | null}]
-- ---------------------------------------------------------------------------
create or replace function public.my_items()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'item', u.item_id, 'code', u.code, 'at', u.created_at,
           'p', case when p.id is null then null else jsonb_build_object(
                  'name', p.name, 'en', p.offer_en, 'ms', p.offer_ms, 'rm', p.rm_off, 'addr', p.address) end)
         order by u.created_at desc), '[]'::jsonb)
  from (select * from public.user_items x where x.user_id = auth.uid()
        order by x.created_at desc limit 50) u
  join public.shop_items s on s.id = u.item_id
  left join public.partners p on p.id = s.partner_id;
$$;

-- ---------------------------------------------------------------------------
-- map_in_view: as in migration 5, plus sponsored pins. Still runs as the caller,
-- so the partners and shop_items policies pick the open shops.
--   sp: [[id, lon, lat, name, offer_en, offer_ms, rm_off, item, cost, address], ...]
--       at most 3, the closest to the middle of the view (the Waze rule)
-- ---------------------------------------------------------------------------
create or replace function public.map_in_view(
  min_lon double precision, min_lat double precision,
  max_lon double precision, max_lat double precision)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  box geometry;
begin
  if min_lon is null or min_lat is null or max_lon is null or max_lat is null
     or min_lon < -180 or max_lon > 180 or min_lat < -90 or max_lat > 90
     or min_lon >= max_lon or min_lat >= max_lat then
    return jsonb_build_object('error', 'bad_box');
  end if;
  if max_lon - min_lon > 0.05 or max_lat - min_lat > 0.05 then
    return jsonb_build_object('error', 'too_big');
  end if;

  box := st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326);

  return jsonb_build_object(
    'hz', coalesce((
      select jsonb_agg(jsonb_build_array(r.id, round(st_x(r.geom)::numeric, 5),
                                         round(st_y(r.geom)::numeric, 5), r.category)
                       order by r.created_at desc)
      from (select id, geom, category, created_at from reports
            where kind = 'hazard' and status = 'active'
              and (expires_at is null or expires_at > now())
              and geom && box
            order by created_at desc
            limit 200) r), '[]'::jsonb),
    'am', coalesce((
      select jsonb_agg(jsonb_build_array(a.kind, round(st_x(a.geom)::numeric, 5),
                                         round(st_y(a.geom)::numeric, 5)))
      from (select kind, geom from amenities
            where geom && box
              and (kind in ('bus_stop', 'shelter')
                   or (kind = 'crossing' and coalesce(tags ->> 'crossing', '') in
                       ('marked', 'zebra', 'uncontrolled', 'traffic_signals', 'pelican', 'toucan')))
            limit 400) a), '[]'::jsonb),
    'sp', coalesce((
      select jsonb_agg(jsonb_build_array(q.id, round(st_x(q.geom)::numeric, 5), round(st_y(q.geom)::numeric, 5),
                                         q.name, q.offer_en, q.offer_ms, q.rm_off, q.item, q.cost, q.address)
                       order by q.d)
      from (select p.id, p.geom, p.name, p.offer_en, p.offer_ms, p.rm_off, p.address,
                   s.id as item, s.cost, p.geom <-> st_centroid(box) as d
            from partners p
            join shop_items s on s.partner_id = p.id
            where p.geom && box
            order by d
            limit 3) q), '[]'::jsonb),
    'n', jsonb_build_object(
      'hz', (select count(*) from reports
             where kind = 'hazard' and status = 'active'
               and (expires_at is null or expires_at > now()) and geom && box),
      'im', (select count(*) from reports
             where kind = 'improvement' and status <> 'expired' and geom && box)));
end;
$$;

-- New functions start private (migration 13); the app's entry points by name.
revoke execute on function public.partner_seen(text[], text), public.my_items() from public, anon, authenticated;
grant execute on function public.partner_seen(text[], text), public.my_items() to authenticated;
-- create or replace keeps the old grants on shop_buy and map_in_view; restate them.
revoke execute on function public.shop_buy(text) from public, anon;
grant execute on function public.shop_buy(text) to authenticated;
revoke execute on function public.map_in_view(double precision, double precision, double precision, double precision) from public;
grant execute on function public.map_in_view(double precision, double precision, double precision, double precision) to anon, authenticated;
