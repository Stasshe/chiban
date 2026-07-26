// Adds/manages GeoJSON parcel sources and fill/line layers on the map.
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  buildApproximateFillLayer,
  buildApproximateLineLayer,
  buildParcelFillLayer,
  buildParcelLineLayer,
  parcelSourceId,
} from "./mapConfig";
import { resolveEntryUrl } from "./dataIndex";
import type { IndexEntry } from "./types";

/** Ids of entries whose parcel layer has already been added, to prevent duplicate loads. */
const loadedEntryIds = new Set<string>();

/** Parsed GeoJSON keyed by entry id, kept around so search can scan features without re-fetching. */
const loadedFeatureCollections = new Map<string, GeoJSON.FeatureCollection>();

export function isEntryLoaded(entryId: string): boolean {
  return loadedEntryIds.has(entryId);
}

export function getLoadedEntryIds(): ReadonlySet<string> {
  return loadedEntryIds;
}

/** Returns the GeoJSON feature collections that have been loaded onto the map so far. */
export function getLoadedFeatureCollections(): ReadonlyMap<string, GeoJSON.FeatureCollection> {
  return loadedFeatureCollections;
}

/**
 * Fetches the GeoJSON for the given entry and adds it as a source with
 * fill + line layers. No-op if the entry was already loaded.
 */
export async function loadParcelEntry(map: MapLibreMap, entry: IndexEntry): Promise<void> {
  if (loadedEntryIds.has(entry.id)) {
    return;
  }
  loadedEntryIds.add(entry.id);

  const response = await fetch(resolveEntryUrl(entry));
  if (!response.ok) {
    loadedEntryIds.delete(entry.id);
    throw new Error(`Failed to load parcel data "${entry.id}": ${response.status}`);
  }
  const geojson = (await response.json()) as GeoJSON.FeatureCollection;
  loadedFeatureCollections.set(entry.id, geojson);

  const sourceId = parcelSourceId(entry.id);
  if (map.getSource(sourceId)) {
    return;
  }

  map.addSource(sourceId, {
    type: "geojson",
    data: geojson,
  });

  if (entry.coordinateSystem === "approximate") {
    map.addLayer(buildApproximateFillLayer(entry.id));
    map.addLayer(buildApproximateLineLayer(entry.id));
  } else {
    map.addLayer(buildParcelFillLayer(entry.id));
    map.addLayer(buildParcelLineLayer(entry.id));
  }
}
