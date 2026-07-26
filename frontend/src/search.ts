// Wires up the search box: chiban lookup among loaded features, city-name
// driven forced loading, and address geocoding fallback.
import type { Map as MapLibreMap } from "maplibre-gl";
import { geocodeAddress } from "./addressSearch";
import { MIN_ZOOM_FOR_PARCELS } from "./mapConfig";
import { isEntryLoaded, getLoadedFeatureCollections, loadParcelEntry } from "./parcelLayers";
import type { DataIndex, ParcelProperties } from "./types";

type Position = [number, number];
type CoordinateNode = Position | CoordinateNode[];

function isPosition(node: CoordinateNode): node is Position {
  return typeof node[0] === "number";
}

/** Recursively computes [minLon, minLat, maxLon, maxLat] over nested coordinate arrays. */
function extendBounds(
  node: CoordinateNode,
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
): void {
  if (isPosition(node)) {
    const [lon, lat] = node;
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    return;
  }
  for (const child of node) {
    extendBounds(child, bounds);
  }
}

function geometryBounds(geometry: GeoJSON.Geometry): [Position, Position] | null {
  if (geometry.type === "GeometryCollection") {
    return null;
  }
  const bounds = {
    minLon: Infinity,
    minLat: Infinity,
    maxLon: -Infinity,
    maxLat: -Infinity,
  };
  extendBounds(geometry.coordinates as CoordinateNode, bounds);
  if (!Number.isFinite(bounds.minLon)) {
    return null;
  }
  return [
    [bounds.minLon, bounds.minLat],
    [bounds.maxLon, bounds.maxLat],
  ];
}

/** Finds the first loaded feature whose 地番 property contains the query substring. */
function findLoadedFeatureByChiban(query: string): GeoJSON.Feature | null {
  for (const collection of getLoadedFeatureCollections().values()) {
    for (const feature of collection.features) {
      const properties = (feature.properties ?? {}) as ParcelProperties;
      if (properties.地番 && properties.地番.includes(query)) {
        return feature;
      }
    }
  }
  return null;
}

function zoomToFeature(map: MapLibreMap, feature: GeoJSON.Feature): void {
  const bounds = geometryBounds(feature.geometry);
  if (!bounds) {
    return;
  }
  map.fitBounds(bounds, { padding: 64, maxZoom: 19, duration: 600 });
}

/** Runs the three-stage search flow for a single query string. */
async function runSearch(map: MapLibreMap, index: DataIndex, query: string): Promise<void> {
  const directMatch = findLoadedFeatureByChiban(query);
  if (directMatch) {
    zoomToFeature(map, directMatch);
    return;
  }

  const cityMatches = index.entries.filter(
    (entry) => entry.coordinateSystem === "public" && entry.cityName.includes(query),
  );
  if (cityMatches.length > 0) {
    await Promise.all(
      cityMatches
        .filter((entry) => !isEntryLoaded(entry.id))
        .map((entry) =>
          loadParcelEntry(map, entry).catch((error: unknown) => {
            console.error(`Failed to force-load parcel entry ${entry.id}:`, error);
          }),
        ),
    );
    const matchAfterLoad = findLoadedFeatureByChiban(query);
    if (matchAfterLoad) {
      zoomToFeature(map, matchAfterLoad);
      return;
    }
  }

  try {
    const coordinates = await geocodeAddress(query);
    if (coordinates) {
      map.flyTo({ center: coordinates, zoom: Math.max(map.getZoom(), MIN_ZOOM_FOR_PARCELS) });
    } else {
      console.warn(`No search results for "${query}"`);
    }
  } catch (error) {
    console.error("Address geocoding failed:", error);
  }
}

/** Registers the Enter-key handler on the search input. */
export function setupSearch(map: MapLibreMap, index: DataIndex): void {
  const input = document.querySelector<HTMLInputElement>("#search-input");
  if (!input) {
    return;
  }
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter") {
      return;
    }
    const query = input.value.trim();
    if (!query) {
      return;
    }
    void runSearch(map, index, query);
  });
}
