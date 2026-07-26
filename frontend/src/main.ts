// Composition root: initializes the map and wires all modules together.
// No business logic lives here.
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { GSI_PHOTO_LAYER_ID, GSI_PHOTO_SOURCE, GSI_PHOTO_SOURCE_ID, INITIAL_CENTER, INITIAL_ZOOM } from "./mapConfig";
import { loadDataIndex } from "./dataIndex";
import { setupBoundaryLayer } from "./boundaryLayer";
import { setupViewportLoader } from "./viewportLoader";
import { setupPopupHandler } from "./popup";
import { setupSearch } from "./search";
import { setupOffsetControl } from "./offsetControl";
import { loadOffsets } from "./offsetStore";

setWorkerUrl(maplibreWorkerUrl);

async function main(): Promise<void> {
  const map = new MapLibreMap({
    container: "map",
    style: {
      version: 8,
      sources: {
        [GSI_PHOTO_SOURCE_ID]: GSI_PHOTO_SOURCE,
      },
      layers: [
        {
          id: GSI_PHOTO_LAYER_ID,
          type: "raster",
          source: GSI_PHOTO_SOURCE_ID,
        },
      ],
    },
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
  });

  map.addControl(new NavigationControl(), "top-right");

  setupPopupHandler(map);
  setupOffsetControl(map);

  const indexPromise = loadDataIndex();
  const offsetsPromise = loadOffsets();

  const onLoad = (): void => {
    void Promise.all([indexPromise, offsetsPromise]).then(async ([index]) => {
      // Boundary layers must be added before parcel layers so they render
      // underneath them (parcel layers are appended on top as they load).
      await setupBoundaryLayer(map);
      setupViewportLoader(map, index);
      setupSearch(map, index);
    });
  };

  if (map.loaded()) {
    onLoad();
  } else {
    map.on("load", onLoad);
  }
}

void main();
