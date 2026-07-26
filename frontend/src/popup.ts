// Click handling: shows a popup with parcel details (地番/所在/精度区分/座標系).
import { Popup, type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import { PARCEL_FILL_LAYER_PREFIX } from "./mapConfig";
import type { ParcelProperties } from "./types";

/** Joins the address hierarchy fields (市区町村名 down to 予備名) into one string. */
function formatAddress(properties: ParcelProperties): string {
  const parts = [
    properties.市区町村名,
    properties.大字名,
    properties.丁目名,
    properties.小字名,
    properties.予備名,
  ].filter((part): part is string => Boolean(part));
  return parts.join("");
}

function buildPopupHtml(properties: ParcelProperties): string {
  const address = formatAddress(properties);
  const chiban = properties.地番 ?? "(不明)";
  const precision = properties.精度区分 ?? "(不明)";
  const coordinateSystem = properties.座標系 ?? "(不明)";
  const approximateNote = properties.位置精度
    ? `<div class="parcel-popup__warning">⚠ 概算位置(自動位置合わせ、境界線は実際とズレる可能性があります)</div>`
    : "";

  return `
    <div class="parcel-popup">
      <div class="parcel-popup__title">地番 ${chiban}</div>
      ${approximateNote}
      <dl>
        <dt>所在</dt><dd>${address || "(不明)"}</dd>
        <dt>精度区分</dt><dd>${precision}</dd>
        <dt>座標系</dt><dd>${coordinateSystem}</dd>
      </dl>
    </div>
  `;
}

/** Wires up click-to-popup behavior for all currently and future parcel fill layers. */
export function setupPopupHandler(map: MapLibreMap): void {
  map.on("click", (event: MapMouseEvent) => {
    const features = map.queryRenderedFeatures(event.point);
    const parcelFeature = features.find((feature) =>
      typeof feature.layer.id === "string" && feature.layer.id.startsWith(PARCEL_FILL_LAYER_PREFIX),
    );
    if (!parcelFeature) {
      return;
    }

    const properties = (parcelFeature.properties ?? {}) as ParcelProperties;
    new Popup({ closeButton: true })
      .setLngLat(event.lngLat)
      .setHTML(buildPopupHtml(properties))
      .addTo(map);
  });

  map.on("mousemove", (event: MapMouseEvent) => {
    const features = map.queryRenderedFeatures(event.point);
    const hovering = features.some(
      (feature) => typeof feature.layer.id === "string" && feature.layer.id.startsWith(PARCEL_FILL_LAYER_PREFIX),
    );
    map.getCanvas().style.cursor = hovering ? "pointer" : "";
  });
}
