import type { Feature, Point } from "geojson";
import { COVERAGE } from "../../src/lib/path";
import { COUNTIES } from "./nysdot-posted-height";

export const NYSDOT_LOAD_URL =
  "https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer/0";

export type NysdotLoadRaw = {
  properties: Record<string, unknown>;
  geometry: Point | null;
};

export type PostedLoadProps = {
  id: string;
  bin: string;
  name: string;
  county: string;
  postedLoadTons: number;
  kind: "posted-load";
  extras?: Record<string, string | number | boolean | null>;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

function tons(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function extrasFromLoad(p: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const extras: Record<string, string | number | boolean | null> = {};
  const owner = text(p.PRIMARY_OWNER);
  if (owner) extras.owner = owner;
  const other = text(p.OTHER_POSTING);
  if (other) extras.otherPosting = other;
  const posted = text(p.R_POSTED);
  if (posted) extras.rPosted = posted;
  const location = text(p.LOCATION);
  if (location) extras.location = location;
  return extras;
}

export function normalizeNysdotPostedLoad(features: NysdotLoadRaw[]): Feature<Point, PostedLoadProps>[] {
  const output: Feature<Point, PostedLoadProps>[] = [];
  for (const feature of features) {
    const p = feature.properties;
    if (!COUNTIES.has(text(p.COUNTY_NAME))) continue;
    const load = tons(p.POSTED_LOAD_TONS);
    const bin = text(p.BIN);
    const lng = p.LONGITUDE;
    const lat = p.LATITUDE;
    if (
      !bin ||
      load == null ||
      typeof lng !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < COVERAGE.minLng ||
      lng > COVERAGE.maxLng ||
      lat < COVERAGE.minLat ||
      lat > COVERAGE.maxLat
    ) {
      continue;
    }
    const carried = text(p.CARRIED_1);
    const crossed = text(p.CROSSED_1);
    const extras = extrasFromLoad(p);
    output.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id: `load-${bin}`,
        bin,
        name: [carried, crossed].filter(Boolean).join(" / ") || bin,
        county: text(p.COUNTY_NAME),
        postedLoadTons: load,
        kind: "posted-load",
        ...(Object.keys(extras).length ? { extras } : {}),
      },
    });
  }
  return output.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
}
