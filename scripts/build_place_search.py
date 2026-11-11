#!/usr/bin/env python3
"""Build the place search index from Digital Agency ABR and GeoNames exports."""

import argparse
import csv
import io
import json
import re
import unicodedata
import zipfile
from pathlib import Path


def zip_rows(path, filename, delimiter=",", dictionaries=False):
    with zipfile.ZipFile(path) as archive, archive.open(filename) as source:
        stream = io.TextIOWrapper(source, encoding="utf-8-sig", newline="")
        yield from (csv.DictReader(stream) if dictionaries else csv.reader(stream, delimiter=delimiter))


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def aliases(values, primary):
    seen = {search_key(primary)}
    for value in values:
        value = value.strip()
        if not value or re.match(r"^(?:https?://|www\.|Q\d+$)", value):
            continue
        key = search_key(value)
        if key and key not in seen:
            seen.add(key)
            yield value


def search_key(value):
    value = unicodedata.normalize("NFKC", value).lower()
    return "".join(c for c in value if c.isalnum() or unicodedata.category(c).startswith("M"))


def japan_places(folder, date):
    with zipfile.ZipFile(folder / "jp-city-pos.zip") as archive:
        pos_filename = archive.namelist()[0]
    with zipfile.ZipFile(folder / "jp-city.zip") as archive:
        city_filename = archive.namelist()[0]
    positions = {
        row["lg_code"]: [float(row["rep_lat"]), float(row["rep_lon"])]
        for row in zip_rows(folder / "jp-city-pos.zip", pos_filename, dictionaries=True)
        if row["rep_lat"] and row["rep_lon"] and row["rep_srid"] == "EPSG:6668"
    }
    result = []
    for row in zip_rows(folder / "jp-city.zip", city_filename, dictionaries=True):
        code = row["lg_code"]
        if (not row["city"] or code not in positions or row["efct_date"] > date
                or row["ablt_date"] and row["ablt_date"] <= date):
            continue
        parts = ("pref", "county", "city", "ward")
        label = "".join(row[part] for part in parts)
        name = row["ward"] or row["city"]
        kana = "".join(row[part + "_kana"] for part in parts)
        romaji = " ".join(row[part + "_roma"] for part in parts if row[part + "_roma"])
        variants = ",".join(aliases([kana, romaji], label))
        result.append([f"jp-{code}", name, label, *positions[code], variants])
    return result


def world_places(folder):
    countries = {
        row[0]: row[4] for row in csv.reader((folder / "world-country.tsv").read_text().splitlines(), delimiter="\t")
        if row and not row[0].startswith("#")
    }
    regions = {
        row[0]: row[1] for row in csv.reader((folder / "world-admin1.tsv").read_text().splitlines(), delimiter="\t") if row
    }
    result = []
    for row in zip_rows(folder / "world-cities.zip", "cities500.txt", delimiter="\t"):
        identifier, name, ascii_name, alternate_names, lat, lon = row[:6]
        country = row[8]
        if country == "JP" or abs(float(lat)) > 85.05:
            continue
        admin = regions.get(f"{country}.{row[10]}")
        country_name = countries.get(country, country)
        label = " · ".join(dict.fromkeys(part for part in (name, admin, country_name) if part))
        variants = ",".join(aliases([ascii_name, *alternate_names.split(",")], name))
        result.append((int(row[14] or 0), [int(identifier), name, label, float(lat), float(lon), variants]))
    return [row for _, row in sorted(result, key=lambda item: -item[0])]


def write_shards(root, rows):
    max_size = 2_500_000
    names = []
    chunk = []
    size = 3
    for row in rows:
        encoded = json_bytes(row)
        if size + len(encoded) + 1 > max_size:
            names.append(f"place-search-world-{len(names) + 1:02}.json")
            (root / names[-1]).write_bytes(b"[" + b",".join(chunk) + b"]\n")
            chunk.clear()
            size = 3
        chunk.append(encoded)
        size += len(encoded) + 1
    if chunk:
        names.append(f"place-search-world-{len(names) + 1:02}.json")
        (root / names[-1]).write_bytes(b"[" + b",".join(chunk) + b"]\n")
    return names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Directory containing jp-city.zip, jp-city-pos.zip, world-cities.zip, world-country.tsv and world-admin1.tsv")
    parser.add_argument("--date", required=True, help="Japanese administrative dataset effective date (YYYY-MM-DD)")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    args = parser.parse_args()
    japan = japan_places(args.source, args.date)
    world = world_places(args.source)
    shards = write_shards(args.output, world)
    manifest = {"schema": 1, "japan": japan, "worldFiles": shards, "worldCount": len(world)}
    (args.output / "place-search-index.json").write_bytes(json_bytes(manifest) + b"\n")
    print(f"{len(japan)} Japanese municipalities and wards; {len(world)} overseas places in {len(shards)} shards")


if __name__ == "__main__":
    main()
