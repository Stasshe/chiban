"""Sorts each converted GeoJSON into public / approximate / arbitrary output.

Classification rule: mojxml2geojson always emits a top-level "crs" member
(often null, regardless of the source coordinate system), so it cannot be
used to tell public and arbitrary data apart. The reliable signal is each
feature's 座標系 property, which holds either "任意座標系" or a
"公共座標系第N系" string.

- "public" (公共座標系, already WGS84): merged by municipality code.
- "approximate": arbitrary-coordinate parcels that georeference.py managed
  to coarsely align to real-world coordinates; merged by municipality code
  like public data so they can be shown on the map.
- "arbitrary": arbitrary-coordinate parcels whose address could not be
  geocoded, left ungrouped (one output file per source file) since they
  have no reliable position.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .georeference import georeference_arbitrary_features

CityKey = tuple[str, str]


def classify(data: dict[str, Any]) -> str:
    """Classifies a converted GeoJSON FeatureCollection as "public" or "arbitrary".

    Looks at the first feature's 座標系 property; a value containing "任意"
    means arbitrary (local) coordinates, anything else means public
    (already WGS84). Feature-less files default to "public" since there is
    nothing to merge or georeference either way.
    """
    features = data.get("features", [])
    if not features:
        return "public"
    properties = features[0].get("properties") or {}
    coordinate_system = properties.get("座標系") or ""
    return "arbitrary" if "任意" in coordinate_system else "public"


def _city_key(properties: dict[str, Any]) -> CityKey:
    return (properties.get("市区町村コード", "unknown"), properties.get("市区町村名", "unknown"))


def _write_merged_by_city(
    dest_dir: Path, by_city: dict[CityKey, list[dict[str, Any]]], label: str
) -> None:
    for (city_code, city_name), features in by_city.items():
        merged = {"type": "FeatureCollection", "features": features}
        dest = dest_dir / f"{city_code}_{city_name}.geojson"
        dest.write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
        print(f"[merge] {label} -> {dest.name} ({len(features)} features)")


def merge_all(raw_dir: Path, out_dir: Path) -> None:
    geojson_paths = sorted(raw_dir.glob("*/extracted/**/*.geojson"))
    if not geojson_paths:
        print(f"[merge] no converted GeoJSON found under: {raw_dir}")
        return

    public_dir = out_dir / "geojson" / "public"
    approximate_dir = out_dir / "geojson" / "approximate"
    arbitrary_dir = out_dir / "geojson" / "arbitrary"
    for directory in (public_dir, approximate_dir, arbitrary_dir):
        directory.mkdir(parents=True, exist_ok=True)

    public_by_city: dict[CityKey, list[dict[str, Any]]] = {}
    # Kept per source file so leftover (still-arbitrary) features can be
    # written back out grouped by the file they came from.
    arbitrary_by_path: dict[Path, list[dict[str, Any]]] = {}

    for path in geojson_paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        features = data.get("features", [])
        if not features:
            continue

        if classify(data) == "arbitrary":
            arbitrary_by_path[path] = features
            continue

        properties = features[0].get("properties", {})
        public_by_city.setdefault(_city_key(properties), []).extend(features)

    approximate_by_city: dict[CityKey, list[dict[str, Any]]] = {}
    if arbitrary_by_path:
        all_arbitrary_features = [
            feature for features in arbitrary_by_path.values() for feature in features
        ]
        georeferenced, still_arbitrary = georeference_arbitrary_features(all_arbitrary_features)

        for feature in georeferenced:
            properties = feature.get("properties", {})
            approximate_by_city.setdefault(_city_key(properties), []).append(feature)

        still_arbitrary_ids = {id(feature) for feature in still_arbitrary}
        for path, features in arbitrary_by_path.items():
            leftover = [feature for feature in features if id(feature) in still_arbitrary_ids]
            if not leftover:
                continue
            data = {"type": "FeatureCollection", "features": leftover}
            dest = arbitrary_dir / path.name
            dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            print(f"[merge] arbitrary -> {dest.name} ({len(leftover)} features)")

    _write_merged_by_city(public_dir, public_by_city, "public")
    _write_merged_by_city(approximate_dir, approximate_by_city, "approximate")
