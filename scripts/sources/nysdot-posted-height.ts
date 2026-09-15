import type { Feature, Point } from "geojson";
import { COVERAGE } from "../../src/lib/path";
import type { ClearanceRecord } from "../../src/lib/types";

export const NYSDOT_URL = "https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer/1";
/** NYC + Long Island + Hudson Valley (parkway coverage already lives here). */
export const COUNTIES = new Set([
  "BRONX", "KINGS", "NEW YORK", "QUEENS", "RICHMOND", "NASSAU", "SUFFOLK",
  "WESTCHESTER", "ROCKLAND", "PUTNAM", "ORANGE", "DUTCHESS",
]);
export type RawFeature = { properties: Record<string, unknown>; geometry: Point | null };
export type Rejection = { id: string; field: string; value: unknown; reason: string };
const text = (v: unknown) => typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";

export function extrasFromNysdot(p: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const extras: Record<string, string | number | boolean | null> = {};
  const year = p.YEAR_BUILT;
  if (typeof year === "number" && year > 1800 && year < 2100) extras.yearBuilt = year;
  const structure = text(p.GTMS_STRUCTURE_DESC);
  if (structure) extras.structureType = structure;
  const other = text(p.OTHER_POSTING);
  if (other) extras.otherPosting = other;
  const load = p.POSTED_LOAD_TONS;
  if (typeof load === "number" && load > 0) extras.relatedPostedLoadTons = load;
  const local = text(p.LOCAL_BRIDGE_NUMBER);
  if (local) extras.localBridgeNumber = local;
  return extras;
}

// This feed encodes whole-inch postings as decimal feet rounded to two places.
// Accept only a value that round-trips through that representation (see data-audit.md).
export function decimalFeetToInches(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 30) return null;
  const inches = Math.round(value * 12);
  return Math.abs(Math.round(inches / 12 * 100) / 100 - value) <= 0.000001 ? inches : null;
}

export function normalizeNysdot(features: RawFeature[], retrievedAt: string) {
  const output: Feature<Point, ClearanceRecord>[] = [];
  const rejected: Rejection[] = [];
  for (const feature of features) {
    const p = feature.properties;
    if (!COUNTIES.has(text(p.COUNTY_NAME))) continue;
    const bin = text(p.BIN);
    const lng = p.LONGITUDE, lat = p.LATITUDE;
    // The live feed currently returns null geometry even with returnGeometry=true.
    // Use the agency's explicit decimal-degree attributes, not invented coordinates.
    if (
      !bin ||
      typeof lng !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < COVERAGE.minLng ||
      lng > COVERAGE.maxLng ||
      lat < COVERAGE.minLat ||
      lat > COVERAGE.maxLat
    ) {
      rejected.push({ id: bin, field: "coordinates", value: [lng, lat], reason: "Missing identity or outside launch-area coordinate envelope" });
      continue;
    }
    for (const appliesTo of ["under", "on"] as const) {
      const field = `POSTED_VRT_CLRNC_${appliesTo.toUpperCase()}`;
      const value = p[field];
      const inches = decimalFeetToInches(value);
      if (inches === null) {
        rejected.push({ id: bin, field, value, reason: value === 0 || value === null ? "No active posting in this field" : "Unrecognized posted-clearance encoding" });
        continue;
      }
      const under = text(p.CROSSED_MIN_VERT_DESC) || text(p.CROSSED_1);
      const over = text(p.CARRIED_1);
      const date = p.Date_FC_Updated;
      const extras = extrasFromNysdot(p);
      output.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {
        id: `nysdot-${bin}-${appliesTo}`, structureId: bin, postedClearanceInches: inches,
        road: appliesTo === "under" ? under : over, crossing: appliesTo === "under" ? over : under,
        appliesTo, county: text(p.COUNTY_NAME), state: "NY", location: text(p.LOCATION), owner: text(p.PRIMARY_OWNER),
        direction: null, clearanceType: "posted", notes: ["Direction and lane-specific clearances are not supplied in this layer."],
        sources: [{ agency: "NYSDOT", dataset: "Posted Height Bridges", recordId: bin, sourceUrl: `${NYSDOT_URL}/query?where=BIN%3D%27${encodeURIComponent(bin)}%27&outFields=*&f=pjson`, retrievedAt,
          ...(typeof date === "number" && Number.isFinite(date) ? { datasetUpdatedAt: new Date(date).toISOString() } : {}) }],
        ...(Object.keys(extras).length ? { extras } : {}),
      } });
    }
  }
  return { features: output, rejected };
}
