import type { ClearanceRecord } from "./types";

export type Severity = "danger" | "caution" | "clear";
export type RecordLabels = { title: string; subtitle: string };

const PLACE_WORD = /\b(avenue|ave|street|st|road|rd|blvd|parkway|pkwy|turnpike|tpke|drive|dr|lane|ln|place|pl|court|ct|expressway|expwy|highway|hwy|bridge|river|creek|path|park|ramp|canal|transit|amtrak|lirr)\b/i;
const SHORT_ROUTE = /^(I\d+[A-Z]?|NY\d+[A-Z]?|US\d+[A-Z]?)$/i;
const REFERENCE_MARKER = /^[0-9]{2,4}[A-Z][0-9A-Z]{6,}$/i;

export function getClearanceSeverity(clearance: number, vehicle: number): Severity {
  if (!Number.isFinite(clearance) || !Number.isFinite(vehicle) || clearance <= 0 || vehicle <= 0) throw new Error("Heights must be positive numbers.");
  const margin = clearance - vehicle;
  return margin <= 0 ? "danger" : margin <= 12 ? "caution" : "clear";
}

export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

/** 13′6″ — over that is an oversized load this map does not support yet. */
export const MAX_VEHICLE_HEIGHT_INCHES = 162;
export const MIN_VEHICLE_HEIGHT_INCHES = 12;
export const OVERSIZED_LOAD_MESSAGE = "Sorry — we don’t support oversized loads yet.";

function parsedFeetInches(feet: string, inches: string): number | null {
  if (!/^\d{1,2}$/.test(feet) || !/^\d{1,2}$/.test(inches)) return null;
  const ft = Number(feet), inc = Number(inches);
  if (inc >= 12) return null;
  return ft * 12 + inc;
}

export function parseVehicleHeight(feet: string, inches: string): number | null {
  const total = parsedFeetInches(feet, inches);
  return total != null && total >= MIN_VEHICLE_HEIGHT_INCHES && total <= MAX_VEHICLE_HEIGHT_INCHES ? total : null;
}

export function isOversizedHeight(feet: string, inches: string): boolean {
  const total = parsedFeetInches(feet, inches);
  return total != null && total > MAX_VEHICLE_HEIGHT_INCHES;
}

export function parseHeightParam(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const height = Number(value);
  return height >= MIN_VEHICLE_HEIGHT_INCHES && height <= MAX_VEHICLE_HEIGHT_INCHES ? height : null;
}

export function isOversizedHeightParam(value: string | null | undefined): boolean {
  if (!value || !/^\d{1,3}$/.test(value)) return false;
  return Number(value) > MAX_VEHICLE_HEIGHT_INCHES;
}

export function describeMargin(clearance: number, vehicle: number): string {
  const margin = clearance - vehicle;
  if (margin === 0) return "Equal to your vehicle height";
  return `${Math.abs(margin)}″ ${margin < 0 ? "lower than" : "above"} your vehicle height`;
}

export function crossingPhrase(appliesTo: ClearanceRecord["appliesTo"], crossing: string) {
  return `${appliesTo === "under" ? "Under" : "On bridge over"} ${crossing.trim() || "unnamed crossing"}`;
}

/** NYSDOT often stores a reference-marker blob instead of a street name. */
export function isInventoryLabel(name: string) {
  const text = name.trim();
  if (!text || PLACE_WORD.test(text)) return false;
  const compact = text.replace(/[\s./-]+/g, "");
  if (SHORT_ROUTE.test(compact)) return false;
  if (REFERENCE_MARKER.test(compact)) return true;
  const digits = (compact.match(/\d/g) || []).length;
  return compact.length >= 10 && digits >= 4 && digits / compact.length >= 0.3 && /[A-Z]/i.test(compact);
}

export function recordLabels(record: Pick<ClearanceRecord, "road" | "crossing" | "location" | "appliesTo">): RecordLabels {
  const road = record.road.trim();
  const crossing = record.crossing.trim();
  const location = record.location.trim();
  const relation = crossingPhrase(record.appliesTo, crossing);
  if (road && !isInventoryLabel(road)) return { title: road, subtitle: relation };
  if (crossing && !isInventoryLabel(crossing)) return { title: relation, subtitle: location || "Posted clearance at this structure" };
  if (location) return { title: location, subtitle: relation };
  return { title: road || "Road name unavailable", subtitle: relation };
}
