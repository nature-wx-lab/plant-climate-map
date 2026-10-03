#!/usr/bin/env python3
"""Extract display-only country labels and regional membership from Natural Earth."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = "5fed433373581fa648920435f937d95f2d3c0200e067409c6478dcdf1b853139"
REGIONS = [
    ("europe", "ヨーロッパ・ロシア", "#654ba3", [22, 53], ["Northern Europe", "Southern Europe", "Eastern Europe", "Western Europe"]),
    ("north-america", "北アメリカ", "#2b619d", [-105, 53], ["Northern America"]),
    ("central-america", "中央アメリカ", "#aa542b", [-99, 22], ["Central America"]),
    ("caribbean", "カリブ海地域", "#88499c", [-73, 19], ["Caribbean"]),
    ("south-america", "南アメリカ", "#28784a", [-61, -15], ["South America"]),
    ("north-africa", "北アフリカ", "#aa542b", [15, 27], ["Northern Africa"]),
    ("west-africa", "西アフリカ", "#654ba3", [-3, 12], ["Western Africa"]),
    ("central-africa", "中央アフリカ", "#2b619d", [20, 0], ["Middle Africa"]),
    ("east-africa", "東アフリカ", "#aa542b", [38, 2], ["Eastern Africa"]),
    ("south-africa", "南部アフリカ", "#28784a", [24, -26], ["Southern Africa"]),
    ("west-asia", "西アジア", "#28784a", [44, 30], ["Western Asia"]),
    ("central-asia", "中央アジア", "#aa542b", [64, 43], ["Central Asia"]),
    ("south-asia", "南アジア", "#654ba3", [77, 23], ["Southern Asia"]),
    ("east-asia", "東アジア", "#2b619d", [112, 39], ["Eastern Asia"]),
    ("southeast-asia", "東南アジア", "#28784a", [109, 9], ["South-Eastern Asia"]),
    ("oceania", "オセアニア", "#88499c", [137, -24], ["Australia and New Zealand", "Melanesia", "Micronesia", "Polynesia"]),
    ("antarctica", "南極", "#2b619d", [30, -79], ["Antarctica"]),
    ("ocean-islands", "その他の島々", "#526f68", [69, -49], ["Seven seas (open ocean)"]),
]


def records(raw):
    count = int.from_bytes(raw[4:8], "little")
    header = int.from_bytes(raw[8:10], "little")
    size = int.from_bytes(raw[10:12], "little")
    fields = [(raw[i:i+11].split(b"\0")[0].decode(), raw[i+16]) for i in range(32, header-1, 32)]
    for i in range(count):
        data = raw[header+i*size:header+(i+1)*size]
        if data[0] == ord("*"):
            continue
        row, offset = {}, 1
        for name, length in fields:
            row[name] = data[offset:offset+length].decode("utf-8").strip("\0 ")
            offset += length
        yield row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--countries-zip", required=True, type=Path)
    args = parser.parse_args()
    source = args.countries_zip.read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise SystemExit("Natural Earth 5.1.1 source checksum mismatch")
    with zipfile.ZipFile(args.countries_zip) as archive:
        rows = list(records(archive.read("ne_50m_admin_0_countries.dbf")))
    mapping = {subregion: ident for ident, _, _, _, subs in REGIONS for subregion in subs}
    countries = {row["ADM0_A3"]: {
        "point": [round(float(row["LABEL_X"]), 5), round(float(row["LABEL_Y"]), 5)],
        "rank": int(row["LABELRANK"]), "region": mapping[row["SUBREGION"]],
    } for row in rows}
    world = json.loads((ROOT / "data/world-50m.geojson").read_text())
    assert set(countries) == {f["properties"]["code"] for f in world["features"]}
    result = {"schema": 1, "source": {
        "dataset": "Natural Earth 1:50m Admin 0 Countries", "version": "5.1.1",
        "url": "https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip",
        "sha256": SOURCE_SHA256,
        "grouping": "Natural Earth SUBREGION; Europe and Oceania subdivisions combined; whole countries retained",
    }, "countries": countries, "regions": [
        {"id": ident, "name": name, "color": color, "point": point}
        for ident, name, color, point, _ in REGIONS
    ]}
    (ROOT / "data/geography.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"GEOGRAPHY_LABELS_BUILT countries={len(countries)} regions={len(REGIONS)}")


if __name__ == "__main__":
    main()
