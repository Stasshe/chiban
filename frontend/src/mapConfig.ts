// Static map configuration: tile sources, layer paint definitions, thresholds.
import type { LayerSpecification, RasterSourceSpecification } from "maplibre-gl";

/** GSI (Geospatial Information Authority of Japan) seamless aerial photo tiles. */
export const GSI_PHOTO_SOURCE_ID = "gsi-seamless-photo";

export const GSI_PHOTO_SOURCE: RasterSourceSpecification = {
  type: "raster",
  tiles: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
  tileSize: 256,
  maxzoom: 18,
  attribution:
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
};

export const GSI_PHOTO_LAYER_ID = "gsi-seamless-photo-layer";

/** Minimum zoom level at which parcel (chiban) polygons are loaded and shown. */
export const MIN_ZOOM_FOR_PARCELS = 14;

/** Prefix used for per-dataset parcel source/layer ids. */
export const PARCEL_SOURCE_PREFIX = "parcel-source-";
export const PARCEL_FILL_LAYER_PREFIX = "parcel-fill-";
export const PARCEL_LINE_LAYER_PREFIX = "parcel-line-";

export function parcelSourceId(entryId: string): string {
  return `${PARCEL_SOURCE_PREFIX}${entryId}`;
}

export function parcelFillLayerId(entryId: string): string {
  return `${PARCEL_FILL_LAYER_PREFIX}${entryId}`;
}

export function parcelLineLayerId(entryId: string): string {
  return `${PARCEL_LINE_LAYER_PREFIX}${entryId}`;
}

export function buildParcelFillLayer(entryId: string): LayerSpecification {
  return {
    id: parcelFillLayerId(entryId),
    type: "fill",
    source: parcelSourceId(entryId),
    paint: {
      "fill-color": "#ffcc00",
      "fill-opacity": 0.25,
    },
  };
}

export function buildParcelLineLayer(entryId: string): LayerSpecification {
  return {
    id: parcelLineLayerId(entryId),
    type: "line",
    source: parcelSourceId(entryId),
    paint: {
      "line-color": "#ff6600",
      "line-width": 1.5,
    },
  };
}

/**
 * Layer builders for "approximate" datasets: arbitrary-coordinate parcels
 * that georeference.py coarsely aligned via geocoding + translation. Styled
 * distinctly (blue, dashed outline) from public data so the map communicates
 * that positions here are approximate, not survey-accurate.
 */
export function buildApproximateFillLayer(entryId: string): LayerSpecification {
  return {
    id: parcelFillLayerId(entryId),
    type: "fill",
    source: parcelSourceId(entryId),
    paint: {
      "fill-color": "#3388ff",
      "fill-opacity": 0.2,
    },
  };
}

export function buildApproximateLineLayer(entryId: string): LayerSpecification {
  return {
    id: parcelLineLayerId(entryId),
    type: "line",
    source: parcelSourceId(entryId),
    paint: {
      "line-color": "#1a5fb4",
      "line-width": 1.5,
      "line-dasharray": [2, 2],
    },
  };
}

/** Default initial view: near Tokyo Station, matching the sample dataset. */
export const INITIAL_CENTER: [number, number] = [139.7671, 35.681];
export const INITIAL_ZOOM = 16;
