"""
Langkah - demo reports for testing navigation and Community
===========================================================

Adds, owned by one demo account:
- three active hazards on the demo walk from Ipoh Railway Station to Concubine
  Lane (Phase 4: hazard banners, routing around hazards),
- one pending hazard and three improvement requests with upvotes from three demo
  voters (Phase 5: Community tab, status chips, Top ranking, export),
and writes a GPX file of the walk so the Android Emulator can play it back.

Usage (inside the data-scripts venv):
    python seed_demo.py                 # add or refresh the demo reports, write out/demo-walk.gpx
    python seed_demo.py --clear         # remove the demo accounts and everything they posted

Needs DATABASE_URL in data-scripts/.env. Safe to run again: it replaces the demo
accounts' reports each time. Demo accounts have no password and cannot sign in.
Real reports and votes are never touched. Remove the demo data before a real launch.
No photos: Langkah only shows real report photos (CLAUDE.md), and we have none yet.
"""
import argparse
import datetime as dt
import math
import os
import sys

import psycopg

from load_to_supabase import load_env

DEMO_USER = "6c616e67-6b61-4864-8065-6d6f00000001"
DEMO_EMAIL = "demo@langkah.invalid"
# Three demo voters, so improvements have upvotes from someone other than the reporter.
DEMO_VOTERS = [f"6c616e67-6b61-4864-8065-6d6f0000000{i}" for i in (2, 3, 4)]

# The demo walk (both ends are search results, so testers can pick them in the app).
WALK_FROM = (101.07344, 4.59737)  # Ipoh Railway Station
WALK_TO = (101.07846, 4.59619)    # Concubine Lane

# On the fastest line of the demo walk, about 200 m, 330 m and 580 m from the station.
HAZARDS = [
    ("broken_sidewalk", 101.07488, 4.59689, "Demo: cracked slabs on Jalan Dato Sagor"),
    ("unsafe_crossing", 101.07601, 4.59658, "Demo: no gap in traffic near the clock tower"),
    ("blocked_path", 101.07794, 4.59634, "Demo: stalls block Lorong Panglima"),
]

# Pending: shows in Community with "Needs 2 confirmations", but does not change routes.
PENDING_HAZARDS = [
    ("flooding", 101.07807, 4.59498, "Demo: water pools here after rain"),
]

# Improvement requests: (category, lon, lat, note, number of demo upvotes).
# 2 or more upvotes from others makes an improvement active (migration 9).
IMPROVEMENTS = [
    ("zebra_crossing", 101.07528, 4.59753, "Demo: people cross here to the station with no crossing", 3),
    ("fix_sidewalk", 101.07856, 4.59659, "Demo: slabs lifted by tree roots", 2),
    ("street_lights", 101.08164, 4.59709, None, 1),
]

WALK_SPEED = 1.3  # m/s, same as route_safe
GPX_STEP_M = 5.0


def decode_polyline(text, precision=5):
    """Google encoded polyline to [(lon, lat)]."""
    points, index, lat, lon = [], 0, 0, 0
    factor = 10 ** precision
    while index < len(text):
        for coord in range(2):
            shift, result = 0, 0
            while True:
                b = ord(text[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if coord == 0:
                lat += delta
            else:
                lon += delta
        points.append((lon / factor, lat / factor))
    return points


def metres(a, b):
    k = math.cos(math.radians(a[1]))
    return math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320


def write_gpx(points, path):
    """One track point every 5 m at walking speed, so playback looks like a walk."""
    start = dt.datetime(2026, 1, 1, 8, 0, 0, tzinfo=dt.timezone.utc)
    out, t = [], 0.0
    out.append((points[0], t))
    for a, b in zip(points, points[1:]):
        d = metres(a, b)
        n = max(1, int(d // GPX_STEP_M))
        for i in range(1, n + 1):
            f = i / n
            t += d / n / WALK_SPEED
            out.append(((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), t))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        fh.write('<gpx version="1.1" creator="Langkah seed_demo.py" xmlns="http://www.topografix.com/GPX/1/1">\n')
        fh.write("  <trk><name>Langkah demo walk</name><trkseg>\n")
        for (lon, lat), secs in out:
            stamp = (start + dt.timedelta(seconds=secs)).strftime("%Y-%m-%dT%H:%M:%SZ")
            fh.write(f'    <trkpt lat="{lat:.6f}" lon="{lon:.6f}"><time>{stamp}</time></trkpt>\n')
        fh.write("  </trkseg></trk>\n</gpx>\n")
    return len(out), t


def clear(conn):
    # Deleting the accounts removes their reports and votes too (on delete cascade).
    n = conn.execute("delete from auth.users where id = any(%s)", ([DEMO_USER, *DEMO_VOTERS],)).rowcount
    print(f"Removed {n} demo accounts and everything they posted.")


def add_account(conn, user_id, email, name):
    conn.execute(
        """
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                                created_at, updated_at, confirmation_token, recovery_token,
                                email_change_token_new, email_change, is_anonymous)
        values (%s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                '{"provider": "demo"}', %s, now(), now(), '', '', '', '', false)
        on conflict (id) do nothing
        """,
        (user_id, email, f'{{"name": "{name}"}}'),
    )


def add_report(conn, kind, category, lon, lat, note, status=None):
    # Status is server-controlled, so only this script (not the app) can set "active".
    return conn.execute(
        f"""
        insert into public.reports (user_id, kind, category, geom, note{", status" if status else ""})
        values (%s, %s, %s, extensions.st_setsrid(extensions.st_makepoint(%s, %s), 4326), %s{", %s" if status else ""})
        returning id
        """,
        (DEMO_USER, kind, category, lon, lat, note, *([status] if status else [])),
    ).fetchone()[0]


def seed(conn):
    add_account(conn, DEMO_USER, DEMO_EMAIL, "Langkah demo")
    for i, voter in enumerate(DEMO_VOTERS, start=1):
        add_account(conn, voter, f"voter{i}@langkah.invalid", f"Demo voter {i}")
    # Votes by the demo voters on other reports go too, so a rerun starts clean.
    conn.execute("delete from public.report_votes where user_id = any(%s)", (DEMO_VOTERS,))
    conn.execute("delete from public.reports where user_id = %s", (DEMO_USER,))

    for category, lon, lat, note in HAZARDS:
        add_report(conn, "hazard", category, lon, lat, note, status="active")
    for category, lon, lat, note in PENDING_HAZARDS:
        add_report(conn, "hazard", category, lon, lat, note)
    for category, lon, lat, note, upvotes in IMPROVEMENTS:
        report_id = add_report(conn, "improvement", category, lon, lat, note)
        for voter in DEMO_VOTERS[:upvotes]:
            # The vote trigger updates the status, as it would for a real vote.
            conn.execute(
                "insert into public.report_votes (report_id, user_id, vote) values (%s, %s, 'upvote')",
                (report_id, voter),
            )
    print(f"Added {len(HAZARDS)} active hazards (they expire in 7 days; run again to refresh), "
          f"{len(PENDING_HAZARDS)} pending hazard and {len(IMPROVEMENTS)} improvement requests.")


def main():
    parser = argparse.ArgumentParser(description="Add or remove the Langkah demo hazards.")
    parser.add_argument("--clear", action="store_true", help="remove the demo account and its hazards")
    parser.add_argument("--gpx", default=os.path.join("out", "demo-walk.gpx"), help="where to write the demo walk")
    args = parser.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, ".env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    with psycopg.connect(url, sslmode="require") as conn:
        if args.clear:
            clear(conn)
            return
        seed(conn)
        # The fastest line ignores hazards, so it is the walk that passes all three.
        res = conn.execute(
            "select route_safe(%s, %s, %s, %s, 'day')", (*WALK_FROM, *WALK_TO)
        ).fetchone()[0]
        if "error" in res:
            sys.exit(f"route_safe failed: {res['error']}")
        conn.commit()

    points = decode_polyline(res["fastest"]["poly"])
    os.makedirs(os.path.dirname(os.path.abspath(args.gpx)), exist_ok=True)
    n, secs = write_gpx(points, args.gpx)
    print(f"Wrote {args.gpx}: {n} points, {res['fastest']['dist']} m, about {secs / 60:.0f} min at walking speed.")
    print(f"Safest walk now {res['safest']['dist']} m, fastest {res['fastest']['dist']} m"
          f" ({'same line' if res['same'] else 'different lines'}).")


if __name__ == "__main__":
    main()
