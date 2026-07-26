// Arrow-button UI for nudging an "approximate" parcel group's position.
// Tracks the "active group" (the 丁目 group of the most recently clicked
// parcel) and, on button press, persists the adjustment via offsetStore and
// asks parcelLayers to redraw the affected source(s) immediately.
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { adjustOffset, getOffset, saveOffsetAbsolute, setOffsetInMemory, type Offset } from "./offsetStore";
import { refreshOffsetForGroup } from "./parcelLayers";

const METERS_PER_DEGREE_LAT = 111320;

type Direction = "up" | "down" | "left" | "right";
const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

interface ActiveGroup {
  groupKey: string;
  map: MapLibreMap;
}

let activeGroup: ActiveGroup | null = null;

const KEY_TO_DIRECTION: Record<string, Direction> = {
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

const KEY_REPEAT_INTERVAL_MS = 80;
const KEY_ACCELERATION_DELAY_MS = 500;
const KEY_ACCELERATION_MULTIPLIER = 3;

const activeKeyRepeats = new Map<string, ReturnType<typeof setInterval>>();

interface DragState {
  groupKey: string;
  startLngLat: { lng: number; lat: number };
  startOffset: Offset;
}

let dragState: DragState | null = null;

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

async function handleDirection(direction: Direction, multiplier = 1): Promise<void> {
  if (!activeGroup) {
    return;
  }
  const { groupKey, map } = activeGroup;
  const delta = deltaForDirection(direction, stepDegrees(map));
  await adjustOffset(groupKey, delta.dLat * multiplier, delta.dLon * multiplier);
  refreshOffsetForGroup(map, groupKey);
}

function isTypingTarget(target: Element | null): boolean {
  return target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
}

function handleKeyDown(event: KeyboardEvent): void {
  if (isTypingTarget(document.activeElement)) {
    return;
  }
  const key = event.key.toLowerCase();
  const direction = KEY_TO_DIRECTION[key];
  if (!direction || !activeGroup || activeKeyRepeats.has(key)) {
    return;
  }
  const startTime = Date.now();
  void handleDirection(direction, 1);
  const intervalId = setInterval(() => {
    const isAccelerated = Date.now() - startTime >= KEY_ACCELERATION_DELAY_MS;
    void handleDirection(direction, isAccelerated ? KEY_ACCELERATION_MULTIPLIER : 1);
  }, KEY_REPEAT_INTERVAL_MS);
  activeKeyRepeats.set(key, intervalId);
}

function handleKeyUp(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  const intervalId = activeKeyRepeats.get(key);
  if (intervalId === undefined) {
    return;
  }
  clearInterval(intervalId);
  activeKeyRepeats.delete(key);
}

function handleMouseDown(map: MapLibreMap, e: MapLayerMouseEvent): void {
  if (!e.originalEvent.altKey || !activeGroup) {
    return;
  }
  map.dragPan.disable();
  e.originalEvent.preventDefault();
  dragState = {
    groupKey: activeGroup.groupKey,
    startLngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
    startOffset: getOffset(activeGroup.groupKey),
  };
  map.getCanvas().style.cursor = "grabbing";
}

function handleMouseMove(map: MapLibreMap, e: MapLayerMouseEvent): void {
  if (!dragState) {
    return;
  }
  const dLat = e.lngLat.lat - dragState.startLngLat.lat;
  const dLon = e.lngLat.lng - dragState.startLngLat.lng;
  const newOffset: Offset = { dLat: dragState.startOffset.dLat + dLat, dLon: dragState.startOffset.dLon + dLon };
  setOffsetInMemory(dragState.groupKey, newOffset);
  refreshOffsetForGroup(map, dragState.groupKey);
}

function handleMouseUp(map: MapLibreMap): void {
  if (!dragState) {
    return;
  }
  const finalOffset = getOffset(dragState.groupKey);
  void saveOffsetAbsolute(dragState.groupKey, finalOffset);
  map.dragPan.enable();
  map.getCanvas().style.cursor = "";
  dragState = null;
}

/** Sets the group that arrow-button clicks act on, called when a parcel popup is opened. */
export function setActiveGroup(groupKey: string, label: string, map: MapLibreMap): void {
  activeGroup = { groupKey, map };
  renderActiveGroup(label);
}

/** Wires up click handlers on the arrow buttons and Alt+drag on the map. Call once at startup. */
export function setupOffsetControl(map: MapLibreMap): void {
  for (const direction of DIRECTIONS) {
    const button = document.querySelector<HTMLButtonElement>(`#offset-control button[data-direction="${direction}"]`);
    button?.addEventListener("click", () => {
      void handleDirection(direction);
    });
  }
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  map.on("mousedown", (e) => handleMouseDown(map, e));
  map.on("mousemove", (e) => handleMouseMove(map, e));
  map.on("mouseup", () => handleMouseUp(map));
  renderActiveGroup(null);
}
