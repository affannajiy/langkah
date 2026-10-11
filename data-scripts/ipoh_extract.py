"""
Langkah - Ipoh pedestrian data extractor
========================================

Turns the Geofabrik Malaysia OSM extract into small, app-ready files for the
central Ipoh pilot area, plus a coverage report.

Usage (inside the conda env from the guide):
    python ipoh_extract.py malaysia-singapore-brunei-latest.osm.pbf out

Optional:
    --bbox MIN_LON MIN_LAT MAX_LON MAX_LAT   (default: central Ipoh)

Outputs in the out folder:
    ipoh-central.osm.pbf         clipped raw OSM data (small)
    walk-network.geojson         walkable lines with sidewalk / lit / crossing tags
    amenities.geojson            crossings, bus stops, shelters, street lamps, signals
    coverage-report.md           how complete the data is
    preview.png                  map of sidewalk coverage
Data: (c) OpenStreetMap contributors, ODbL 1.0.
"""
import argparse
import gzip
import json
import os
import sys

import osmium

# Central Ipoh: Old Town, New Town, railway station, Concubine Lane to Ipoh Parade
DEFAULT_BBOX = (101.068, 4.583, 101.100, 4.612)

ROAD_TYPES = {"primary", "primary_link", "secondary", "secondary_link", "tertiary",
              "tertiary_link", "residential", "unclassified", "living_street", "service"}
MAIN_ROADS = {"primary", "primary_link", "secondary", "secondary_link"}
FOOT_TYPES = {"footway", "pedestrian", "path", "steps", "corridor"}
NET_TAGS = ["sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right", "footway",
            "lit", "crossing", "maxspeed", "lanes", "surface", "name"]


def clip(src, dst, bbox):
    """Step 1: keep only objects inside the box (plus the nodes their ways need)."""
    box = osmium.osm.Box(osmium.osm.Location(bbox[0], bbox[1]),
                         osmium.osm.Location(bbox[2], bbox[3]))
    with osmium.BackReferenceWriter(dst, ref_src=src, overwrite=True) as writer:
        for obj in osmium.FileProcessor(src, osmium.osm.NODE | osmium.osm.WAY).with_locations():
            if obj.is_node():
                if obj.location.valid() and box.contains(obj.location) and len(obj.tags):
                    writer.add_node(obj)
            elif obj.is_way():
                if any(n.location.valid() and box.contains(n.location) for n in obj.nodes):
                    writer.add_way(obj)


def sidewalk_status(t):
    """Classify a road line as 'yes', 'no' or 'unknown' for sidewalk."""
    hw = t.get("highway")
    if hw in FOOT_TYPES:
        return "footpath"
    vals = [t.get(k) for k in ("sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right")]
    vals = [v for v in vals if v]
    if not vals:
        return "unknown"
    if any(v in ("both", "left", "right", "yes", "separate") for v in vals):
        return "yes"
    if all(v in ("no", "none") for v in vals):
        return "no"
    return "unknown"


class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.lines, self.points = [], []
        self.geo = osmium.geom.GeoJSONFactory()

    def way(self, w):
        hw = w.tags.get("highway")
        if hw not in ROAD_TYPES and hw not in FOOT_TYPES:
            return
        if w.tags.get("foot") == "no" or hw == "service" and w.tags.get("service") == "parking_aisle":
            return
        try:
            geom = json.loads(self.geo.create_linestring(w))
        except Exception:
            return
        t = {k: w.tags.get(k) for k in NET_TAGS if w.tags.get(k)}
        t["highway"] = hw
        t["osm_id"] = w.id
        t["sidewalk_status"] = sidewalk_status({**t})
        self.lines.append({"type": "Feature", "geometry": geom, "properties": t})

    def node(self, n):
        t = n.tags
        kind = None
        if t.get("highway") == "crossing" or t.get("crossing"):
            kind = "crossing"
        elif t.get("highway") == "bus_stop" or t.get("public_transport") == "platform":
            kind = "bus_stop"
        elif t.get("amenity") == "shelter":
            kind = "shelter"
        elif t.get("highway") == "street_lamp":
            kind = "street_lamp"
        elif t.get("highway") == "traffic_signals":
            kind = "traffic_signals"
        if not kind:
            return
        props = {"kind": kind, "osm_id": n.id}
        for k in ("name", "crossing", "shelter", "bench", "lit", "tactile_paving"):
            if t.get(k):
                props[k] = t.get(k)
        self.points.append({"type": "Feature", "properties": props,
                            "geometry": {"type": "Point", "coordinates": [n.location.lon, n.location.lat]}})


def round_coords(obj, nd=5):
    """5 decimals is about 1 m, plenty for walking and much smaller files."""
    if isinstance(obj, list):
        return [round_coords(o, nd) for o in obj]
    return round(obj, nd) if isinstance(obj, float) else obj


def write_geojson(features, path, simplify_m=1.0):
    from shapely.geometry import shape, mapping
    out = []
    for f in features:
        g = shape(f["geometry"])
        if g.geom_type == "LineString" and simplify_m:
            g = g.simplify(simplify_m / 111_000, preserve_topology=False)
        geom = mapping(g)
        geom = {"type": geom["type"], "coordinates": round_coords(json.loads(json.dumps(geom["coordinates"])))}
        out.append({"type": "Feature", "geometry": geom, "properties": f["properties"]})
    fc = {"type": "FeatureCollection",
          "attribution": "(c) OpenStreetMap contributors, ODbL 1.0", "features": out}
    raw = json.dumps(fc, separators=(",", ":")).encode()
    with open(path, "wb") as fh:
        fh.write(raw)
    return len(raw), len(gzip.compress(raw, 9))


def line_len_m(geom):
    from pyproj import Geod
    from shapely.geometry import shape
    return Geod(ellps="WGS84").geometry_length(shape(geom))


def report(lines, points, sizes, bbox, path):
    from collections import Counter
    road = [f for f in lines if f["properties"]["highway"] in ROAD_TYPES]
    foot = [f for f in lines if f["properties"]["highway"] in FOOT_TYPES]
    L = lambda fs: sum(line_len_m(f["geometry"]) for f in fs) / 1000
    by_status = {s: L([f for f in road if f["properties"]["sidewalk_status"] == s]) for s in ("yes", "no", "unknown")}
    main = [f for f in road if f["properties"]["highway"] in MAIN_ROADS]
    main_known = L([f for f in main if f["properties"]["sidewalk_status"] != "unknown"])
    lit_known = L([f for f in road if "lit" in f["properties"]])
    sw_lines = L([f for f in foot if f["properties"].get("footway") == "sidewalk"])
    kinds = Counter(p["properties"]["kind"] for p in points)
    total_road = sum(by_status.values()) or 1
    pct = lambda x: f"{100 * x / total_road:.0f}%"
    md = [
        "# Central Ipoh pedestrian data coverage", "",
        f"Area (lon/lat box): {bbox}. Data (c) OpenStreetMap contributors, ODbL 1.0.", "",
        "## Streets", "",
        "| Measure | Value |", "|---|---|",
        f"| Road length (km) | {total_road:.1f} |",
        f"| With sidewalk tagged yes | {by_status['yes']:.1f} km ({pct(by_status['yes'])}) |",
        f"| With sidewalk tagged no | {by_status['no']:.1f} km ({pct(by_status['no'])}) |",
        f"| Sidewalk unknown | {by_status['unknown']:.1f} km ({pct(by_status['unknown'])}) |",
        f"| Main roads with any sidewalk info | {main_known:.1f} of {L(main):.1f} km |",
        f"| Roads with lit tag | {lit_known:.1f} km ({pct(lit_known)}) |",
        f"| Separate footpaths (footway, path, pedestrian, steps) | {L(foot):.1f} km |",
        f"| ...of which mapped as separate sidewalks | {sw_lines:.1f} km |", "",
        "## Amenities and safety points", "",
        "| Kind | Count |", "|---|---|",
        *[f"| {k} | {kinds.get(k, 0)} |" for k in ("crossing", "traffic_signals", "bus_stop", "shelter", "street_lamp")], "",
        "## File sizes (what the app would download)", "",
        "| File | Raw | Gzipped |", "|---|---|---|",
        *[f"| {n} | {r / 1024:.0f} KB | {g / 1024:.0f} KB |" for n, (r, g) in sizes.items()], "",
        "Unknown streets get the small 'not yet checked' penalty in the scoring model and are the targets for the Mapillary virtual audit.",
    ]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md))
    return by_status, kinds


def preview(lines, points, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from shapely.geometry import shape
    style = {"yes": ("#009E73", 1.6, "-"), "no": ("#E69F00", 1.6, "-"),
             "unknown": ("#9AA5B1", 0.8, ":"), "footpath": ("#0F2A47", 1.0, "-")}
    fig, ax = plt.subplots(figsize=(9, 9), dpi=150)
    for f in lines:
        c, w, ls = style[f["properties"]["sidewalk_status"]]
        x, y = shape(f["geometry"]).xy
        ax.plot(x, y, color=c, lw=w, ls=ls)
    marks = {"crossing": ("#56B4E9", "s"), "bus_stop": ("#CC79A7", "^"), "street_lamp": ("#F0E442", "o")}
    for k, (c, m) in marks.items():
        pts = [p["geometry"]["coordinates"] for p in points if p["properties"]["kind"] == k]
        if pts:
            ax.scatter(*zip(*pts), s=10, c=c, marker=m, edgecolors="#333", linewidths=0.3, label=k.replace("_", " "), zorder=3)
    for s, (c, w, ls) in style.items():
        ax.plot([], [], color=c, lw=2, ls=ls, label={"yes": "sidewalk: yes", "no": "sidewalk: no",
                                                       "unknown": "sidewalk: unknown", "footpath": "footpath"}[s])
    import math
    lats = [c[1] for f in lines for c in f["geometry"]["coordinates"]] or [0]
    ax.set_aspect(1 / math.cos(math.radians(sum(lats) / len(lats))))
    ax.axis("off")
    ax.legend(loc="lower left", fontsize=8, frameon=True)
    ax.set_title("Central Ipoh: sidewalk data in OpenStreetMap", fontsize=12, color="#0F2A47")
    fig.text(0.99, 0.01, "Data (c) OpenStreetMap contributors, ODbL", ha="right", fontsize=7, color="#555")
    fig.savefig(path, bbox_inches="tight", facecolor="white")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pbf")
    ap.add_argument("out")
    ap.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_BBOX)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    clipped = os.path.join(a.out, "ipoh-central.osm.pbf")
    print("1/4 Clipping to central Ipoh...")
    clip(a.pbf, clipped, a.bbox)
    print("2/4 Extracting walk network and amenities...")
    col = Collector()
    col.apply_file(clipped, locations=True)
    print(f"    {len(col.lines)} lines, {len(col.points)} points")
    print("3/4 Writing compact GeoJSON...")
    sizes = {
        "walk-network.geojson": write_geojson(col.lines, os.path.join(a.out, "walk-network.geojson")),
        "amenities.geojson": write_geojson(col.points, os.path.join(a.out, "amenities.geojson")),
    }
    print("4/4 Coverage report and preview...")
    report(col.lines, col.points, sizes, tuple(a.bbox), os.path.join(a.out, "coverage-report.md"))
    preview(col.lines, col.points, os.path.join(a.out, "preview.png"))
    print("Done. See", a.out)


if __name__ == "__main__":
    sys.exit(main())
