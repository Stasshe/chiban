"""Approximate georeferencing for parcels recorded in an arbitrary (任意座標系)
local coordinate system.

mojxml2geojson cannot convert 任意座標系 data to WGS84 because that data has
no survey control point tying its local XY grid to a real-world position.
This module provides a coarse fallback: group parcels by their 大字/丁目
address unit, geocode that address string via the GSI address search API,
and shift every point in the group by the offset between the group's
local-XY centroid and the geocoded point. No rotation or scale correction
is applied, so the result is only accurate to within tens of meters --
enough to show "approximately here" on the map, not for boundary-accurate
work.
"""

from __future__ import annotations

import math
from typing import Any

import requests

_GEOCODE_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch"
_METERS_PER_DEGREE_LAT = 111320.0
_REQUEST_TIMEOUT_SECONDS = 10

APPROXIMATE_PRECISION_LABEL = "概算(自動位置合わせ)"

# (市区町村コード, 大字名, 丁目名, 小字名, 予備名) -- the full 所在 hierarchy
# carried by the source chizu XML, used to group parcels that should share
# a single geocoded anchor point.
GroupKey = tuple[str, str, str, str, str]
LonLat = tuple[float, float]


def _group_key(properties: dict[str, Any]) -> GroupKey:
    return (
        properties.get("市区町村コード") or "",
        properties.get("大字名") or "",
        properties.get("丁目名") or "",
        properties.get("小字名") or "",
        properties.get("予備名") or "",
    )


def _geocode_query(properties: dict[str, Any]) -> str:
    """Builds a best-effort address string for the GSI geocoder.

    The prefecture is not present in the chizu XML hierarchy, so we guess
    "東京都" only when the city name ends in "区" (i.e. a ward, which in
    Japan only exists inside Tokyo's special wards or a few ordinance-
    designated cities -- close enough for this coarse fallback). Otherwise
    we search with just the city/oaza/chome string.
    """
    city_name = properties.get("市区町村名") or ""
    prefecture = "東京都" if city_name.endswith("区") else ""
    oaza = properties.get("大字名") or ""
    chome = properties.get("丁目名") or ""
    return f"{prefecture}{city_name}{oaza}{chome}"


def _geocode(query: str, cache: dict[str, LonLat | None]) -> LonLat | None:
    if query in cache:
        return cache[query]

    result: LonLat | None = None
    try:
        response = requests.get(_GEOCODE_URL, params={"q": query}, timeout=_REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        results = response.json()
        if results:
            lon, lat = results[0]["geometry"]["coordinates"]
            result = (float(lon), float(lat))
    except (requests.RequestException, ValueError, KeyError, IndexError) as error:
        print(f"[georeference] geocoding failed for {query!r}: {error}")

    cache[query] = result
    return result


def _iter_coordinate_rings(geometry: dict[str, Any]) -> list[list[list[float]]]:
    """Returns each ring (list of [x, y] points) in a Polygon/MultiPolygon geometry."""
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])
    if geometry_type == "Polygon":
        return list(coordinates)
    if geometry_type == "MultiPolygon":
        return [ring for polygon in coordinates for ring in polygon]
    return []


def _centroid(features: list[dict[str, Any]]) -> tuple[float, float]:
    """Local-XY centroid of every point across every feature in the group."""
    total_x = 0.0
    total_y = 0.0
    count = 0
    for feature in features:
        geometry = feature.get("geometry") or {}
        for ring in _iter_coordinate_rings(geometry):
            for point in ring:
                total_x += point[0]
                total_y += point[1]
                count += 1
    if count == 0:
        return (0.0, 0.0)
    return (total_x / count, total_y / count)


def _shift_geometry(
    geometry: dict[str, Any],
    centroid_x: float,
    centroid_y: float,
    geocoded_lon: float,
    geocoded_lat: float,
) -> None:
    """Translates local-XY coordinates onto WGS84, in place.

    Plane-rectangular-CS convention: X is north (-> latitude), Y is east
    (-> longitude). GeoJSON coordinate order is [lon, lat], so the axes
    swap on the way out.
    """
    lon_scale = _METERS_PER_DEGREE_LAT * math.cos(math.radians(geocoded_lat))
    for ring in _iter_coordinate_rings(geometry):
        for point in ring:
            local_x, local_y = point[0], point[1]
            point[0] = geocoded_lon + (local_y - centroid_y) / lon_scale
            point[1] = geocoded_lat + (local_x - centroid_x) / _METERS_PER_DEGREE_LAT


def georeference_arbitrary_features(
    features: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Approximately geolocates parcels recorded in a local (任意座標系) grid.

    Features are grouped by their 大字/丁目/小字/予備 address unit, each
    group's local-XY centroid is aligned to a GSI-geocoded point for that
    address, and every coordinate in the group is shifted by the same
    offset (translation only -- no rotation or scale correction).

    Returns (georeferenced_features, still_arbitrary_features). Features
    belong to the same list objects passed in (mutated in place on
    success); features whose group could not be geocoded are returned
    unmodified in the second list.
    """
    groups: dict[GroupKey, list[dict[str, Any]]] = {}
    for feature in features:
        properties = feature.get("properties") or {}
        groups.setdefault(_group_key(properties), []).append(feature)

    geocode_cache: dict[str, LonLat | None] = {}
    georeferenced: list[dict[str, Any]] = []
    still_arbitrary: list[dict[str, Any]] = []
    succeeded_groups = 0

    for group_features in groups.values():
        first_properties = group_features[0].get("properties") or {}
        query = _geocode_query(first_properties)
        geocoded = _geocode(query, geocode_cache) if query else None

        if geocoded is None:
            still_arbitrary.extend(group_features)
            continue

        succeeded_groups += 1
        geocoded_lon, geocoded_lat = geocoded
        centroid_x, centroid_y = _centroid(group_features)
        for feature in group_features:
            geometry = feature.get("geometry")
            if geometry:
                _shift_geometry(geometry, centroid_x, centroid_y, geocoded_lon, geocoded_lat)
            properties = feature.get("properties")
            if properties is None:
                properties = {}
                feature["properties"] = properties
            properties["位置精度"] = APPROXIMATE_PRECISION_LABEL
            georeferenced.append(feature)

    print(f"[georeference] geocoded {succeeded_groups}/{len(groups)} address groups")
    return georeferenced, still_arbitrary
