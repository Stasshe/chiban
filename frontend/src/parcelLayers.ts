// Adds/manages GeoJSON parcel sources and fill/line layers on the map.
import { GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import {
  buildApproximateFillLayer,
  buildApproximateLineLayer,
  buildParcelFillLayer,
  buildParcelLineLayer,
  parcelSourceId,
} from "./mapConfig";
import { resolveEntryUrl } from "./dataIndex";
import { applyOffsetToFeatureCollection, groupKeyOf } from "./offsetStore";
import type { IndexEntry, ParcelProperties } from "./types";

/** Ids of entries whose parcel layer has already been added, to prevent duplicate loads. */
const loadedEntryIds = new Set<string>();

/** Index entry keyed by entry id, so coordinateSystem can be looked up later (e.g. for offset refresh). */
const loadedEntries = new Map<string, IndexEntry>();

/** Raw GeoJSON as fetched (before any manual offset is applied), keyed by entry id. */
const baseFeatureCollections = new Map<string, GeoJSON.FeatureCollection>();

/** GeoJSON as currently displayed on the map (offset already applied for approximate entries). */
const loadedFeatureCollections = new Map<string, GeoJSON.FeatureCollection>();

export function isEntryLoaded(entryId: string): boolean {
  return loadedEntryIds.has(entryId);
}

export function getLoadedEntryIds(): ReadonlySet<string> {
  return loadedEntryIds;
}

/** Returns the GeoJSON feature collections currently displayed on the map, keyed by entry id. */
export function getLoadedFeatureCollections(): ReadonlyMap<string, GeoJSON.FeatureCollection> {
  return loadedFeatureCollections;
}

/**
 * Fetches the GeoJSON for the given entry and adds it as a source with
 * fill + line layers. No-op if the entry was already loaded. Approximate
 * entries are shifted by any saved manual offsets before being displayed.
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
  loadedEntries.set(entry.id, entry);
  baseFeatureCollections.set(entry.id, geojson);

  const displayGeojson = entry.coordinateSystem === "approximate" ? applyOffsetToFeatureCollection(geojson) : geojson;
  loadedFeatureCollections.set(entry.id, displayGeojson);

  const sourceId = parcelSourceId(entry.id);
  if (map.getSource(sourceId)) {
    return;
  }

  map.addSource(sourceId, {
    type: "geojson",
    data: displayGeojson,
  });

  if (entry.coordinateSystem === "approximate") {
    map.addLayer(buildApproximateFillLayer(entry.id));
    map.addLayer(buildApproximateLineLayer(entry.id));
  } else {
    map.addLayer(buildParcelFillLayer(entry.id));
    map.addLayer(buildParcelLineLayer(entry.id));
  }
}

/**
 * Re-applies saved offsets to whichever loaded approximate source(s)
 * contain the given group, and pushes the result onto the map with
 * setData for an immediate redraw. Other groups sharing the same source
 * (city-level datasets merge multiple 丁目 groups) are recomputed from
 * their own unaffected offsets, so their positions do not move.
 */
export function refreshOffsetForGroup(map: MapLibreMap, groupKey: string): void {
  for (const [entryId, entry] of loadedEntries) {
    if (entry.coordinateSystem !== "approximate") {
      continue;
    }
    const base = baseFeatureCollections.get(entryId);
    if (!base) {
      continue;
    }
    const containsGroup = base.features.some(
      (feature) => groupKeyOf((feature.properties ?? {}) as ParcelProperties) === groupKey,
    );
    if (!containsGroup) {
      continue;
    }

    const displayed = applyOffsetToFeatureCollection(base);
    loadedFeatureCollections.set(entryId, displayed);

    const source = map.getSource(parcelSourceId(entryId));
    if (source instanceof GeoJSONSource) {
      source.setData(displayed);
    }
  }
}
