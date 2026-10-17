"""
Langkah - partner shop report
=============================

Read-only. Views, taps and redeems per partner shop, for the sales pitch to Ipoh
shops (docs/revenue-plan.md Phase 12; guide Section 15.6).

- view:   the shop's Sponsored pin was on someone's screen (once per user a day)
- tap:    someone opened the pin's sheet (once per user a day)
- redeem: someone spent points on the shop's voucher

Counts only: no user ids, no routes, no times of day (PDPA). Sample counts from
`seed_demo.py --partner-stats` are added in, and a shop whose numbers include
them is marked with *. Use --real to leave them out.

Usage (inside the data-scripts venv):
    python partner_report.py             # last 30 days
    python partner_report.py --days 7
    python partner_report.py --real      # real counts only

Writes out/partner_report_<date>.csv next to the printed table.
Needs DATABASE_URL in data-scripts/.env (see .env.example).
"""
import argparse
import csv
import datetime as dt
import os
import sys

import psycopg

from rating_report import load_env


def pct(part, whole):
    return "-" if not whole else f"{100 * part / whole:.1f}%"


def fetch(conn, days, real):
    """One row per partner: id, name, cost, ends_on, real views, taps, redeems,
    then sample views, taps, redeems (0 when real is set). Malaysian days."""
    return conn.execute(
        """with since as (
             select (now() at time zone 'Asia/Kuala_Lumpur')::date - %(days)s as d),
           ev as (
             select partner_id,
                    sum(n) filter (where kind = 'view' and not demo) as views,
                    sum(n) filter (where kind = 'tap' and not demo) as taps,
                    sum(n) filter (where kind = 'view' and demo) as s_views,
                    sum(n) filter (where kind = 'tap' and demo) as s_taps,
                    sum(n) filter (where kind = 'redeem' and demo) as s_redeems
             from public.partner_events, since
             where day > since.d
             group by partner_id),
           rd as (
             select s.partner_id, count(*) as redeems
             from public.user_items u
             join public.shop_items s on s.id = u.item_id, since
             where s.partner_id is not null
               and (u.created_at at time zone 'Asia/Kuala_Lumpur')::date > since.d
             group by s.partner_id)
           select p.id, p.name, coalesce(s.cost, 0), p.ends_on,
                  coalesce(ev.views, 0), coalesce(ev.taps, 0), coalesce(rd.redeems, 0),
                  case when %(real)s then 0 else coalesce(ev.s_views, 0) end,
                  case when %(real)s then 0 else coalesce(ev.s_taps, 0) end,
                  case when %(real)s then 0 else coalesce(ev.s_redeems, 0) end
           from public.partners p
           left join public.shop_items s on s.partner_id = p.id
           left join ev on ev.partner_id = p.id
           left join rd on rd.partner_id = p.id
           order by p.name""",
        {"days": days, "real": real},
    ).fetchall()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30, help="how many days back (default 30)")
    ap.add_argument("--real", action="store_true", help="leave out the sample counts")
    a = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, ".env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is missing. Copy .env.example to .env and fill it in.")

    with psycopg.connect(url, sslmode="require", connect_timeout=20) as conn:
        conn.read_only = True
        rows = fetch(conn, a.days, a.real)

    if not rows:
        print("No partner shops yet. Apply migration 20261011000014_partners.sql.")
        return 0

    out = []
    for pid, name, cost, ends_on, v, t, r, sv, st, sr in rows:
        views, taps, redeems = v + sv, t + st, r + sr
        out.append({
            "shop": name, "id": pid, "views": views, "taps": taps, "redeems": redeems,
            "tap_rate": pct(taps, views), "redeem_rate": pct(redeems, taps),
            "points_spent": redeems * cost, "ends_on": ends_on.isoformat() if ends_on else "",
            "sample_views": sv, "sample_taps": st, "sample_redeems": sr,
        })

    period = f"last {a.days} days"
    print(f"Partner shops, {period}{' (real counts only)' if a.real else ''}:\n")
    print(f"    {'shop':<24} {'views':>6} {'taps':>5} {'tap %':>6} {'redeems':>7} {'redeem %':>8} {'points':>7}")
    for o in out:
        mark = "*" if o["sample_views"] or o["sample_taps"] or o["sample_redeems"] else " "
        print(f"  {mark} {o['shop']:<24} {o['views']:>6} {o['taps']:>5} {o['tap_rate']:>6} "
              f"{o['redeems']:>7} {o['redeem_rate']:>8} {o['points_spent']:>7}")
    tv, tt, tr = (sum(o[k] for o in out) for k in ("views", "taps", "redeems"))
    print(f"    {'All shops':<24} {tv:>6} {tt:>5} {pct(tt, tv):>6} {tr:>7} {pct(tr, tt):>8} "
          f"{sum(o['points_spent'] for o in out):>7}")
    if any(o["sample_views"] or o["sample_taps"] or o["sample_redeems"] for o in out):
        print("\n  * includes sample counts from seed_demo.py --partner-stats. Run with --real to leave them out.")
    print("\n100 points is about RM1. Views and taps count once per person a day, so panning the map adds nothing.")

    os.makedirs(os.path.join(here, "out"), exist_ok=True)
    path = os.path.join(here, "out", f"partner_report_{dt.date.today():%Y-%m-%d}.csv")
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f"Wrote {os.path.relpath(path, here)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
