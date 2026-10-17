-- Phase 11: mock top-up, mock ads, the points shop (vouchers, cosmetics) and Langkah Plus.
-- Guide Section 15 (Langkah Points) and Section 8 (RLS on every table).
--
-- Rules:
-- - Points still move only through points_add, which stays private.
-- - Top-up is a mock: no bank is contacted. Google or demo accounts only, RM500 a month.
-- - Everyone, guests too, may spend the points they earned.
-- - Plus never sells points and never touches routes, alerts or reports.

-- ---------------------------------------------------------------------------
-- Grants fix. Supabase gives EXECUTE on every new function to anon and
-- authenticated by default, so the Phase 10 helpers (points_add, demo_fill) were
-- callable from the app. Close them, and make new functions private by default:
-- every app entry point is granted by name, as before.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.malaysia_today(),
  public.points_add(uuid, int, text, text, jsonb, timestamptz),
  public.report_street(uuid),
  public.demo_afrina(),
  public.checkin_day(uuid),
  public.demo_fill(uuid),
  public.report_votes_points(),
  public.reports_points()
from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- New ledger reasons: spending in the shop and on Plus.
-- ---------------------------------------------------------------------------
alter table public.point_ledger drop constraint point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in
  ('welcome', 'walk', 'hazard_confirmed', 'improvement_photo', 'vote', 'rating', 'checkin', 'ad', 'topup',
   'voucher', 'cosmetic', 'plus'));

-- Equipped cosmetics and Plus. The app cannot write profiles; the functions below do.
alter table public.profiles
  add column frame text check (char_length(frame) <= 40),
  add column badge text check (char_length(badge) <= 40),
  add column plus_until timestamptz;

-- ---------------------------------------------------------------------------
-- shop_items: what the shop sells and the price. Names and wording live in the
-- app's translation files under shop.item.<id>, so they follow the language.
-- ---------------------------------------------------------------------------
create table public.shop_items (
  id text primary key check (char_length(id) <= 40),
  kind text not null check (kind in ('voucher', 'frame', 'badge')),
  cost int not null check (cost > 0),
  sort int not null default 0,
  active boolean not null default true
);

alter table public.shop_items enable row level security;
revoke all on public.shop_items from anon, authenticated;
grant select on public.shop_items to authenticated;
create policy "Signed-in users read the shop" on public.shop_items
  for select to authenticated using (active);

-- Made-up Ipoh shops until Phase 12 brings real partners. Cosmetics 200 to 800.
insert into public.shop_items (id, kind, cost, sort) values
  ('kopi_kinta', 'voucher', 300, 1),
  ('roti_pak_mat', 'voucher', 450, 2),
  ('tau_fu_fa', 'voucher', 150, 3),
  ('kinta_bookstop', 'voucher', 700, 4),
  ('frame_teal', 'frame', 200, 10),
  ('frame_batik', 'frame', 400, 11),
  ('frame_limestone', 'frame', 800, 12),
  ('badge_early', 'badge', 200, 20),
  ('badge_night', 'badge', 300, 21),
  ('badge_kinta', 'badge', 500, 22);

-- ---------------------------------------------------------------------------
-- user_items: what a user has bought. A voucher row has a code (one row per
-- redeem); a cosmetic is owned once.
-- ---------------------------------------------------------------------------
create table public.user_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.shop_items (id),
  code text check (char_length(code) <= 20),
  created_at timestamptz not null default now()
);

create unique index user_items_cosmetic_once_idx on public.user_items (user_id, item_id) where code is null;
create index user_items_user_idx on public.user_items (user_id, created_at desc);

alter table public.user_items enable row level security;
revoke all on public.user_items from anon, authenticated;
grant select on public.user_items to authenticated;
create policy "Users read their own items" on public.user_items
  for select to authenticated using (user_id = (select auth.uid()));

-- Receipt numbers for mock top-ups. The demo history already uses LGK-0039 and LGK-0042.
create sequence public.topup_ref_seq start 43;
revoke all on sequence public.topup_ref_seq from public, anon, authenticated;

create or replace function public.plus_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.plus_until > now() from public.profiles p where p.id = p_user), false);
$$;

-- Ringgit topped up this Malaysian month.
create or replace function public.topup_month_rm(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((l.meta ->> 'rm')::numeric), 0)
  from public.point_ledger l
  where l.user_id = p_user and l.reason = 'topup'
    and l.created_at >= (date_trunc('month', public.malaysia_today()::timestamp) at time zone 'Asia/Kuala_Lumpur');
$$;

-- ---------------------------------------------------------------------------
-- topup_mock: the receipt step of the mock top-up. The server decides the points.
-- Packs RM5, 10, 20, 50 = 500, 1,100, 2,300, 6,000. Custom RM1 to RM100 = 100 per RM.
-- Returns {points, base, bonus, balance, ref, at}.
-- ---------------------------------------------------------------------------
create or replace function public.topup_mock(p_rm int, p_pack boolean, p_via text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base int;
  v_bonus int := 0;
  v_ref text;
  v_at timestamptz := now();
  v_points int;
begin
  if auth.uid() is null or not public.is_full_user() then
    raise exception 'sign_in_needed' using errcode = '42501';
  end if;
  if p_via is null or p_via not in ('TigerBank', 'BICC Bank', 'PeopleBank', 'RBH Bank', 'Long Hong Bank',
      'BankRakyatku', 'Afnan Bank', 'GnG eWallet', 'Bump', 'GrabbyPay', 'ShopiPay') then
    raise exception 'bad_method' using errcode = '22023';
  end if;

  if p_pack then
    if p_rm not in (5, 10, 20, 50) then
      raise exception 'bad_amount' using errcode = '22023';
    end if;
    v_base := p_rm * 100;
    v_bonus := case p_rm when 10 then 100 when 20 then 300 when 50 then 1000 else 0 end;
  else
    if p_rm is null or p_rm < 1 or p_rm > 100 then
      raise exception 'bad_amount' using errcode = '22023';
    end if;
    v_base := p_rm * 100;
  end if;

  perform pg_advisory_xact_lock(hashtext('points:' || auth.uid()::text));
  if public.topup_month_rm(auth.uid()) + p_rm > 500 then
    raise exception 'month_cap' using errcode = '54000';
  end if;

  v_ref := 'LGK-' || lpad(nextval('public.topup_ref_seq')::text, 4, '0');
  v_points := public.points_add(auth.uid(), v_base + v_bonus, 'topup', v_ref,
    jsonb_build_object('via', p_via, 'rm', to_char(p_rm, 'FM990.00'), 'base', v_base, 'bonus', v_bonus), v_at);

  return jsonb_build_object(
    'points', v_points, 'base', v_base, 'bonus', v_bonus, 'ref', v_ref, 'at', v_at,
    'balance', (select b.balance from public.point_balances b where b.user_id = auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------------
-- ad_finish: +20 when a 30 s mock ad ends, 5 a day (the cap is in points_add).
-- Returns {points, left}.
-- ---------------------------------------------------------------------------
create or replace function public.ads_left(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 5 - count(*))::int
  from public.point_ledger l
  where l.user_id = p_user and l.reason = 'ad'
    and l.created_at >= (public.malaysia_today()::timestamp at time zone 'Asia/Kuala_Lumpur');
$$;

create or replace function public.ad_finish(p_brand text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_points int;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_brand is null or p_brand not in ('gfc', 'mcg', 'tealove', 'zas', 'secret', 'newtown') then
    raise exception 'bad_brand' using errcode = '22023';
  end if;
  v_points := public.points_add(auth.uid(), 20, 'ad', null, jsonb_build_object('brand', p_brand));
  return jsonb_build_object('points', v_points, 'left', public.ads_left(auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------------
-- shop_buy: spend points on a voucher (a new code each time) or a cosmetic (once).
-- Returns {id, item, code, balance}. Errors: no_item, owned, not_enough.
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
    jsonb_build_object('item', p_item));

  return jsonb_build_object('id', v_id, 'item', p_item, 'code', v_code, 'balance', v_balance - v_item.cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- plus_buy: 690 points for 30 days, added to any time left. No auto-renew.
-- Returns {until, balance}.
-- ---------------------------------------------------------------------------
create or replace function public.plus_buy()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_balance int;
  v_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('points:' || auth.uid()::text));
  v_balance := coalesce((select b.balance from public.point_balances b where b.user_id = auth.uid()), 0);
  if v_balance < 690 then
    raise exception 'not_enough' using errcode = '54000';
  end if;

  insert into public.profiles (id, updated_at) values (auth.uid(), now())
  on conflict (id) do nothing;
  update public.profiles p
    set plus_until = greatest(coalesce(p.plus_until, now()), now()) + interval '30 days', updated_at = now()
    where p.id = auth.uid()
    returning p.plus_until into v_until;

  perform public.points_add(auth.uid(), -690, 'plus', to_char(v_until, 'YYYY-MM-DD"T"HH24:MI:SS'),
    jsonb_build_object('until', v_until));
  return jsonb_build_object('until', v_until, 'balance', v_balance - 690);
end;
$$;

-- ---------------------------------------------------------------------------
-- cosmetic_use: put on (or take off, with null) a frame or badge. Allowed: an
-- owned item of that kind, or the Plus gold frame and Plus badge while Plus is on.
-- ---------------------------------------------------------------------------
create or replace function public.cosmetic_use(p_slot text, p_item text)
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
  if p_slot not in ('frame', 'badge') then
    raise exception 'bad_slot' using errcode = '22023';
  end if;
  if p_item is not null
     and not (p_item = 'plus_' || p_slot and public.plus_active(auth.uid()))
     and not exists (
       select 1 from public.user_items u join public.shop_items s on s.id = u.item_id
       where u.user_id = auth.uid() and u.item_id = p_item and s.kind = p_slot) then
    raise exception 'not_owned' using errcode = '42501';
  end if;

  insert into public.profiles (id, updated_at) values (auth.uid(), now())
  on conflict (id) do nothing;
  if p_slot = 'frame' then
    update public.profiles set frame = p_item, updated_at = now() where id = auth.uid();
  else
    update public.profiles set badge = p_item, updated_at = now() where id = auth.uid();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_wallet gains: ads left today, RM left to top up this month, Plus end,
-- and the equipped frame and badge (the Plus ones drop off when Plus ends).
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
    'demo', coalesce(p.is_demo, false),
    'name', case when p.is_demo then p.display_name end,
    'code', p.user_code,
    'ads_left', public.ads_left(auth.uid()),
    'topup_left', 500 - public.topup_month_rm(auth.uid()),
    'plus_until', case when p.plus_until > now() then p.plus_until end,
    'frame', case when p.frame like 'plus\_%' and not coalesce(p.plus_until > now(), false) then null else p.frame end,
    'badge', case when p.badge like 'plus\_%' and not coalesce(p.plus_until > now(), false) then null else p.badge end)
  from (select auth.uid() as uid) me
  left join public.profiles p on p.id = me.uid
  where me.uid is not null;
$$;

-- ---------------------------------------------------------------------------
-- Reset demo also clears what the demo bought. The Phase 10 filler keeps its job
-- under a new name; demo_start and demo_reset call demo_fill by name, so they
-- pick up this one.
-- ---------------------------------------------------------------------------
alter function public.demo_fill(uuid) rename to demo_fill_base;

create or replace function public.demo_fill(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.user_items where user_id = p_user;
  update public.profiles set frame = null, badge = null, plus_until = null where id = p_user;
  perform public.demo_fill_base(p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Helpers stay private; app entry points are listed by name.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.demo_fill_base(uuid),
  public.demo_fill(uuid),
  public.plus_active(uuid),
  public.topup_month_rm(uuid),
  public.ads_left(uuid),
  public.topup_mock(int, boolean, text),
  public.ad_finish(text),
  public.shop_buy(text),
  public.plus_buy(),
  public.cosmetic_use(text, text),
  public.my_wallet()
from public, anon, authenticated;

grant execute on function
  public.topup_mock(int, boolean, text),
  public.ad_finish(text),
  public.shop_buy(text),
  public.plus_buy(),
  public.cosmetic_use(text, text),
  public.my_wallet()
to authenticated;
