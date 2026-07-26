// Loading of frontend/public/data/index.json and bbox geometry utilities.
import type { BBox, DataIndex, IndexEntry } from "./types";

/** Fetches and parses the dataset manifest. Throws if the request fails. */
export async function loadDataIndex(): Promise<DataIndex> {
  const response = await fetch("./data/index.json");
  if (!response.ok) {
    throw new Error(`Failed to load data index: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as DataIndex;
}

/** Returns true if two bboxes overlap (touching edges count as overlap). */
export function bboxIntersects(a: BBox, b: BBox): boolean {
  const [aMinLon, aMinLat, aMaxLon, aMaxLat] = a;
  const [bMinLon, bMinLat, bMaxLon, bMaxLat] = b;
  return aMinLon <= bMaxLon && aMaxLon >= bMinLon && aMinLat <= bMaxLat && aMaxLat >= bMinLat;
}

/** Filters index entries down to those whose bbox intersects the given viewport bbox. */
export function entriesInViewport(entries: IndexEntry[], viewport: BBox): IndexEntry[] {
  return entries.filter((entry) => entry.bbox !== null && bboxIntersects(entry.bbox, viewport));
}

/** Resolves an entry's relative `file` path to a fetchable URL under the data directory. */
export function resolveEntryUrl(entry: IndexEntry): string {
  return `./data/${entry.file}`;
}
