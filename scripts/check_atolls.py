#!/usr/bin/env python3
"""Read-only QA for data/maldives-atolls.geojson.

For each atoll: reports island count, bbox, centroid, and whether every
island assigned to it (per the same nearest-seed logic as build_atolls.py)
actually falls inside its polygon. Also flags any pair of atoll polygons
whose vertices cross into each other (a proxy for real overlap, not just
overlapping bounding boxes).

Usage: python3 scripts/check_atolls.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ISLANDS_PATH = os.path.join(ROOT, "data", "maldives-islands.geojson")
ATOLLS_PATH = os.path.join(ROOT, "data", "maldives-atolls.geojson")

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_atolls import SEEDS, override_name, nearest_seed, centroid, load_islands  # noqa: E402


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-15) + x1):
            inside = not inside
    return inside


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def bbox_overlap(a, b):
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def main():
    with open(ATOLLS_PATH) as f:
        atolls = json.load(f)["features"]
    polys = {f["properties"]["name"]: f["geometry"] for f in atolls}

    # Reconstruct island -> atoll assignment the same way build_atolls.py did.
    islands = load_islands()
    assigned = {name: [] for name in polys}
    for poly in islands:
        ring = poly[0]
        cx, cy = centroid(ring)
        nearest = nearest_seed(cx, cy)
        name = override_name(cx, cy, nearest)
        if name in assigned:
            assigned[name].append((cx, cy))

    print(f"{'atoll':14s} {'islands':>7s} {'contained':>9s} {'outside':>7s}  bbox")
    any_bad = False
    for name, geom in polys.items():
        ring = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
        pts = assigned.get(name, [])
        outside = [p for p in pts if not point_in_ring(p[0], p[1], ring)]
        b = bbox(ring)
        flag = " <-- islands outside polygon" if outside else ""
        if outside:
            any_bad = True
        print(f"{name:14s} {len(pts):7d} {len(pts) - len(outside):9d} {len(outside):7d}  "
              f"lon[{b[0]:.3f},{b[2]:.3f}] lat[{b[1]:.3f},{b[3]:.3f}]{flag}")

    print("\nPairwise overlap check:")
    names = list(polys.keys())
    found_overlap = False
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            na, nb = names[i], names[j]
            ga, gb = polys[na], polys[nb]
            ra = ga["coordinates"][0] if ga["type"] == "Polygon" else ga["coordinates"][0][0]
            rb = gb["coordinates"][0] if gb["type"] == "Polygon" else gb["coordinates"][0][0]
            if not bbox_overlap(bbox(ra), bbox(rb)):
                continue
            cross = any(point_in_ring(x, y, rb) for x, y in ra) or \
                    any(point_in_ring(x, y, ra) for x, y in rb)
            if cross:
                found_overlap = True
                print(f"  OVERLAP: {na} <-> {nb}")
    if not found_overlap:
        print("  none found")

    print("\n" + ("FAIL: some islands fall outside their atoll polygon" if any_bad else "OK"))


if __name__ == "__main__":
    main()
