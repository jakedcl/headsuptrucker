/** Optional vehicle dims beyond height — unlock awareness layers. */

export type VehicleProfile = {
  /** Overall width in inches, if known. */
  widthInches: number | null;
  /** Gross vehicle weight in US tons, if known. */
  weightTons: number | null;
  /** Commercial / truck class — unlocks parkway bans. */
  commercial: boolean;
};

export const EMPTY_VEHICLE_PROFILE: VehicleProfile = {
  widthInches: null,
  weightTons: null,
  commercial: false,
};

export function parseWidthParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 48 || n > 120) return null;
  return Math.round(n);
}

export function parseWeightParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 80) return null;
  return Math.round(n * 10) / 10;
}

export function formatWidth(inches: number) {
  const feet = Math.floor(inches / 12);
  const rem = inches % 12;
  return `${feet}′${rem ? ` ${rem}″` : ""}`;
}

export function formatTons(tons: number) {
  return Number.isInteger(tons) ? `${tons} t` : `${tons.toFixed(1)} t`;
}

/** Posted load is a problem when your weight is at or above the posting. */
export function loadConflict(postedTons: number, weightTons: number | null) {
  if (weightTons === null) return "unknown";
  return weightTons >= postedTons ? "danger" : "ok";
}

/** Crossing width is a problem when your width is at or above the limit. */
export function widthConflict(limitInches: number | null | undefined, widthInches: number | null) {
  if (widthInches === null || limitInches == null) return "unknown";
  return widthInches >= limitInches ? "danger" : "ok";
}
