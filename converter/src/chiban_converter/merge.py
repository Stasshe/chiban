"""Sorts each converted GeoJSON into public (WGS84) vs arbitrary (local
coordinate) output, merging public files by municipality code.

Classification rule: mojxml2geojson emits an explicit top-level "crs"
member only for data it could NOT convert to WGS84 (任意座標系). Files
without a "crs" member are already lon/lat and are safe to merge and
display on the map; files with one are copied through untouched because
each keeps its own, mutually incompatible local origin.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


def merge_all(raw_dir: Path, out_dir: Path) -> None:
    geojson_paths = sorted(raw_dir.glob("*/extracted/**/*.geojson"))
    if not geojson_paths:
        print(f"[merge] no converted GeoJSON found under: {raw_dir}")
        return

    public_dir = out_dir / "geojson" / "public"
    arbitrary_dir = out_dir / "geojson" / "arbitrary"
    public_dir.mkdir(parents=True, exist_ok=True)
    arbitrary_dir.mkdir(parents=True, exist_ok=True)

    public_by_city: dict[tuple[str, str], list[dict[str, Any]]] = {}

    for path in geojson_paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        if "crs" in data:
            dest = arbitrary_dir / path.name
            shutil.copy2(path, dest)
            print(f"[merge] arbitrary -> {dest.name}")
            continue

        features = data.get("features", [])
        if not features:
            continue
        properties = features[0].get("properties", {})
        city_code = properties.get("市区町村コード", "unknown")
        city_name = properties.get("市区町村名", "unknown")
        key = (city_code, city_name)
        public_by_city.setdefault(key, []).extend(features)

    for (city_code, city_name), features in public_by_city.items():
        merged = {"type": "FeatureCollection", "features": features}
        dest = public_dir / f"{city_code}_{city_name}.geojson"
        dest.write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
        print(f"[merge] public -> {dest.name} ({len(features)} features)")
