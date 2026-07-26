// Manages per-group positional offsets for "approximate" (coarsely
// georeferenced) parcel data. Offsets are keyed by the same 所在 hierarchy
// grouping that converter/src/chiban_converter/georeference.py uses
// (市区町村コード + 大字名 + 丁目名 + 小字名 + 予備名), persisted via the
// dev-only /api/offsets endpoint (see vite.config.ts), and applied
// client-side to shift feature geometry before it is shown on the map.
import type { ParcelProperties } from "./types";

export interface Offset {
  dLat: number;
  dLon: number;
}

const ZERO_OFFSET: Offset = { dLat: 0, dLon: 0 };

const offsets = new Map<string, Offset>();

/** Builds the group key. Must match georeference.py's `_group_key`. */
export function groupKeyOf(properties: ParcelProperties): string {
  return [
    properties.市区町村コード ?? "",
    properties.大字名 ?? "",
    properties.丁目名 ?? "",
    properties.小字名 ?? "",
    properties.予備名 ?? "",
  ].join("|");
}

/** Fetches persisted offsets from the dev server and populates the in-memory map. */
export async function loadOffsets(): Promise<void> {
  try {
    const response = await fetch("/api/offsets");
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as Record<string, Offset>;
    offsets.clear();
    for (const [groupKey, offset] of Object.entries(data)) {
      offsets.set(groupKey, offset);
    }
  } catch (error) {
    console.error("Failed to load saved offsets:", error);
  }
}

/** Returns the saved offset for a group, or {dLat: 0, dLon: 0} if none is saved. */
export function getOffset(groupKey: string): Offset {
  return offsets.get(groupKey) ?? ZERO_OFFSET;
}

function shiftPosition(position: GeoJSON.Position, offset: Offset): GeoJSON.Position {
  const [lon, lat, ...rest] = position;
  return [lon + offset.dLon, lat + offset.dLat, ...rest];
}

function shiftRing(ring: GeoJSON.Position[], offset: Offset): GeoJSON.Position[] {
  return ring.map((position) => shiftPosition(position, offset));
}

function shiftGeometry(geometry: GeoJSON.Geometry, offset: Offset): GeoJSON.Geometry {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: geometry.coordinates.map((ring) => shiftRing(ring, offset)) };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => shiftRing(ring, offset))),
    };
  }
  return geometry;
}

/**
 * Returns a new FeatureCollection with every feature's geometry shifted by
 * its group's saved offset. Immutable: the input collection and its
 * features/geometries are never mutated.
 */
export function applyOffsetToFeatureCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((feature) => {
      const properties = (feature.properties ?? {}) as ParcelProperties;
      const offset = getOffset(groupKeyOf(properties));
      if (offset.dLat === 0 && offset.dLon === 0) {
        return feature;
      }
      return { ...feature, geometry: shiftGeometry(feature.geometry, offset) };
    }),
  };
}

/**
 * Adds the given delta to a group's saved offset and persists the result.
 * The in-memory map is updated immediately; if the network save fails, the
 * error is logged but the in-memory (visual) state is left updated so the
 * UI never blocks on the save.
 */
export async function adjustOffset(groupKey: string, dLatDelta: number, dLonDelta: number): Promise<void> {
  const current = getOffset(groupKey);
  const updated: Offset = { dLat: current.dLat + dLatDelta, dLon: current.dLon + dLonDelta };
  offsets.set(groupKey, updated);

  try {
    const response = await fetch("/api/offsets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupKey, dLat: updated.dLat, dLon: updated.dLon }),
    });
    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to persist offset for group "${groupKey}":`, error);
  }
}
