"""Read the catalog and its explicitly allowlisted record chunks in order."""
from __future__ import annotations

import json
from pathlib import Path
import re


def plant_catalog_files(root: Path) -> tuple[str, ...]:
    catalog = json.loads((root / 'data/plants.json').read_text())
    if not isinstance(catalog, dict):
        raise ValueError('Invalid main plant catalog')
    names = catalog.get('plantFiles', [])
    if (not isinstance(names, list)
            or any(not isinstance(name, str) or not re.fullmatch(r'plants-(?:[2-9]|[1-9][0-9]+)\.json', name)
                   for name in names) or len(names) != len(set(names))):
        raise ValueError('Invalid plant record chunk filenames')
    return ('data/plants.json',) + tuple('data/' + name for name in names)


def reference_location_files(catalog: dict) -> tuple[str, ...]:
    names = catalog.get('referenceLocationFiles', [])
    if (not isinstance(names, list)
            or names != [f'plant-reference-locations-{number}.json' for number in range(1, len(names) + 1)]):
        raise ValueError('Invalid reference location chunk filenames')
    return tuple('data/' + name for name in names)


def load_reference_locations(root: Path, catalog: dict) -> dict:
    points = catalog.get('referenceLocations', {})
    if not isinstance(points, dict):
        raise ValueError('Invalid documented plant reference location')
    points = points.copy()
    for relative in reference_location_files(catalog):
        chunk = json.loads((root / relative).read_text())
        if (not isinstance(chunk, dict) or chunk.get('schema') != catalog['schema']
                or not isinstance(chunk.get('referenceLocations'), dict)
                or points.keys() & chunk['referenceLocations'].keys()):
            raise ValueError('Invalid or duplicate reference location chunk')
        points.update(chunk['referenceLocations'])
    return points


def load_plant_catalog(root: Path) -> dict:
    files = plant_catalog_files(root)
    catalog = json.loads((root / files[0]).read_text())
    if catalog.get('schema') != 1 or not isinstance(catalog.get('plants'), list):
        raise ValueError('Invalid main plant catalog')
    plants = list(catalog['plants'])
    for relative in files[1:]:
        chunk = json.loads((root / relative).read_text())
        if not isinstance(chunk, dict) or chunk.get('schema') != catalog['schema'] or not isinstance(chunk.get('plants'), list):
            raise ValueError('Invalid plant record chunk')
        plants.extend(chunk['plants'])
    expected = catalog.get('plantCount', len(plants))
    if type(expected) is not int or expected != len(plants):
        raise ValueError('Plant catalog record count mismatch')
    if any(not isinstance(plant, dict) or not isinstance(plant.get('id'), str) or not plant['id'] for plant in plants):
        raise ValueError('Invalid plant catalog record ID')
    if len({plant['id'] for plant in plants}) != len(plants):
        raise ValueError('Duplicate plant catalog record ID')
    by_id = {plant['id']: plant for plant in plants}
    for plant in plants:
        if plant.get('taxonRank') == 'market-name' and (
                plant.get('originKind') != 'unresolved' or plant.get('nativeAreas') != []
                or plant.get('regionCodes') != [] or not plant.get('sourceLabel')
                or plant.get('reference', {}).get('stars', 5) > 2):
            raise ValueError('Market names must not inherit a wild native range')
        related = plant.get('relatedPlantId')
        if related and (related == plant['id'] or not by_id.get(related, {}).get('regionCodes')
                        or not str(plant.get('relatedEvidenceUrl', '')).startswith('https://')):
            raise ValueError('Invalid documented related taxon')
    points = load_reference_locations(root, catalog)
    reference_bases = {
        'market-name': ('species', 'cultivar-origin', 'cultivar-reference'),
        'species': ('native-specimen', 'native-reference', 'cultivar-reference'),
        'cultivar': ('cultivar-origin', 'cultivar-reference'),
        'horticultural-group': ('group-origin', 'group-reference'),
    }
    if any(
        not isinstance(point, dict)
        or point.get('basis') not in reference_bases.get(by_id.get(plant_id, {}).get('taxonRank'), ())
        or type(point.get('latitude')) not in (int, float) or not -85 <= point['latitude'] <= 85
        or type(point.get('longitude')) not in (int, float) or not -180 <= point['longitude'] <= 180
        or not isinstance(point.get('note'), str) or not point['note'].strip()
        or ('placeLabel' in point and (not isinstance(point['placeLabel'], str) or not point['placeLabel'].strip()))
        or any(not isinstance(point.get(key), str) or not point[key].startswith('https://')
               for key in ('sourceUrl', 'evidenceUrl'))
        for plant_id, point in points.items()
    ):
        raise ValueError('Invalid documented plant reference location')
    catalog['plants'] = plants
    catalog['referenceLocations'] = points
    return catalog
