"""Converts e-Stat small-area boundary shapefiles into GeoJSON.

Source: Statistics Bureau of Japan (e-Stat) "small area boundary data"
(2020 census, town/chome level). Each raw/boundaries/<city_code>.zip
contains one shapefile covering every chome in that municipality
(JGD2011 / EPSG:6668, usable as-is).

This is deliberately independent from the parcel (chiban) pipeline in
extract.py/convert.py/merge.py: the data shape, granularity, and source
are unrelated, so sharing that pipeline would only add coupling.
"""

from __future__ import annotations

import json
import subprocess
import zipfile
from pathlib import Path
from typing import Any

BBox = tuple[float, float, float, float]


def _extract_boundary_zip(zip_path: Path) -> Path:
    """Extracts a boundary zip into a sibling extracted/ dir. Idempotent."""
    extracted_dir = zip_path.parent / zip_path.stem / "extracted"
    if extracted_dir.exists():
        print(f"[boundaries] skip extract (already extracted): {zip_path.name}")
        return extracted_dir

    extracted_dir.mkdir(parents=True, exist_ok=True)
    print(f"[boundaries] extract {zip_path.name} -> {extracted_dir}")
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(extracted_dir)
    return extracted_dir


def _find_shapefile(extracted_dir: Path) -> Path | None:
    shp_paths = sorted(extracted_dir.glob("**/*.shp"))
    return shp_paths[0] if shp_paths else None


def _convert_shapefile(shp_path: Path, geojson_path: Path) -> None:
    print(f"[boundaries] convert {shp_path.name} -> {geojson_path.name}")
    geojson_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["ogr2ogr", "-f", "GeoJSON", str(geojson_path), str(shp_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        print(f"[boundaries] FAILED: {shp_path.name}")
        print(result.stderr, end="")


def convert_all_boundaries(raw_dir: Path, out_dir: Path) -> None:
    """Extracts and converts every raw/boundaries/<city_code>.zip into out_dir/boundaries/<city_code>.geojson."""
    boundaries_raw_dir = raw_dir / "boundaries"
    if not boundaries_raw_dir.is_dir():
        print(f"[boundaries] raw dir not found, nothing to do: {boundaries_raw_dir}")
        return

    zip_paths = sorted(boundaries_raw_dir.glob("*.zip"))
    if not zip_paths:
        print(f"[boundaries] no zip files found in: {boundaries_raw_dir}")
        return

    boundaries_out_dir = out_dir / "boundaries"
    for zip_path in zip_paths:
        city_code = zip_path.stem
        geojson_path = boundaries_out_dir / f"{city_code}.geojson"
        if geojson_path.exists():
            print(f"[boundaries] skip (already converted): {geojson_path.name}")
            continue

        extracted_dir = _extract_boundary_zip(zip_path)
        shp_path = _find_shapefile(extracted_dir)
        if shp_path is None:
            print(f"[boundaries] no .shp found under: {extracted_dir}")
            continue
        _convert_shapefile(shp_path, geojson_path)


def _extend_bounds(node: Any, bounds: list[float]) -> None:
    """Recursively walks nested coordinate arrays, updating [minLon, minLat, maxLon, maxLat]."""
    if isinstance(node, (int, float)):
        return
    if node and isinstance(node[0], (int, float)):
        lon, lat = node[0], node[1]
        bounds[0] = min(bounds[0], lon)
        bounds[1] = min(bounds[1], lat)
        bounds[2] = max(bounds[2], lon)
        bounds[3] = max(bounds[3], lat)
        return
    for child in node:
        _extend_bounds(child, bounds)


def _compute_bbox(features: list[dict[str, Any]]) -> BBox | None:
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for feature in features:
        geometry = feature.get("geometry")
        if not geometry:
            continue
        _extend_bounds(geometry.get("coordinates", []), bounds)
    if bounds[0] == float("inf"):
        return None
    return (bounds[0], bounds[1], bounds[2], bounds[3])


def _build_boundary_entry(geojson_path: Path) -> dict[str, Any] | None:
    data = json.loads(geojson_path.read_text(encoding="utf-8"))
    features = data.get("features", [])
    if not features:
        return None

    city_name = features[0].get("properties", {}).get("CITY_NAME", geojson_path.stem)
    bbox = _compute_bbox(features)

    return {
        "cityCode": geojson_path.stem,
        "cityName": city_name,
        "file": geojson_path.name,
        "bbox": list(bbox) if bbox is not None else None,
    }


def build_boundaries_index(out_dir: Path) -> None:
    """Scans out_dir/boundaries/*.geojson and (re)generates out_dir/boundaries/index.json."""
    boundaries_out_dir = out_dir / "boundaries"
    if not boundaries_out_dir.is_dir():
        print(f"[boundaries] out dir not found, nothing to index: {boundaries_out_dir}")
        return

    entries: list[dict[str, Any]] = []
    for geojson_path in sorted(boundaries_out_dir.glob("*.geojson")):
        entry = _build_boundary_entry(geojson_path)
        if entry is not None:
            entries.append(entry)

    index_path = boundaries_out_dir / "index.json"
    index_path.write_text(
        json.dumps({"entries": entries}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[boundaries] wrote {index_path} ({len(entries)} entries)")
