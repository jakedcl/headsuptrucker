/** MapLibre error events that should drive the user-facing map banner. */
export type MapErrorEventLike = {
  error?: { name?: string; message?: string; status?: number };
  /** Present on per-tile fetch failures during pan/zoom. */
  tile?: unknown;
  sourceId?: string;
};

/**
 * Only surface real failures: basemap/style load, or the clearances source itself.
 * Ignore abort/cancel and individual tile one-offs that MapLibre fires constantly while navigating.
 */
export function shouldSurfaceMapError(event: MapErrorEventLike): boolean {
  if (event.tile != null) return false;

  const name = (event.error?.name ?? "").toLowerCase();
  const message = (event.error?.message ?? "").toLowerCase();
  if (
    name === "aborterror" ||
    message.includes("abort") ||
    message.includes("cancelled") ||
    message.includes("canceled")
  ) {
    return false;
  }

  const sourceId = event.sourceId;
  if (sourceId === "clearances") return true;
  // Style / map-level errors have no sourceId (failed style.json, sprites, etc.).
  if (!sourceId) return true;
  // Other sources (basemap tiles without a tile ref, overlays) are either transient
  // or already report via their own setData().catch handlers.
  return false;
}
