"""
Langkah - payload check against guide Section 7.4
=================================================

Calls the live API the way the app does (public anon key only, gzip on) and
prints how many bytes each kind of request sends to the phone, next to the
budget in Section 7.4. Also checks the demo photo sizes.

Usage (inside the data-scripts venv):
    python check_payload.py

Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from app/.env.
Read-only: it never writes anything.
"""
import gzip
import json
import os
import sys
import urllib.error
import urllib.request

from load_to_supabase import load_env

STATION = (101.07344, 4.59737)       # Ipoh Railway Station
CONCUBINE = (101.07846, 4.59619)     # Concubine Lane (the demo walk)
FAR_END = (101.08900, 4.59600)       # about 2 km east, for the "2 km walk" budget

# About one phone screen at zoom 16 over the old town.
SCREEN = (101.0715, 4.5925, 101.0825, 4.6005)

KB = 1024
# (what, budget in bytes, how the budget is read)
BUDGETS = {
    "route": (1 * KB, "polyline of one route, 2 km walk"),
    "map": (5 * KB, "hazards and amenities for one screen, gzip"),
    "search": (2 * KB, "10 place matches, gzip"),
    "community": (8 * KB, "one page of 30 reports, gzip (no budget in 7.4)"),
    "photo": (400 * KB, "one report photo, 1280 px JPEG at 70%"),
}


def call(base, key, name, args):
    """POST an RPC with gzip, as React Native does. Returns (json, bytes on the wire, bytes unzipped)."""
    req = urllib.request.Request(
        f"{base}/rest/v1/rpc/{name}",
        data=json.dumps(args).encode(),
        method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", "Accept-Encoding": "gzip"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            wire = res.read()
            zipped = res.headers.get("Content-Encoding") == "gzip"
    except urllib.error.HTTPError as e:
        sys.exit(f"{name} failed: {e.code} {e.read().decode(errors='replace')}")
    body = gzip.decompress(wire) if zipped else wire
    return json.loads(body), len(wire), len(body)


def row(what, measured, note=""):
    budget, desc = BUDGETS[what]
    ok = "OK  " if measured <= budget else "OVER"
    print(f"  {ok} {what:<10} {measured:>8,} B  (budget {budget:,} B: {desc}){'  ' + note if note else ''}")
    return measured <= budget


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, "..", "app", ".env"))
    base = os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")
    if not (base and key):
        sys.exit("EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY missing in app/.env.")

    results = []
    print("Section 7.4 payload check (live API, anon key)\n")

    for label, a, b in [("demo walk", STATION, CONCUBINE), ("2 km walk", STATION, FAR_END)]:
        data, wire, raw = call(base, key, "route_safe", {
            "start_lon": a[0], "start_lat": a[1], "end_lon": b[0], "end_lat": b[1], "mode": "day"})
        if "error" in data:
            print(f"  ---- route      {label}: {data['error']}")
            continue
        poly = max(len(data["safest"]["poly"]), len(data["fastest"]["poly"]))
        dist = data["fastest"]["dist"]
        results.append(row("route", poly,
                           f"{label}, {dist} m; whole answer with both routes and steps: {wire:,} B gzip, {raw:,} B raw"))

    data, wire, raw = call(base, key, "map_in_view", {
        "min_lon": SCREEN[0], "min_lat": SCREEN[1], "max_lon": SCREEN[2], "max_lat": SCREEN[3]})
    n = f"{len(data.get('hz', []))} hazards, {len(data.get('am', []))} amenities, {raw:,} B raw"
    results.append(row("map", wire, n))

    data, wire, raw = call(base, key, "search_places", {"q": "jalan", "near_lon": STATION[0], "near_lat": STATION[1]})
    results.append(row("search", wire, f"{len(data)} results, {raw:,} B raw"))

    data, wire, raw = call(base, key, "community_reports", {"p_kind": "hazard", "p_sort": "top"})
    results.append(row("community", wire, f"{len(data.get('items', []))} reports, {raw:,} B raw"))

    photo_dir = os.path.join(here, "demo-photos")
    for f in sorted(os.listdir(photo_dir)):
        if f.endswith(".jpg"):
            results.append(row("photo", os.path.getsize(os.path.join(photo_dir, f)), f))

    print(f"\n{sum(results)} of {len(results)} within budget.")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
