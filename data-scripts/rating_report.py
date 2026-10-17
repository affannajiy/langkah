"""
Langkah - walk ratings against route scores
===========================================

Read-only. Shows how safe walks felt (the 1 to 5 rating on the arrival screen)
next to the route's safety score, so the Table 9 weights can be tuned
(guide Section 7.1). It also prints the weights in use.

Usage (inside the data-scripts venv):
    python rating_report.py            # every rating
    python rating_report.py --days 7   # only the last 7 days

How to read it:
- A route that scored high but felt unsafe (rating 1 or 2) means a penalty is
  too low, or a danger is not in the data yet.
- A route that scored low but felt safe (rating 4 or 5) means a penalty is too high.
- The correlation should be clearly positive (0.3 or more) once there are
  10 or more ratings. Below 10 ratings, read the single walks, not the numbers.

Ratings hold no route shape and no walking history (PDPA), so the report says
which kind of walk felt wrong, not which street. Pair it with your walk notes.

Needs DATABASE_URL in data-scripts/.env (see .env.example).
"""
import argparse
import os
import sys

import psycopg

# A walk counts as a mismatch when the score and the rating disagree this much.
HIGH_SCORE = 70
LOW_SCORE = 50


def load_env(path):
    """Read KEY=VALUE lines without adding a dependency. Real env vars win."""
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def fmt(value, digits=1):
    return "-" if value is None else f"{value:.{digits}f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=None, help="only ratings from the last N days")
    a = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, ".env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is missing. Copy .env.example to .env and fill it in.")

    since = "now() - make_interval(days => %(days)s)" if a.days else "'-infinity'::timestamptz"
    params = {"days": a.days}

    with psycopg.connect(url, sslmode="require", connect_timeout=20) as conn:
        conn.read_only = True
        cur = conn.cursor()

        print("Weights in use (private.score_weights):")
        try:
            cur.execute("select rule, day, night from private.score_weights order by rule")
            for rule, day, night in cur.fetchall():
                print(f"    {rule:<24} day {day:>4.1f}   night {night:>4.1f}")
        except psycopg.errors.UndefinedTable:
            conn.rollback()
            print("    (table not found: apply migration 20261011000011_score_weights.sql)")

        cur.execute(
            f"""select mode, route_kind, count(*), avg(rating), avg(score), corr(rating, score)
                from public.walk_ratings
                where created_at >= {since}
                group by mode, route_kind
                order by mode, route_kind""",
            params,
        )
        groups = cur.fetchall()

        cur.execute(
            f"""select count(*), avg(rating), avg(score), corr(rating, score)
                from public.walk_ratings where created_at >= {since}""",
            params,
        )
        total, avg_r, avg_s, corr = cur.fetchone()

        cur.execute(
            f"""select created_at, mode, route_kind, rating, score, distance_m
                from public.walk_ratings
                where created_at >= {since}
                  and ((score >= {HIGH_SCORE} and rating <= 2) or (score < {LOW_SCORE} and rating >= 4))
                order by created_at desc
                limit 30""",
            params,
        )
        mismatches = cur.fetchall()

    period = f"last {a.days} days" if a.days else "all time"
    print(f"\nRatings ({period}): {total}")
    if not total:
        print("    No ratings yet. Rate a walk on the arrival screen first.")
        return 0

    print(f"    Felt safe {fmt(avg_r)} / 5, score {fmt(avg_s, 0)} / 100, correlation {fmt(corr, 2)}")
    print("\nBy mode and route:")
    print(f"    {'mode':<6} {'route':<8} {'walks':>5} {'felt':>5} {'score':>6} {'corr':>6}")
    for mode, kind, n, r, s, c in groups:
        print(f"    {mode:<6} {kind:<8} {n:>5} {fmt(r):>5} {fmt(s, 0):>6} {fmt(c, 2):>6}")

    print(f"\nMismatches (score {HIGH_SCORE}+ felt 1-2, or score under {LOW_SCORE} felt 4-5): {len(mismatches)}")
    for at, mode, kind, rating, score, dist in mismatches:
        hint = "penalty too low?" if score is not None and score >= HIGH_SCORE else "penalty too high?"
        print(f"    {at:%d %b %H:%M}  {mode:<5} {kind:<8} felt {rating}  score {score}  {dist or 0} m  -> {hint}")

    if total < 10:
        print("\nUnder 10 ratings: read the single walks above, not the averages.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
