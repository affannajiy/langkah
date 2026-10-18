"""
Langkah - demo reports for testing navigation and Community
===========================================================

The demo crew (Haikal, Lee, Adam and others, who confirm hazards posted by "Try
the demo" accounts) is made by migration 25. This script adds, owned by one demo
account:
- three active hazards on the demo walk from Ipoh Railway Station to Concubine
  Lane (Phase 4: hazard banners, routing around hazards),
- one pending hazard and three improvement requests with upvotes from three demo
  voters (Phase 5: Community tab, status chips, Top ranking, export),
and writes a GPX file of the walk so the Android Emulator can play it back.
Most reports get an example photo from demo-photos/ (Wikimedia Commons, see
demo-photos/CREDITS.md). They are real Malaysian streets but not the Ipoh pins,
so each note says where the photo is from.

Usage (inside the data-scripts venv):
    python seed_demo.py                 # add or refresh the demo reports, write out/demo-walk.gpx
    python seed_demo.py --clear         # remove the demo accounts and everything they posted
    python seed_demo.py --partner-stats # 30 days of sample partner counts for the sales pitch
    python seed_demo.py --clear-partner-stats
    python seed_demo.py --council-stats # 12 weeks of sample reports for the council dashboard
    python seed_demo.py --clear-council-stats

Sample partner counts (Phase 12) have no user and are marked demo, so
partner_report.py can tell them apart from real views, taps and redeems.
Sample council reports (Phase 13) belong to their own sample accounts, so
--clear-council-stats removes them without touching the demo walk or real reports.
They are real reports to the app: open improvements show in Community, and
hazards older than 7 days are expired, so those only show on the dashboard.

Needs DATABASE_URL in data-scripts/.env. Photos also need SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY there (laptop only, never in the app or git); without
them the reports are added without photos. Safe to run again: it replaces the demo
accounts' reports and photos each time. Demo accounts have no password and cannot
sign in. Real reports, votes and photos are never touched. Remove the demo data
before a real launch.
"""
import argparse
import datetime as dt
import json
import math
import os
import random
import sys
import urllib.error
import urllib.request

import psycopg

from load_to_supabase import load_env

DEMO_USER = "6c616e67-6b61-4864-8065-6d6f00000001"
DEMO_EMAIL = "demo@langkah.invalid"
# Three demo voters, so improvements have upvotes from someone other than the reporter.
DEMO_VOTERS = [f"6c616e67-6b61-4864-8065-6d6f0000000{i}" for i in (2, 3, 4)]

# The demo walk (both ends are search results, so testers can pick them in the app).
WALK_FROM = (101.07344, 4.59737)  # Ipoh Railway Station
WALK_TO = (101.07846, 4.59619)    # Concubine Lane

PHOTO_DIR = "demo-photos"
PHOTO_BUCKET = "report-photos"
PHOTO_PREFIX = "demo-"  # demo photo names in the bucket, so --clear finds them

# On the fastest line of the demo walk, about 200 m, 330 m and 580 m from the station.
# (category, lon, lat, note, photo file in demo-photos/ or None)
HAZARDS = [
    ("broken_sidewalk", 101.07488, 4.59689,
     "Demo: broken path edge on Jalan Dato Sagor. Example photo from Johor Bahru.", "broken-sidewalk.jpg"),
    ("unsafe_crossing", 101.07601, 4.59658,
     "Demo: worn crossing lines near the clock tower, cars do not stop. Example photo from Kuala Lumpur.",
     "unsafe-crossing.jpg"),
    ("blocked_path", 101.07794, 4.59634,
     "Demo: stalls block the five-foot way on Lorong Panglima. Example photo from Ampang.", "blocked-path.jpg"),
]

# Pending: shows in Community with "Needs 2 confirmations", but does not change routes.
PENDING_HAZARDS = [
    ("flooding", 101.07807, 4.59498, "Demo: water pools here after rain. Example photo from Sandakan.", "flooding.jpg"),
]

# Improvement requests: (category, lon, lat, note, number of demo upvotes, photo).
# 2 or more upvotes from others makes an improvement active (migration 9).
# Street lights has no photo, so the demo also shows a card without one.
IMPROVEMENTS = [
    ("zebra_crossing", 101.07528, 4.59753, "Demo: people cross here to the station with no crossing", 3, None),
    ("fix_sidewalk", 101.07856, 4.59659,
     "Demo: potholes along the edge fill with water after rain. Example photo from Senai, Johor.", 2, "pothole.jpg"),
    ("street_lights", 101.08164, 4.59709, None, 1, None),
]

# Council dashboard samples (Phase 13): one reporter and 14 voters, apart from the
# demo walk accounts so each set can be removed on its own.
SAMPLE_REPORTER = "6c616e67-6b61-4864-8065-6d6f00000100"
SAMPLE_VOTERS = [f"6c616e67-6b61-4864-8065-6d6f000001{i:02d}" for i in range(1, 15)]
# Busy walking spots in Old Town, New Town and around (lon, lat, weight).
SAMPLE_SPOTS = [
    (101.07360, 4.59720, 5),  # railway station and the padang
    (101.07780, 4.59630, 5),  # Concubine Lane and Jalan Panglima
    (101.07650, 4.59480, 4),  # Jalan Sultan Yusuf
    (101.08050, 4.59760, 4),  # Jalan Sultan Idris Shah, New Town
    (101.08420, 4.59950, 3),  # Jalan Raja Ekram
    (101.08800, 4.60150, 3),  # Greentown
    (101.09050, 4.59600, 2),  # Ipoh Parade
    (101.08250, 4.59200, 2),  # Jalan Sultan Iskandar, Kinta riverside
    (101.07100, 4.60300, 2),  # Jalan Tun Abdul Razak
    (101.09400, 4.61200, 1),  # Ipoh Garden
]
SAMPLE_HAZARD_CATS = [("broken_sidewalk", 5), ("blocked_path", 4), ("unsafe_crossing", 3),
                      ("no_light", 3), ("flooding", 2), ("other", 1)]
SAMPLE_IMPROVEMENT_CATS = [("zebra_crossing", 4), ("fix_sidewalk", 4), ("street_lights", 3),
                           ("shelter", 2), ("kerb_ramp", 2), ("repaint_crossing", 2), ("other", 1)]
# Example photos that fit the request (demo-photos/), on about half of those requests.
SAMPLE_PHOTOS = {
    "fix_sidewalk": ["pothole.jpg", "broken-sidewalk.jpg"],
    "zebra_crossing": ["unsafe-crossing.jpg"],
    "repaint_crossing": ["unsafe-crossing.jpg"],
}
SAMPLE_NOTES = {
    "zebra_crossing": "Sample: people cross here every day with no crossing",
    "fix_sidewalk": "Sample: the path is broken and uneven along this stretch",
    "street_lights": "Sample: very dark here after 8 pm",
    "shelter": "Sample: no shade on this walk, hot by midday",
    "kerb_ramp": "Sample: no ramp, hard with a stroller or wheelchair",
    "repaint_crossing": "Sample: the crossing lines have faded",
}

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


class Storage:
    """Supabase Storage over plain HTTPS (no extra dependency). Service role key: laptop only."""

    def __init__(self, url, key):
        self.base = url.rstrip("/") + "/storage/v1/object"
        self.headers = {"Authorization": f"Bearer {key}", "apikey": key}

    def _send(self, method, path, body, content_type, extra=None):
        req = urllib.request.Request(f"{self.base}/{path}", data=body, method=method,
                                     headers={**self.headers, "Content-Type": content_type, **(extra or {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.read()
        except urllib.error.HTTPError as e:
            sys.exit(f"Storage {method} {path} failed: {e.code} {e.read().decode(errors='replace')}")

    def upload(self, name, data):
        # x-upsert replaces the file, so a rerun keeps the same names.
        self._send("POST", f"{PHOTO_BUCKET}/{name}", data, "image/jpeg", {"x-upsert": "true"})

    def remove(self, names):
        self._send("DELETE", PHOTO_BUCKET, json.dumps({"prefixes": names}).encode(), "application/json")


def storage_from_env():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        print("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set: demo reports get no photos.")
        return None
    return Storage(url, key)


def all_photos():
    rows = [*HAZARDS, *PENDING_HAZARDS, *IMPROVEMENTS]
    return sorted({r[-1] for r in rows if r[-1]})


def upload_photos(storage):
    """Upload demo-photos/ (already 1280 px JPEG at 70%, see CREDITS.md). Returns file -> bucket path."""
    here = os.path.dirname(os.path.abspath(__file__))
    paths, total = {}, 0
    for file in all_photos():
        with open(os.path.join(here, PHOTO_DIR, file), "rb") as fh:
            data = fh.read()
        name = PHOTO_PREFIX + file
        storage.upload(name, data)
        paths[file] = name
        total += len(data)
    print(f"Uploaded {len(paths)} demo photos ({total // 1024} KB in all).")
    return paths


def clear(conn, storage):
    # Deleting the accounts removes their reports and votes too (on delete cascade).
    n = conn.execute("delete from auth.users where id = any(%s)", ([DEMO_USER, *DEMO_VOTERS],)).rowcount
    print(f"Removed {n} demo accounts and everything they posted.")
    if storage:
        storage.remove([PHOTO_PREFIX + f for f in all_photos()])
        print("Removed the demo photos.")


def partner_stats(conn, days=30):
    # Made-up daily views, taps and redeems per partner shop, replacing any old samples.
    conn.execute("delete from public.partner_events where demo")
    partners = [r[0] for r in conn.execute(
        "select id from public.partners order by id").fetchall()]
    rng = random.Random(12)
    today = dt.date.today()
    rows = []
    for i, pid in enumerate(partners):
        base = rng.randint(25, 70)  # some shops sit on busier walks
        for d in range(days):
            day = today - dt.timedelta(days=d + 1)
            weekend = day.weekday() >= 5
            views = max(1, int(base * (1.4 if weekend else 1.0) * rng.uniform(0.7, 1.3)))
            taps = int(views * rng.uniform(0.08, 0.2))
            redeems = int(taps * rng.uniform(0.2, 0.45))
            for kind, n in (("view", views), ("tap", taps), ("redeem", redeems)):
                if n > 0:
                    rows.append((pid, kind, day, n))
    with conn.cursor() as cur:
        cur.executemany(
            "insert into public.partner_events (partner_id, kind, day, n, demo) values (%s, %s, %s, %s, true)",
            rows)
    print(f"Added {len(rows)} sample partner rows for {len(partners)} shops over {days} days (marked demo).")


def council_stats(conn, photos, weeks=12):
    """About 150 backdated reports and their votes by the sample accounts, replacing old samples."""
    conn.execute("delete from auth.users where id = any(%s)", ([SAMPLE_REPORTER, *SAMPLE_VOTERS],))
    add_account(conn, SAMPLE_REPORTER, "sample-reporter@langkah.invalid", "Sample reporter")
    for i, voter in enumerate(SAMPLE_VOTERS, start=1):
        add_account(conn, voter, f"sample-voter{i}@langkah.invalid", f"Sample voter {i}")
    # No demo helper votes on sample hazards.
    conn.execute("set local langkah.no_points = 'on'")

    rng = random.Random(13)
    now = dt.datetime.now(dt.timezone.utc)
    spots = [s for s in SAMPLE_SPOTS for _ in range(s[2])]

    def pick(cats):
        return rng.choice([c for c, w in cats for _ in range(w)])

    def place():
        lon, lat, _ = rng.choice(spots)
        return round(lon + rng.gauss(0, 0.0007), 5), round(lat + rng.gauss(0, 0.0006), 5)

    def when():
        # More reports in recent weeks, as if the app is growing.
        days = weeks * 7 * (1 - math.sqrt(rng.random()))
        return now - dt.timedelta(days=days, hours=rng.uniform(0, 12))

    votes = []  # (report id, voter, vote, time)
    for _ in range(100):
        t = when()
        lon, lat = place()
        rid = add_report_as(conn, SAMPLE_REPORTER, "hazard", pick(SAMPLE_HAZARD_CATS), lon, lat, None)
        confirms = rng.choice([0, 0, 1, 2, 2, 3, 4])
        times = sorted(min(now, t + dt.timedelta(hours=rng.uniform(1, 48))) for _ in range(confirms))
        votes += [(rid, v, "confirm", at) for v, at in zip(rng.sample(SAMPLE_VOTERS, confirms), times)]
        # Status and dates as if the clock had run: 7 days, or 7 after the last Still there.
        expires = (times[-1] if times else t) + dt.timedelta(days=7)
        status = "expired" if expires <= now else ("active" if confirms >= 2 else "pending")
        conn.execute("update public.reports set created_at = %s, expires_at = %s, status = %s where id = %s",
                     (t, expires, status, rid))

    for i in range(50):
        t = when()
        lon, lat = place()
        cat = pick(SAMPLE_IMPROVEMENT_CATS)
        fits = [photos[f] for f in SAMPLE_PHOTOS.get(cat, []) if f in photos]
        photo = fits[i % len(fits)] if fits and i % 2 == 0 else None
        rid = add_report_as(conn, SAMPLE_REPORTER, "improvement", cat, lon, lat,
                            SAMPLE_NOTES.get(cat) if rng.random() < 0.6 else None, photo)
        # Older requests have had longer to collect upvotes.
        age = (now - t).days / (weeks * 7)
        ups = min(len(SAMPLE_VOTERS), int(rng.paretovariate(1.3) * (1 + 4 * age)) - 1 + rng.randint(0, 2))
        hours = max(1.0, (now - t).total_seconds() / 3600)
        votes += [(rid, v, "upvote", t + dt.timedelta(hours=rng.uniform(0, hours)))
                  for v in rng.sample(SAMPLE_VOTERS, ups)]
        conn.execute("update public.reports set created_at = %s, status = %s where id = %s",
                     (t, "active" if ups >= 2 else "pending", rid))

    # Status is set above. The vote triggers would stamp the real clock time and
    # restart the 7 days, so they are off while the backdated votes go in.
    with conn.cursor() as cur:
        cur.execute("alter table public.report_votes disable trigger report_votes_touch")
        cur.execute("alter table public.report_votes disable trigger report_votes_apply")
        cur.execute("alter table public.report_votes disable trigger report_votes_points")
        cur.executemany(
            "insert into public.report_votes (report_id, user_id, vote, created_at) values (%s, %s, %s, %s)",
            votes)
        cur.execute("alter table public.report_votes enable trigger report_votes_points")
        cur.execute("alter table public.report_votes enable trigger report_votes_apply")
        cur.execute("alter table public.report_votes enable trigger report_votes_touch")
    print(f"Added 100 sample hazards and 50 sample improvements over {weeks} weeks, "
          f"with {len(votes)} votes from {len(SAMPLE_VOTERS)} sample voters.")


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


def add_report_as(conn, user_id, kind, category, lon, lat, note, photo_path=None):
    return conn.execute(
        """
        insert into public.reports (user_id, kind, category, geom, note, photo_path)
        values (%s, %s, %s, extensions.st_setsrid(extensions.st_makepoint(%s, %s), 4326), %s, %s)
        returning id
        """,
        (user_id, kind, category, lon, lat, note, photo_path),
    ).fetchone()[0]


def add_report(conn, kind, category, lon, lat, note, photo_path=None, status=None):
    # Status is server-controlled, so only this script (not the app) can set "active".
    # The photo check in the report trigger skips scripts (no signed-in user).
    return conn.execute(
        f"""
        insert into public.reports (user_id, kind, category, geom, note, photo_path{", status" if status else ""})
        values (%s, %s, %s, extensions.st_setsrid(extensions.st_makepoint(%s, %s), 4326), %s, %s{", %s" if status else ""})
        returning id
        """,
        (DEMO_USER, kind, category, lon, lat, note, photo_path, *([status] if status else [])),
    ).fetchone()[0]


def seed(conn, photos):
    add_account(conn, DEMO_USER, DEMO_EMAIL, "Langkah demo")
    for i, voter in enumerate(DEMO_VOTERS, start=1):
        add_account(conn, voter, f"voter{i}@langkah.invalid", f"Demo voter {i}")
    # Votes by the demo voters on other reports go too, so a rerun starts clean.
    conn.execute("delete from public.report_votes where user_id = any(%s)", (DEMO_VOTERS,))
    conn.execute("delete from public.reports where user_id = %s", (DEMO_USER,))

    for category, lon, lat, note, photo in HAZARDS:
        add_report(conn, "hazard", category, lon, lat, note, photos.get(photo), status="active")
    for category, lon, lat, note, photo in PENDING_HAZARDS:
        add_report(conn, "hazard", category, lon, lat, note, photos.get(photo))
    for category, lon, lat, note, upvotes, photo in IMPROVEMENTS:
        report_id = add_report(conn, "improvement", category, lon, lat, note, photos.get(photo))
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
    parser.add_argument("--clear", action="store_true", help="remove the demo accounts, their reports and photos")
    parser.add_argument("--partner-stats", action="store_true", help="add 30 days of sample partner counts (marked demo)")
    parser.add_argument("--clear-partner-stats", action="store_true", help="remove the sample partner counts")
    parser.add_argument("--council-stats", action="store_true",
                        help="add 12 weeks of sample reports for the council dashboard")
    parser.add_argument("--clear-council-stats", action="store_true", help="remove the sample council reports")
    parser.add_argument("--gpx", default=os.path.join("out", "demo-walk.gpx"), help="where to write the demo walk")
    args = parser.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, ".env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    storage = storage_from_env()
    with psycopg.connect(url, sslmode="require") as conn:
        if args.partner_stats:
            partner_stats(conn)
            conn.commit()
            return
        if args.clear_partner_stats:
            n = conn.execute("delete from public.partner_events where demo").rowcount
            conn.commit()
            print(f"Removed {n} sample partner rows.")
            return
        if args.council_stats:
            council_stats(conn, upload_photos(storage) if storage else {})
            conn.commit()
            return
        if args.clear_council_stats:
            n = conn.execute("delete from auth.users where id = any(%s)",
                             ([SAMPLE_REPORTER, *SAMPLE_VOTERS],)).rowcount
            conn.commit()
            print(f"Removed {n} sample accounts and their council reports.")
            return
        if args.clear:
            clear(conn, storage)
            return
        seed(conn, upload_photos(storage) if storage else {})
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
