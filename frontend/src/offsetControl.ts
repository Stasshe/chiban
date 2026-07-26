// Arrow-button UI for nudging an "approximate" parcel group's position.
// Tracks the "active group" (the 丁目 group of the most recently clicked
// parcel) and, on button press, persists the adjustment via offsetStore and
// asks parcelLayers to redraw the affected source(s) immediately.
import type { Map as MapLibreMap } from "maplibre-gl";
import { adjustOffset } from "./offsetStore";
import { refreshOffsetForGroup } from "./parcelLayers";

const METERS_PER_DEGREE_LAT = 111320;

type Direction = "up" | "down" | "left" | "right";
const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

interface ActiveGroup {
  groupKey: string;
  map: MapLibreMap;
}

let activeGroup: ActiveGroup | null = null;

/** Degrees-per-click step, computed from the current map center latitude so 1 click ~= 1 meter. */
function stepDegrees(map: MapLibreMap): { dLat: number; dLon: number } {
  const centerLat = map.getCenter().lat;
  return {
    dLat: 1 / METERS_PER_DEGREE_LAT,
    dLon: 1 / (METERS_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180)),
  };
}

function deltaForDirection(direction: Direction, step: { dLat: number; dLon: number }): { dLat: number; dLon: number } {
  if (direction === "up") return { dLat: step.dLat, dLon: 0 };
  if (direction === "down") return { dLat: -step.dLat, dLon: 0 };
  if (direction === "left") return { dLat: 0, dLon: -step.dLon };
  return { dLat: 0, dLon: step.dLon };
}

function getPanel(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>("#offset-control");
}

function getLabel(): HTMLSpanElement | null {
  return document.querySelector<HTMLSpanElement>("#offset-control-label");
}

function getButtons(): NodeListOf<HTMLButtonElement> {
  return document.querySelectorAll<HTMLButtonElement>("#offset-control button[data-direction]");
}

function renderActiveGroup(label: string | null): void {
  const panel = getPanel();
  const labelEl = getLabel();
  if (!panel || !labelEl) {
    return;
  }
  const isActive = label !== null;
  panel.classList.toggle("offset-control--disabled", !isActive);
  labelEl.textContent = label ?? "";
  getButtons().forEach((button) => {
    button.disabled = !isActive;
  });
}

async function handleDirection(direction: Direction): Promise<void> {
  if (!activeGroup) {
    return;
  }
  const { groupKey, map } = activeGroup;
  const delta = deltaForDirection(direction, stepDegrees(map));
  await adjustOffset(groupKey, delta.dLat, delta.dLon);
  refreshOffsetForGroup(map, groupKey);
}

/** Sets the group that arrow-button clicks act on, called when a parcel popup is opened. */
export function setActiveGroup(groupKey: string, label: string, map: MapLibreMap): void {
  activeGroup = { groupKey, map };
  renderActiveGroup(label);
}

/** Wires up click handlers on the arrow buttons. Call once at startup. */
export function setupOffsetControl(): void {
  for (const direction of DIRECTIONS) {
    const button = document.querySelector<HTMLButtonElement>(`#offset-control button[data-direction="${direction}"]`);
    button?.addEventListener("click", () => {
      void handleDirection(direction);
    });
  }
  renderActiveGroup(null);
}
