// Fetches administrative-boundary (chome/oaza level) GeoJSON data and adds
// it to the map as line-only sources/layers. Unlike parcel data, this is
// loaded eagerly in full (no viewport-based lazy loading): the dataset is
// town/chome granularity, not parcel granularity, so it stays small even
// across a whole municipality.
import type { Map as MapLibreMap } from "maplibre-gl";
import { boundarySourceId, buildBoundaryLineLayer } from "./mapConfig";
import type { BoundaryIndex, BoundaryIndexEntry } from "./types";

type Position = [number, number];
type CoordinateNode = Position | CoordinateNode[];

function isPosition(node: CoordinateNode): node is Position {
  return typeof node[0] === "number";
}

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

const loadedBoundaryFeatures: GeoJSON.Feature[] = [];

async function loadBoundaryIndex(): Promise<BoundaryIndex> {
  const response = await fetch("./data/boundaries/index.json");
  if (!response.ok) {
    throw new Error(`Failed to load boundary index: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as BoundaryIndex;
}

async function loadBoundaryEntry(map: MapLibreMap, entry: BoundaryIndexEntry): Promise<void> {
  const response = await fetch(`./data/boundaries/${entry.file}`);
  if (!response.ok) {
    throw new Error(`Failed to load boundary data "${entry.cityCode}": ${response.status}`);
  }
  const geojson = (await response.json()) as GeoJSON.FeatureCollection;
  loadedBoundaryFeatures.push(...geojson.features);

  const sourceId = boundarySourceId(entry.cityCode);
  if (map.getSource(sourceId)) {
    return;
  }
  map.addSource(sourceId, {
    type: "geojson",
    data: geojson,
  });
  map.addLayer(buildBoundaryLineLayer(entry.cityCode));
}

/**
 * Fetches the boundary index and every listed municipality's boundary
 * GeoJSON, adding each as a line layer. Resolves once all layers have been
 * added, so callers can rely on boundary layers already being in the style
 * (and thus below) before adding any layers on top of them.
 */
export async function setupBoundaryLayer(map: MapLibreMap): Promise<void> {
  let index: BoundaryIndex;
  try {
    index = await loadBoundaryIndex();
  } catch (error: unknown) {
    console.error("Failed to load boundary index:", error);
    return;
  }

  await Promise.all(
    index.entries.map((entry) =>
      loadBoundaryEntry(map, entry).catch((error: unknown) => {
        console.error(`Failed to load boundary entry ${entry.cityCode}:`, error);
      }),
    ),
  );
}

/**
 * Finds the bbox of the first loaded boundary feature whose city+chome name
 * contains the query substring. Used by search to jump to a chome-level
 * area when no loaded parcel feature matches the query directly.
 */
export function findBoundaryBounds(query: string): [Position, Position] | null {
  for (const feature of loadedBoundaryFeatures) {
    const properties = feature.properties ?? {};
    const cityName = typeof properties.CITY_NAME === "string" ? properties.CITY_NAME : "";
    const chomeName = typeof properties.S_NAME === "string" ? properties.S_NAME : "";
    if (!(cityName + chomeName).includes(query)) {
      continue;
    }
    if (feature.geometry.type === "GeometryCollection") {
      continue;
    }
    const bounds = {
      minLon: Infinity,
      minLat: Infinity,
      maxLon: -Infinity,
      maxLat: -Infinity,
    };
    extendBounds(feature.geometry.coordinates as CoordinateNode, bounds);
    if (!Number.isFinite(bounds.minLon)) {
      continue;
    }
    return [
      [bounds.minLon, bounds.minLat],
      [bounds.maxLon, bounds.maxLat],
    ];
  }
  return null;
}
