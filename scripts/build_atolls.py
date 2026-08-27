#!/usr/bin/env python3
"""Rebuild data/maldives-atolls.geojson from data/maldives-islands.geojson.

The previous atolls file mixed coarse hand-drawn ocean sectors with single
traced islands standing in for whole atolls, so roughly half the 21 features
were badly mispositioned. This script derives each atoll's extent from the
1295 real island outlines already shipped in maldives-islands.geojson
(geoBoundaries, CC BY 4.0): every island is assigned to the nearest seeded
atoll centre, then a convex hull is drawn around each group and nudged
outward so the ring encloses the reef rim rather than clipping island edges.

Output keeps the same feature shape as the original file
({"properties": {"name": "..."}}) so map.html needs no changes.

Usage: python3 scripts/build_atolls.py
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ISLANDS_PATH = os.path.join(ROOT, "data", "maldives-islands.geojson")
ATOLLS_PATH = os.path.join(ROOT, "data", "maldives-atolls.geojson")

# Approximate administrative-atoll centres (lon, lat), used only to seed
# nearest-centre assignment of islands -- not used as output geometry.
SEEDS = [
    ("Haa Alif", 72.95, 6.95),
    ("Haa Dhaalu", 73.10, 6.65),
    ("Shaviyani", 73.05, 6.30),
    ("Noonu", 73.35, 5.85),
    ("Raa", 72.95, 5.60),
    ("Baa", 73.05, 5.20),
    ("Lhaviyani", 73.55, 5.35),
    ("Malé", 73.50, 4.65),
    ("Kaafu", 73.50, 4.15),
    ("Alif Alif", 72.80, 4.15),
    ("Alif Dhaalu", 72.85, 3.75),
    ("Vaavu", 73.50, 3.50),
    ("Faafu", 72.95, 3.20),
    ("Meemu", 73.50, 2.95),
    ("Dhaalu", 72.95, 2.85),
    ("Thaa", 73.10, 2.35),
    ("Laamu", 73.40, 1.95),
    ("Gaafu Alif", 73.30, 0.70),
    ("Gaafu Dhaalu", 73.20, 0.30),
    ("Addu", 73.15, -0.63),
]

# Islands that fall geographically closer to one seed but administratively
# belong to another (or need a Malé/Kaafu channel split, since a single
# nearest-centre pass can't express a hard latitude boundary).
def override_name(lon, lat, nearest):
    # Makunudhoo group (Haa Dhaalu's westernmost island) sits far southwest
    # of the rest of Haa Dhaalu and is geographically nearer Shaviyani.
    if 72.60 <= lon <= 72.72 and 6.30 <= lat <= 6.42:
        return "Haa Dhaalu"
    # Split the combined Malé-region cluster at the Vaadhoo Kandu channel:
    # north of it is Malé (Kaafu Atoll's northern half, "North Malé" in
    # sightings data), south of it is Kaafu ("South Malé").
    if nearest in ("Malé", "Kaafu"):
        return "Malé" if lat >= 4.30 else "Kaafu"
    return nearest


def load_islands():
    with open(ISLANDS_PATH) as f:
        data = json.load(f)
    geom = data["features"][0]["geometry"]
    assert geom["type"] == "MultiPolygon"
    return geom["coordinates"]  # list of polygons, each [ring, ...]


def centroid(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def nearest_seed(x, y):
    best = min(SEEDS, key=lambda s: (x - s[1]) ** 2 + (y - s[2]) ** 2)
    return best[0]


def convex_hull(points):
    """Andrew's monotone chain. points: list of (x, y). Returns hull ring (CCW, open)."""
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def expand_hull(hull, offset_deg=0.012):
    """Push each hull vertex outward from the hull's centroid so the ring
    encloses island edges (a hull touches them exactly) rather than
    clipping them."""
    cx = sum(p[0] for p in hull) / len(hull)
    cy = sum(p[1] for p in hull) / len(hull)
    out = []
    for x, y in hull:
        dx, dy = x - cx, y - cy
        dist = math.hypot(dx, dy)
        if dist < 1e-9:
            out.append([round(x, 4), round(y, 4)])
            continue
        ux, uy = dx / dist, dy / dist
        out.append([round(x + ux * offset_deg, 4), round(y + uy * offset_deg, 4)])
    out.append(out[0])  # close ring
    return out


def load_original_gnaviyani():
    with open(ATOLLS_PATH) as f:
        data = json.load(f)
    for feat in data["features"]:
        if feat["properties"]["name"] == "Gnaviyani":
            return feat
    raise RuntimeError("Gnaviyani feature not found in existing atolls file")


def main():
    polygons = load_islands()
    groups = {name: [] for name, _, _ in SEEDS}

    for poly in polygons:
        ring = poly[0]
        cx, cy = centroid(ring)
        nearest = nearest_seed(cx, cy)
        name = override_name(cx, cy, nearest)
        groups[name].append(ring)

    features = []
    for name, _, _ in SEEDS:
        rings = groups[name]
        if not rings:
            print(f"WARNING: {name} got no islands, skipping")
            continue
        all_pts = [(p[0], p[1]) for ring in rings for p in ring]
        hull = convex_hull(all_pts)
        ring = expand_hull(hull)
        features.append({
            "type": "Feature",
            "properties": {"name": name},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
        lons = [p[0] for p in all_pts]
        lats = [p[1] for p in all_pts]
        print(f"{name:14s} islands={len(rings):4d}  lat[{min(lats):.3f},{max(lats):.3f}]  lon[{min(lons):.3f},{max(lons):.3f}]")

    # Fuvahmulah (Gnaviyani) isn't present in maldives-islands.geojson;
    # carry the existing correct polygon over verbatim.
    features.append(load_original_gnaviyani())
    print("Gnaviyani      carried over verbatim from existing file")

    out = {"type": "FeatureCollection", "features": features}
    with open(ATOLLS_PATH, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"\nWrote {len(features)} features to {ATOLLS_PATH}")


if __name__ == "__main__":
    main()
