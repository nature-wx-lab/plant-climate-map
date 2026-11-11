#!/usr/bin/env python3
"""Build reference points from the catalog's pinned TDWG geographical regions."""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import urllib.request
from pathlib import Path

import numpy as np
from shapely import contains_xy, make_valid
from shapely.geometry import Point, box, shape

from plant_catalog import load_plant_catalog

ROOT = Path(__file__).resolve().parents[1]
JAPAN_REGIONS = {"JAP", "NNS", "OGA", "KZN"}


def polygon_parts(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from polygon_parts(part)


def japan_grid():
    directory = ROOT / "data/japan-1km"
    catalog = json.loads((directory / "catalog.json").read_text())
    codes = np.concatenate([
        np.frombuffer(gzip.decompress((directory / f"map-{prefix}.bin.gz").read_bytes()), dtype="<u4", count=count)
        for prefix, count in catalog["prefixes"].items()
    ])
    latitudes = (codes // 1_000_000 * 80 + codes // 1000 % 10 * 10 + codes // 10 % 10 + 0.5) / 120
    longitudes = 100 + (codes // 10000 % 100 * 80 + codes // 100 % 10 * 10 + codes % 10 + 0.5) / 80
    return longitudes, latitudes


def region_point(geometry, grid=None):
    parts = list(polygon_parts(geometry))
    if not parts:
        return None
    # Select an interior point of the largest land component, adjusting
    # longitude degrees for latitude before comparing component areas.
    part = max(parts, key=lambda p: p.area * math.cos(math.radians(p.centroid.y)))
    target = part.representative_point()
    x_scale = math.cos(math.radians(target.y))

    if grid is not None:
        west, south, east, north = geometry.bounds
        longitudes, latitudes = grid
        mask = (west <= longitudes) & (longitudes <= east) & (south <= latitudes) & (latitudes <= north)
        x, y = longitudes[mask], latitudes[mask]
        mask = contains_xy(geometry, x, y)
        x, y = x[mask], y[mask]
        if not len(x):
            return None
        index = np.argmin(((x - target.x) * x_scale) ** 2 + (y - target.y) ** 2)
        return Point(x[index], y[index])

    x_index = round((target.x + 180) / 0.625)
    y_index = round((target.y + 90) / 0.5)
    candidates = [
        Point(-180 + x * 0.625, -90 + y * 0.5)
        for x in range(max(0, x_index - 2), min(576, x_index + 2) + 1)
        for y in range(max(10, y_index - 2), min(350, y_index + 2) + 1)
    ]
    return min(
        (p for p in candidates if part.contains(p)),
        key=lambda p: ((p.x - target.x) * x_scale) ** 2 + (p.y - target.y) ** 2,
        default=target,
    )


def unit_vector(point):
    lon, lat = map(math.radians, (point.x, point.y))
    return math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)


def build():
    path = ROOT / "data/plants.json"
    catalog = load_plant_catalog(ROOT)
    source = catalog["regionSource"]
    with urllib.request.urlopen(source["url"], timeout=30) as response:
        raw = response.read()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("TDWG source differs from the plant catalog")
    regions = {
        item["properties"]["LEVEL3_COD"]: make_valid(shape(item["geometry"]))
        for item in json.loads(raw)["features"]
    }
    ranges = {tuple(plant["regionCodes"]) for plant in catalog["plants"] if plant["regionCodes"]}
    grid = japan_grid()
    map_extent = box(-180, -85, 180, 85)
    points = {}
    for code in sorted({code for codes in ranges for code in codes}):
        point = region_point(regions[code].intersection(map_extent), grid if code in JAPAN_REGIONS else None)
        if point is not None:
            points[code] = point

    vectors = {code: np.array(unit_vector(point)) for code, point in points.items()}
    representatives = {}
    for codes in sorted(ranges):
        available = [code for code in codes if code in points]
        if not available:
            raise ValueError(f"No climate point for {'-'.join(codes)}")
        # Choose one of the actual region points closest to the mean direction
        # of the range, including for ranges crossing the antimeridian.
        direction = np.sum([vectors[code] for code in available], axis=0)
        code = max(available, key=lambda code: float(vectors[code] @ direction))
        point = points[code]
        representatives["-".join(codes)] = {
            "regionCode": code,
            "longitude": round(point.x, 7),
            "latitude": round(point.y, 7),
        }

    header = json.loads(path.read_text())
    header["regionalRepresentativeLocations"] = representatives
    payload = json.dumps(header, ensure_ascii=False, separators=(",", ":")) + "\n"
    if len(payload.encode()) > 3 * 1024 * 1024:
        raise ValueError("Plant catalog exceeds public size limit")
    path.write_text(payload)
    print(f"Regional reference points: {len(representatives)} ranges across {len(points)} regions")


if __name__ == "__main__":
    build()
