#!/usr/bin/env python3
"""Union POWO-listed WGSRPD regions into display-only outer rings (Shapely 2)."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from shapely import make_valid, set_precision
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
TOLERANCE = 0.025  # degrees; drawing simplification, never a habitat boundary
CHUNK_BYTES = 2500000


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for child in geometry.geoms:
            yield from polygons(child)


def build(source_path: Path) -> None:
    catalog = json.loads((ROOT / 'data/plants.json').read_text())
    raw = source_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != catalog['regionSource']['sha256']:
        raise ValueError('WGSRPD source checksum differs from catalog')
    features = json.loads(raw)['features']
    regions = {f['properties']['LEVEL3_COD']: set_precision(make_valid(shape(f['geometry'])), 0.0001)
               for f in features}
    filenames = catalog.get('outlineFiles', ['plant-outlines.json', 'plant-outlines-bulbs.json'])
    existing_keys, existing_outlines = {}, {}
    for filename in filenames:
        chunk = json.loads((ROOT / 'data' / filename).read_text())
        if chunk['sourceSha256'] != digest or chunk['simplificationDegrees'] != TOLERANCE:
            raise ValueError('Existing outline source or precision differs')
        if set(existing_keys) & set(chunk['plantKeys']) or set(existing_outlines) & set(chunk['outlines']):
            raise ValueError('Duplicate keys in existing chunks')
        existing_keys.update(chunk['plantKeys'])
        existing_outlines.update(chunk['outlines'])
    if set(existing_keys) - {p['id'] for p in catalog['plants']}:
        raise ValueError('Existing outline references removed catalog entries')
    outlines, plant_keys = {}, {}
    def encoded():
        return (json.dumps({'schema': 1, 'sourceSha256': digest,
                'simplificationDegrees': TOLERANCE, 'plantKeys': plant_keys,
                'outlines': outlines}, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    def flush():
        nonlocal outlines, plant_keys
        if not plant_keys:
            return
        filename = f'plant-outlines-{len(filenames) + 1}.json'
        raw_chunk = encoded()
        if len(raw_chunk) > CHUNK_BYTES:
            raise ValueError('Outline chunk exceeds size limit')
        (ROOT / 'data' / filename).write_bytes(raw_chunk)
        filenames.append(filename)
        existing_keys.update(plant_keys)
        existing_outlines.update(outlines)
        print(f'PLANT_OUTLINES_OK file={filename} plants={len(plant_keys)} geometries={len(outlines)} bytes={len(raw_chunk)}')
        outlines, plant_keys = {}, {}
    for plant in catalog['plants']:
        codes = plant['regionCodes']
        if not codes:
            continue
        key = '-'.join(codes)
        if plant['id'] in existing_keys:
            if existing_keys[plant['id']] != key:
                raise ValueError('Existing plant distribution changed; rebuild explicitly')
            continue
        if key in existing_outlines or key in outlines:
            plant_keys[plant['id']] = key
            continue
        merged = unary_union([regions[code] for code in codes])
        # Exterior rings only: connected regions share one outer line; islands stay separate.
        rings = []
        for polygon in polygons(merged):
            simple = polygon.simplify(TOLERANCE, preserve_topology=True)
            ring = [[round(x, 4), round(y, 4)] for x, y in simple.exterior.coords]
            if len(ring) >= 4:
                rings.append(ring)
        if not rings:
            raise ValueError(f"No outline for {plant['id']}")
        plant_keys[plant['id']] = key
        outlines[key] = {'rings': rings}
        if len(encoded()) > CHUNK_BYTES:
            del plant_keys[plant['id']]
            del outlines[key]
            flush()
            plant_keys[plant['id']] = key
            outlines[key] = {'rings': rings}
    flush()
    catalog['outlineFiles'] = filenames
    (ROOT / 'data/plants.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wgsrpd_geojson', type=Path, help='Pinned TDWG level3.geojson; hash must match catalog')
    build(parser.parse_args().wgsrpd_geojson)
