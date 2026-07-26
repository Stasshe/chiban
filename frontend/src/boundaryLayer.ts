// Fetches administrative-boundary (chome/oaza level) GeoJSON data and adds
// it to the map as line-only sources/layers. Unlike parcel data, this is
// loaded eagerly in full (no viewport-based lazy loading): the dataset is
// town/chome granularity, not parcel granularity, so it stays small even
// across a whole municipality.
import type { Map as MapLibreMap } from "maplibre-gl";
import { boundarySourceId, buildBoundaryLineLayer } from "./mapConfig";
import type { BoundaryIndex, BoundaryIndexEntry } from "./types";

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
