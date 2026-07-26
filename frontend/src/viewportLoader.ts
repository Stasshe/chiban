// Lazily loads parcel datasets as the viewport moves, based on zoom + bbox intersection.
import type { Map as MapLibreMap } from "maplibre-gl";
import { MIN_ZOOM_FOR_PARCELS } from "./mapConfig";
import { entriesInViewport } from "./dataIndex";
import { isEntryLoaded, loadParcelEntry } from "./parcelLayers";
import type { BBox, DataIndex } from "./types";

function currentViewportBBox(map: MapLibreMap): BBox {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

/** Loads any public/approximate entries (i.e. ones with a usable bbox) that intersect the current viewport and aren't loaded yet. */
async function loadVisibleEntries(map: MapLibreMap, index: DataIndex): Promise<void> {
  if (map.getZoom() < MIN_ZOOM_FOR_PARCELS) {
    return;
  }
  const displayableEntries = index.entries.filter(
    (entry) => entry.coordinateSystem === "public" || entry.coordinateSystem === "approximate",
  );
  const viewport = currentViewportBBox(map);
  const visible = entriesInViewport(displayableEntries, viewport);

  await Promise.all(
    visible
      .filter((entry) => !isEntryLoaded(entry.id))
      .map((entry) =>
        loadParcelEntry(map, entry).catch((error: unknown) => {
          console.error(`Failed to load parcel entry ${entry.id}:`, error);
        }),
      ),
  );
}

/** Registers the moveend-driven lazy loader and performs an initial load. */
export function setupViewportLoader(map: MapLibreMap, index: DataIndex): void {
  map.on("moveend", () => {
    void loadVisibleEntries(map, index);
  });
  void loadVisibleEntries(map, index);
}
