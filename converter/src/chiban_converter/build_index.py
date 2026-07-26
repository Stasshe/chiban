"""Scans frontend/public/data/geojson and (re)generates index.json.

The "00000_sample" demo entry is not produced by this pipeline, so any
existing sample entry found in the current index.json is preserved as-is
rather than being recomputed or dropped.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SAMPLE_ENTRY_ID = "00000_sample"

Number_ = float
BBox = tuple[Number_, Number_, Number_, Number_]


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


def _build_entry(path: Path, coordinate_system: str) -> dict[str, Any] | None:
    data = json.loads(path.read_text(encoding="utf-8"))
    features = data.get("features", [])
    if not features:
        return None

    stem = path.stem
    city_code, _, city_name = stem.partition("_")
    if not city_name:
        city_name = stem

    bbox = _compute_bbox(features) if coordinate_system in ("public", "approximate") else None

    return {
        "id": stem,
        "cityCode": city_code,
        "cityName": city_name,
        "coordinateSystem": coordinate_system,
        "file": f"geojson/{coordinate_system}/{path.name}",
        "featureCount": len(features),
        "bbox": list(bbox) if bbox is not None else None,
    }


def build_index(out_dir: Path) -> None:
    geojson_root = out_dir / "geojson"
    index_path = out_dir / "index.json"

    preserved_entries: list[dict[str, Any]] = []
    if index_path.exists():
        existing = json.loads(index_path.read_text(encoding="utf-8"))
        preserved_entries = [
            entry for entry in existing.get("entries", []) if entry.get("id") == SAMPLE_ENTRY_ID
        ]

    scanned_entries: list[dict[str, Any]] = []
    for coordinate_system in ("public", "approximate", "arbitrary"):
        directory = geojson_root / coordinate_system
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.geojson")):
            entry = _build_entry(path, coordinate_system)
            if entry is not None and entry["id"] != SAMPLE_ENTRY_ID:
                scanned_entries.append(entry)

    index = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "entries": preserved_entries + scanned_entries,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[index] wrote {index_path} ({len(index['entries'])} entries)")
