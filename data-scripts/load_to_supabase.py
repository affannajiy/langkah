"""
Langkah - load the pilot areas into Supabase
============================================

Reads the outputs of ipoh_extract.py and fills road_segments, amenities and
places, then builds the routing topology and safety scores in Postgres
(guide Sections 7.1, 7.5 and 8).

Usage (inside the data-scripts venv), every pilot area in one run:
    python load_to_supabase.py out/ipoh out/seri-iskandar

Needs DATABASE_URL in data-scripts/.env (see .env.example). Run it again after
each monthly OSM refresh. It replaces all OSM rows and keeps audit rows, so
always pass every area: an area left out is removed from the database.

Why the network comes from area.osm.pbf and not walk-network.geojson:
the GeoJSON is simplified for display, which can drop the shared vertex where
two streets meet. Routing needs exact junctions, so ways are split here at the
OSM nodes they share. Amenities come from amenities.geojson.

Data: (c) OpenStreetMap contributors, ODbL 1.0.
"""
import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

import osmium
import psycopg
from shapely.geometry import LineString, MultiLineString, Polygon

from ipoh_extract import ROAD_TYPES, is_covered, is_walkable, sidewalk_status

PLACE_KEYS = ("amenity", "shop", "tourism", "leisure", "historic", "office", "railway",
              "public_transport", "healthcare", "place", "building")
PLACE_TYPES = {"suburb", "neighbourhood", "quarter", "village", "hamlet", "locality", "town", "city"}
RAILWAY_STOPS = {"station", "halt", "stop"}
ALT_NAME_KEYS = ("name:en", "name:ms", "name:zh", "alt_name", "old_name", "short_name", "official_name")
LIT_YES = {"yes", "24/7", "automatic", "sunset-sunrise", "limited", "interval"}


# --- small helpers --------------------------------------------------------

def load_env(path):
    """Read KEY=VALUE lines without adding a dependency. Real env vars win."""
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def parse_lit(value):
    if value is None:
        return None
    if value in LIT_YES:
        return True
    if value in ("no", "disused"):
        return False
    return None


def parse_maxspeed(value):
    """'60', '60 km/h' -> 60. '30 mph' -> 48. Anything else -> None."""
    if not value:
        return None
    m = re.match(r"^\s*(\d+)\s*(mph)?", value)
    if not m:
        return None
    speed = int(m.group(1))
    return round(speed * 1.609) if m.group(2) else speed


def ewkt_line(coords):
    return "SRID=4326;LINESTRING(" + ",".join(f"{x} {y}" for x, y in coords) + ")"


def ewkt_point(x, y):
    return f"SRID=4326;POINT({x} {y})"


def in_box(x, y, bbox, pad=0.005):
    return bbox[0] - pad <= x <= bbox[2] + pad and bbox[1] - pad <= y <= bbox[3] + pad


# --- read the clipped OSM file --------------------------------------------

class Reader(osmium.SimpleHandler):
    """Collects walkable ways with node ids, and named features for search."""

    def __init__(self, bbox):
        super().__init__()
        self.bbox = bbox
        self.ways = []                       # (osm_id, tags, [(node_id, lon, lat), ...])
        self.places = []                     # dicts
        self.streets = defaultdict(list)     # street name -> [LineString]

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        nodes = []
        for n in w.nodes:
            if not n.location.valid():
                return
            nodes.append((n.ref, n.location.lon, n.location.lat))
        if len(nodes) < 2:
            return
        if is_walkable(tags):
            self.ways.append((w.id, tags, nodes))
            if tags.get("name") and tags.get("highway") in ROAD_TYPES | {"pedestrian"}:
                self.streets[tags["name"]].append(LineString([(x, y) for _, x, y in nodes]))
        self._maybe_place("way", w.id, tags, [(x, y) for _, x, y in nodes])

    def node(self, n):
        if not n.location.valid():
            return
        tags = {t.k: t.v for t in n.tags}
        self._maybe_place("node", n.id, tags, [(n.location.lon, n.location.lat)])

    def _maybe_place(self, osm_type, osm_id, tags, coords):
        name = tags.get("name")
        if not name or tags.get("highway"):
            return
        category = None
        for key in PLACE_KEYS:
            value = tags.get(key)
            if not value or value == "no":
                continue
            if key == "place" and value not in PLACE_TYPES:
                continue
            if key == "railway" and value not in RAILWAY_STOPS:
                continue
            category = f"{key}:{value}"
            break
        if not category:
            return
        if len(coords) == 1:
            x, y = coords[0]
        elif len(coords) >= 4 and coords[0] == coords[-1]:
            p = Polygon(coords).representative_point()
            x, y = p.x, p.y
        else:
            p = LineString(coords).interpolate(0.5, normalized=True)
            x, y = p.x, p.y
        if not in_box(x, y, self.bbox):
            return
        alts = []
        for key in ALT_NAME_KEYS:
            for value in (tags.get(key) or "").split(";"):
                value = value.strip()
                if value and value != name and value not in alts:
                    alts.append(value)
        self.places.append({"osm_type": osm_type, "osm_id": osm_id, "name": name,
                            "alt_names": alts, "category": category, "x": x, "y": y})


def split_ways(ways):
    """Cut each way at nodes shared with another way (or itself), so edges meet at junctions."""
    use = Counter(node_id for _, _, nodes in ways for node_id, _, _ in nodes)
    segments = []
    for osm_id, tags, nodes in ways:
        cut = [i for i, (node_id, _, _) in enumerate(nodes)
               if i == 0 or i == len(nodes) - 1 or use[node_id] > 1]
        for a, b in zip(cut, cut[1:]):
            coords = []
            for _, x, y in nodes[a:b + 1]:
                if not coords or coords[-1] != (x, y):
                    coords.append((x, y))
            if len(coords) >= 2:
                segments.append((osm_id, tags, coords))
    return segments


def street_places(streets, bbox):
    """One search entry per named street, placed at the middle of its longest piece."""
    out = []
    for name, lines in streets.items():
        longest = max(MultiLineString(lines).geoms, key=lambda g: g.length)
        p = longest.interpolate(0.5, normalized=True)
        if in_box(p.x, p.y, bbox):
            out.append({"osm_type": "street", "osm_id": None, "name": name, "alt_names": [],
                        "category": "highway:street", "x": p.x, "y": p.y})
    return out


def dedupe_places(places):
    """Drop repeats of the same name within about 100 m (a shop node inside its building, etc.)."""
    seen, out = set(), []
    for p in places:
        key = (p["name"].lower(), round(p["x"], 3), round(p["y"], 3))
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


# --- write to Postgres ----------------------------------------------------

def load(conn, segments, amenities, places):
    with conn.cursor() as cur:
        cur.execute("set local statement_timeout = '15min'")
        cur.execute("delete from road_segments where data_source = 'osm'")
        cur.execute("delete from amenities where source = 'osm'")
        cur.execute("delete from places")

        with cur.copy("copy road_segments (osm_id, geom, highway, name, sidewalk, footway, lit, crossing, maxspeed, "
                      "covered) from stdin") as cp:
            for osm_id, t, coords in segments:
                cp.write_row((osm_id, ewkt_line(coords), t["highway"], t.get("name"), sidewalk_status(t),
                              t.get("footway") if t.get("footway") in ("sidewalk", "crossing") else None,
                              parse_lit(t.get("lit")), t.get("crossing"), parse_maxspeed(t.get("maxspeed")),
                              is_covered(t)))

        with cur.copy("copy amenities (osm_id, kind, geom, name, tags) from stdin") as cp:
            for f in amenities:
                props = dict(f["properties"])
                x, y = f["geometry"]["coordinates"]
                kind, osm_id, name = props.pop("kind"), props.pop("osm_id", None), props.pop("name", None)
                cp.write_row((osm_id, kind, ewkt_point(x, y), name, json.dumps(props)))

        with cur.copy("copy places (osm_type, osm_id, name, alt_names, category, search_text, geom) from stdin") as cp:
            for p in places:
                search = " ".join([p["name"], *p["alt_names"]]).lower()
                cp.write_row((p["osm_type"], p["osm_id"], p["name"], p["alt_names"], p["category"],
                              search, ewkt_point(p["x"], p["y"])))

        cur.execute("select segments, vertices from public.rebuild_network()")
        seg_count, vertex_count = cur.fetchone()

        # Area label for search results: nearest street, else neighbourhood, else Ipoh.
        cur.execute("select private.label_places()")
        cur.execute("select * from public.network_coverage")
        cols = [d.name for d in cur.description]
        coverage = dict(zip(cols, cur.fetchone()))
    return seg_count, vertex_count, coverage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outs", nargs="+", metavar="out", help="output folder of ipoh_extract.py, one per area")
    a = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, ".env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is missing. Copy .env.example to .env and fill it in.")

    print("1/3 Reading the clipped OSM files...")
    segments, amenities, places, seen_ways = [], [], [], set()
    for out in a.outs:
        pbf = os.path.join(out, "area.osm.pbf")
        amen_path = os.path.join(out, "amenities.geojson")
        area_path = os.path.join(out, "area.json")
        for path in (pbf, amen_path, area_path):
            if not os.path.exists(path):
                sys.exit(f"{path} not found. Run ipoh_extract.py for this area first.")
        with open(area_path, encoding="utf-8") as fh:
            area = json.load(fh)
        bbox = tuple(area["bbox"])
        reader = Reader(bbox)
        reader.apply_file(pbf, locations=True)
        # A way reaching into two boxes is kept once.
        ways = [w for w in reader.ways if w[0] not in seen_ways]
        seen_ways.update(w[0] for w in ways)
        area_segments = split_ways(ways)
        area_places = reader.places + street_places(reader.streets, bbox)
        with open(amen_path, encoding="utf-8") as fh:
            area_amenities = json.load(fh)["features"]
        print(f"    {area['title']}: {len(ways)} ways -> {len(area_segments)} segments, "
              f"{len(area_amenities)} amenities, {len(area_places)} places")
        segments += area_segments
        amenities += area_amenities
        places += area_places
    places = dedupe_places(places)
    kinds = Counter(f["properties"]["kind"] for f in amenities)
    covered = sum(1 for _, t, _ in segments if is_covered(t))
    print("    amenity kinds: " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())))
    print(f"    covered walkway segments: {covered}")

    print("2/3 Loading into Supabase and building the network...")
    with psycopg.connect(url, sslmode="require", connect_timeout=20) as conn:
        seg_count, vertex_count, coverage = load(conn, segments, amenities, places)
        conn.commit()

    print(f"3/3 Done: {seg_count} segments, {vertex_count} junctions.")
    for key, value in coverage.items():
        print(f"    {key}: {value}")


if __name__ == "__main__":
    sys.exit(main())
