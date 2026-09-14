import type { Feature, FeatureCollection, LineString } from "geojson";
import { parseStatePlaneLineWkt } from "../../src/lib/nyc-state-plane";

export const NYC_STREET_CLOSURES_ID = "ezy6-djsf";
export const NYC_STREET_CLOSURES_URL = `https://data.cityofnewyork.us/resource/${NYC_STREET_CLOSURES_ID}.json`;
export const NYC_STREET_CLOSURES_PAGE =
  "https://data.cityofnewyork.us/Transportation/Street-Closures-due-to-Construction-Activities-by-/ezy6-djsf";

export type StreetClosureRecord = {
  id: string;
  street: string;
  fromStreet: string;
  toStreet: string;
  borough: string;
  purpose: string;
  workStart: string;
  workEnd: string;
};

type RawClosure = {
  oftcode?: string;
  onstreetname?: string;
  fromstreetname?: string;
  tostreetname?: string;
  boroughname?: string;
  purpose?: string;
  workstartdate?: string;
  workenddate?: string;
  wkt?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function isActiveClosure(workEnd: string, now = new Date()) {
  const end = Date.parse(workEnd);
  return Number.isFinite(end) && end >= now.getTime();
}

export function normalizeStreetClosure(
  row: RawClosure,
  index: number,
  now = new Date(),
): Feature<LineString, StreetClosureRecord> | null {
  const wkt = text(row.wkt);
  const coords = wkt ? parseStatePlaneLineWkt(wkt) : null;
  if (!coords) return null;
  const workEnd = text(row.workenddate);
  const workStart = text(row.workstartdate);
  if (!workEnd || !isActiveClosure(workEnd, now)) return null;
  const idBase = text(row.oftcode) || `${text(row.onstreetname)}-${index}`;
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {
      id: `nyc-closure-${idBase}-${workStart.slice(0, 10)}`,
      street: text(row.onstreetname) || "Unnamed street",
      fromStreet: text(row.fromstreetname) || "",
      toStreet: text(row.tostreetname) || "",
      borough: text(row.boroughname) || "New York City",
      purpose: text(row.purpose) || "Construction activity",
      workStart,
      workEnd,
    },
  };
}

export function buildStreetClosuresCollection(
  rows: RawClosure[],
  now = new Date(),
): FeatureCollection<LineString, StreetClosureRecord> {
  const out: Feature<LineString, StreetClosureRecord>[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const feature = normalizeStreetClosure(row, index, now);
    if (!feature || seen.has(feature.properties.id)) return;
    seen.add(feature.properties.id);
    out.push(feature);
  });
  out.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  return { type: "FeatureCollection", features: out };
}
