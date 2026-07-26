// Composition root: initializes the map and wires all modules together.
// No business logic lives here.
import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { GSI_PHOTO_LAYER_ID, GSI_PHOTO_SOURCE, GSI_PHOTO_SOURCE_ID, INITIAL_CENTER, INITIAL_ZOOM } from "./mapConfig";
import { loadDataIndex } from "./dataIndex";
import { setupViewportLoader } from "./viewportLoader";
import { setupPopupHandler } from "./popup";
import { setupSearch } from "./search";

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

  const index = await loadDataIndex();

  map.on("load", () => {
    setupViewportLoader(map, index);
  });

  setupSearch(map, index);
}

void main();
