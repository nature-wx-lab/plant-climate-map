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
    catalog['plants'] = plants
    return catalog
