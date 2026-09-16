/**
 * OpenStreetMap maxheight tags for New Jersey — community-mapped signed heights.
 * Not an agency posted-clearance feed. Filter junk; label as community.
 */
import type { Feature, Point } from "geojson";
import { COVERAGE } from "../../src/lib/path";
import type { ClearanceRecord } from "../../src/lib/types";

export const OSM_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** NYC-facing NJ counties (FIPS-style names as printed). */
export const NJ_FOCUS_COUNTIES = new Set([
  "BERGEN",
  "HUDSON",
  "ESSEX",
  "PASSAIC",
  "UNION",
  "MIDDLESEX",
  "MONMOUTH",
  "MORRIS",
  "SOMERSET",
  "OCEAN",
  "SUSSEX",
  "WARREN",
  "HUNTERDON",
  "MERCER",
]);

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type OsmParseRejection = { id: string; value: string; reason: string };

const MIN_INCHES = 60; // 5′
const MAX_INCHES = 216; // 18′

/** Parse OSM maxheight into whole inches. Null = unusable. */
export function parseOsmMaxheight(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let v = String(raw).trim().toLowerCase();
  if (!v) return null;
  v = v
    .replace(/[’′]/g, "'")
    .replace(/[”″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  if (
    v === "default" ||
    v === "below_default" ||
    v === "none" ||
    v === "unsigned" ||
    v === "unknown" ||
    v === "no" ||
    v.startsWith("default")
  ) {
    return null;
  }

  // 12'6" / 12' 6" / 12'6
  let m = v.match(/^(\d+)\s*'\s*(\d+(?:\.\d+)?)\s*"?$/);
  if (m) {
    const ft = Number(m[1]);
    const inch = Number(m[2]);
    if (!Number.isFinite(ft) || !Number.isFinite(inch) || inch >= 12 || inch < 0) return null;
    return Math.round(ft * 12 + inch);
  }

  // 12' only
  m = v.match(/^(\d+)\s*'$/);
  if (m) return Math.round(Number(m[1]) * 12);

  // 3.8 m / 3.80m
  m = v.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (m) return Math.round(Number(m[1]) * 39.3700787402);

  // 12.5 ft / 12 feet
  m = v.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)$/);
  if (m) return Math.round(Number(m[1]) * 12);

  // bare number: treat as meters if ≤ 6, else feet if ≤ 20, else inches if ≤ 216
  m = v.match(/^(\d+(?:\.\d+)?)$/);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n <= 6) return Math.round(n * 39.3700787402); // meters
    if (n <= 20) return Math.round(n * 12); // feet
    if (n <= MAX_INCHES) return Math.round(n); // inches
    return null;
  }

  return null;
}

function elementCoord(el: OsmElement): [number, number] | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lon, lat];
}

function roadLabel(tags: Record<string, string>): string {
  return (
    tags.name ||
    tags["addr:street"] ||
    tags.bridge ||
    tags.ref ||
    tags.highway ||
    "OpenStreetMap maxheight"
  );
}

export function normalizeOsmNjMaxheight(
  elements: OsmElement[],
  retrievedAt: string,
): { features: Feature<Point, ClearanceRecord>[]; rejected: OsmParseRejection[] } {
  const features: Feature<Point, ClearanceRecord>[] = [];
  const rejected: OsmParseRejection[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const tags = el.tags || {};
    const raw = tags.maxheight || tags["maxheight:physical"] || "";
    const id = `osm-${el.type}-${el.id}`;
    const inches = parseOsmMaxheight(raw);
    if (inches == null) {
      rejected.push({ id, value: raw, reason: "Unparseable or non-signed maxheight" });
      continue;
    }
    if (inches < MIN_INCHES || inches > MAX_INCHES) {
      rejected.push({ id, value: raw, reason: `Height ${inches}″ outside ${MIN_INCHES}–${MAX_INCHES}″ filter` });
      continue;
    }

    const coord = elementCoord(el);
    if (!coord) {
      rejected.push({ id, value: raw, reason: "Missing coordinates" });
      continue;
    }
    const [lng, lat] = coord;
    if (
      lng < COVERAGE.minLng ||
      lng > COVERAGE.maxLng ||
      lat < COVERAGE.minLat ||
      lat > COVERAGE.maxLat
    ) {
      rejected.push({ id, value: raw, reason: "Outside coverage envelope" });
      continue;
    }

    // Soft NJ filter: west of the Hudson / NY harbor midline for this coverage box.
    if (lng > -73.9) {
      rejected.push({ id, value: raw, reason: "East of NJ focus longitude cutoff" });
      continue;
    }

    const dedupeKey = `${Math.round(lng * 1e5)}:${Math.round(lat * 1e5)}:${inches}`;
    if (seen.has(dedupeKey)) {
      rejected.push({ id, value: raw, reason: "Duplicate location+height" });
      continue;
    }
    seen.add(dedupeKey);

    const road = roadLabel(tags);
    const crossing = tags.bridge === "yes" ? "bridge" : tags.tunnel === "yes" ? "tunnel" : "";

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id,
        structureId: String(el.id),
        postedClearanceInches: inches,
        road,
        crossing,
        appliesTo: "under",
        county: "",
        state: "NJ",
        location: tags.description || tags.note || `OSM ${el.type}/${el.id}`,
        owner: "OpenStreetMap contributors",
        direction: null,
        clearanceType: "community",
        notes: [
          "Community-mapped OpenStreetMap maxheight — not an NJDOT posted-clearance feed.",
          "May be incomplete, outdated, or wrong. Always trust roadside signs.",
        ],
        sources: [
          {
            agency: "OpenStreetMap",
            dataset: "maxheight tags (NJ)",
            recordId: `${el.type}/${el.id}`,
            sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
            retrievedAt,
          },
        ],
        extras: {
          osmType: el.type,
          osmId: el.id,
          maxheightRaw: raw,
          clearanceType: "community",
        },
      },
    });
  }

  return { features, rejected };
}

export const OSM_NJ_QUERY = `
[out:json][timeout:120];
area["ISO3166-2"="US-NJ"]->.nj;
(
  node["maxheight"](area.nj);
  way["maxheight"](area.nj);
);
out tags center;
`.trim();
