#!/usr/bin/env python3
"""Build an allowlisted Pages payload and checksum manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


CLIMATE_LAYER_FILES = tuple(
    f"data/climate-layers/{key}-{period}.png"
    for key in ("temperature", "precipitation", "humidity", "solar")
    for period in (("annual",) + tuple(f"{month:02d}" for month in range(1, 13)))
)
DEPLOY_FILES = (
    "404.html",
    "app.js",
    "globe.js",
    "geography.js",
    "data/geography.json",
    "vendor/d3-array-3.2.4.min.js",
    "vendor/d3-geo-3.1.1.min.js",
    "vendor/d3-array-LICENSE.txt",
    "vendor/d3-geo-LICENSE.txt",

    "data/koppen-geiger-1991-2020.png",
    "data/world-50m.geojson",
    "data/plants.json",
    "data/plant-outlines.json",
    "index.html",
    "robots.txt",
    "sitemap.xml",
    "styles.css",
    "data/climate-layers/manifest.json",
) + CLIMATE_LAYER_FILES


def japan_files(root: Path) -> tuple[str, ...]:
    catalog = json.loads((root / "data/japan-1km/catalog.json").read_text(encoding="utf-8"))
    prefixes = catalog.get("prefixes", {})
    if (catalog.get("schema") != 1 or catalog.get("cells") != 387717 or catalog.get("days") != 366
            or len(prefixes) != 176 or sum(prefixes.values()) != 387717
            or any(not re.fullmatch(r"\d{4}", prefix) or not isinstance(count, int) or count < 1
                   for prefix, count in prefixes.items())):
        raise SystemExit("invalid public Japan 1 km catalog")
    periods = ("annual",) + tuple(f"{month:02}" for month in range(1, 13))
    files = ["data/japan-1km/catalog.json", "data/japan-1km/overview-mask.png"]
    files += [f"data/japan-1km/overview-{variable}-{period}.png"
              for variable in ("temperature", "precipitation", "solar", "humidity") for period in periods]
    for prefix in prefixes:
        files.append(f"data/japan-1km/map-{prefix}.bin.gz")
        files.append(f"data/japan-1km/map-humidity-{prefix}.bin.gz")
        files += [f"data/japan-1km/daily-{variable}-{prefix}.bin.gz"
                  for variable in ("tmin", "tmean", "tmax", "precip", "solar", "humidity")]
    return tuple(files)


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--destination", type=Path, default=Path("_site"))
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    destination = args.destination.resolve()

    if not re.fullmatch(r"[0-9a-f]{40}", args.source_commit):
        raise SystemExit("source commit must be a full lowercase SHA-1")
    if not root.is_dir() or root.is_symlink():
        raise SystemExit("source root must be a real directory")
    if destination.exists():
        raise SystemExit("destination must not already exist")
    destination.mkdir(parents=True)

    files: dict[str, dict[str, int | str]] = {}
    for relative in DEPLOY_FILES + japan_files(root):
        source = root / relative
        if not source.is_file() or source.is_symlink():
            raise SystemExit(f"invalid deploy source: {relative}")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        raw = target.read_bytes()
        files[relative] = {"bytes": len(raw), "sha256": sha256(raw)}

    manifest = {
        "schema_version": 1,
        "product": "plant-climate-mesh",
        "source_commit": args.source_commit,
        "files": files,
    }
    (destination / "deployment.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"status": "ok", "source_commit": args.source_commit, "files": len(files)}))


if __name__ == "__main__":
    main()
