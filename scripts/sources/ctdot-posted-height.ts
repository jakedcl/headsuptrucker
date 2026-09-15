import type { Feature, Point, Position } from "geojson";
import { COVERAGE } from "../../src/lib/path";
import type { ClearanceRecord } from "../../src/lib/types";

export const CTDOT_URL =
  "https://services1.arcgis.com/FCaUeJ5SOVtImake/arcgis/rest/services/CTDOT_Bridges/FeatureServer/0";

/** Fairfield County towns (SW CT near NYC). Agency Town_NBI4 values look like "73070 - STAMFORD". */
export const FAIRFIELD_TOWNS = new Set([
  "BRIDGEPORT",
  "STAMFORD",
  "NORWALK",
  "DANBURY",
  "GREENWICH",
  "FAIRFIELD",
  "STRATFORD",
  "SHELTON",
  "TRUMBULL",
  "WESTPORT",
  "DARIEN",
  "NEW CANAAN",
  "RIDGEFIELD",
  "WILTON",
  "MONROE",
  "EASTON",
  "REDDING",
  "BROOKFIELD",
  "NEW FAIRFIELD",
  "BETHEL",
  "WESTON",
  "SHERMAN",
]);

/** New Haven County (I-95 / Wilbur Cross ring toward NYC). */
export const NEW_HAVEN_TOWNS = new Set([
  "NEW HAVEN",
  "WEST HAVEN",
  "EAST HAVEN",
  "NORTH HAVEN",
  "HAMDEN",
  "WOODBRIDGE",
  "ORANGE",
  "MILFORD",
  "BRANFORD",
  "NORTH BRANFORD",
  "GUILFORD",
  "MADISON",
  "WALLINGFORD",
  "MERIDEN",
  "CHESHIRE",
  "BETHANY",
  "PROSPECT",
  "WOLCOTT",
  "WATERBURY",
  "NAUGATUCK",
  "BEACON FALLS",
  "OXFORD",
  "SOUTHBURY",
  "MIDDLEBURY",
  "SEYMOUR",
  "ANSONIA",
  "DERBY",
]);

export const COVERED_TOWNS = new Set([...FAIRFIELD_TOWNS, ...NEW_HAVEN_TOWNS]);

export type CtdotRawFeature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: Position[][] | Position[][][] } | null;
};

export type Rejection = { id: string; field: string; value: unknown; reason: string };

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function townName(raw: unknown): string {
  const value = text(raw);
  if (!value) return "";
  const parts = value.split(" - ");
  return (parts.length > 1 ? parts.slice(1).join(" - ") : value).toUpperCase();
}

/** Convert posted feet + inches to whole inches. Null/empty posting → null. */
export function feetInchesToInches(feet: unknown, inches: unknown): number | null {
  const hasFeet = typeof feet === "number" && Number.isFinite(feet);
  const hasInches = typeof inches === "number" && Number.isFinite(inches);
  if (!hasFeet && !hasInches) return null;
  const ft = hasFeet ? (feet as number) : 0;
  const inch = hasInches ? (inches as number) : 0;
  if (ft < 0 || inch < 0 || inch >= 12) return null;
  const total = Math.round(ft * 12 + inch);
  return total > 0 ? total : null;
}

function postedLoadHint(props: Record<string, unknown>): number | null {
  const candidates = [
    props.PostedLoadAll_6000042,
    props.PostedLdSingleUnit_6000034,
    props.PostedLoadSemiTrlr_6000036,
    props.PostedLoad4Axle_6000038,
    props.PostedLoad3S2_6000040,
  ]
    .map(v => {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v.trim());
        return Number.isFinite(n) && n > 0 ? n : null;
      }
      return null;
    })
    .filter((n): n is number => n != null);
  return candidates.length ? Math.min(...candidates) : null;
}

function ringCentroid(ring: Position[]): [number, number] | null {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  const end = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < end; i++) {
    const lng = ring[i][0];
    const lat = ring[i][1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    sumLng += lng;
    sumLat += lat;
    count++;
  }
  if (!count) return null;
  return [sumLng / count, sumLat / count];
}

export function polygonCentroid(geometry: CtdotRawFeature["geometry"]): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return ringCentroid((geometry.coordinates as Position[][])[0] || []);
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as Position[][][];
    return ringCentroid(polys[0]?.[0] || []);
  }
  return null;
}

export function normalizeCtdot(features: CtdotRawFeature[], retrievedAt: string) {
  const output: Feature<Point, ClearanceRecord>[] = [];
  const rejected: Rejection[] = [];

  for (const feature of features) {
    const p = feature.properties;
    const town = townName(p.Town_NBI4);
    if (!COVERED_TOWNS.has(town)) continue;

    const structureId = text(p.BridgeStructureNumber);
    const centroid = polygonCentroid(feature.geometry);
    if (!structureId || !centroid) {
      rejected.push({
        id: structureId,
        field: "coordinates",
        value: feature.geometry,
        reason: "Missing structure id or polygon centroid",
      });
      continue;
    }
    const [lng, lat] = centroid;
    if (
      lng < COVERAGE.minLng ||
      lng > COVERAGE.maxLng ||
      lat < COVERAGE.minLat ||
      lat > COVERAGE.maxLat
    ) {
      rejected.push({ id: structureId, field: "coordinates", value: [lng, lat], reason: "Centroid outside coverage envelope" });
      continue;
    }

    const facility = text(p.FacilityCarried_NBI7);
    const crossed = text(p.FeatureCrossed_NBI6A);

    for (const appliesTo of ["under", "on"] as const) {
      const inches =
        appliesTo === "under"
          ? feetInchesToInches(p.PostedVertUnderClrncFt, p.PostedVertUnderClrncIN)
          : feetInchesToInches(p.PostedVertClrncFt_6000029, p.PostedVertClrncIN_6000030);
      if (inches === null) {
        rejected.push({
          id: structureId,
          field: appliesTo === "under" ? "PostedVertUnderClrnc" : "PostedVertClrnc",
          value: appliesTo === "under"
            ? [p.PostedVertUnderClrncFt, p.PostedVertUnderClrncIN]
            : [p.PostedVertClrncFt_6000029, p.PostedVertClrncIN_6000030],
          reason: "No active posted clearance in this field",
        });
        continue;
      }

      const extras: Record<string, string | number | boolean | null> = {};
      const measuredUnder = feetInchesToInches(
        p.MinVertClearanceUnderFt_NBI54B,
        p.MinVertClearanceUnderIN_NBI54B,
      );
      if (measuredUnder != null) extras.measuredUnderInches = measuredUnder;
      const relatedLoad = postedLoadHint(p);
      if (relatedLoad != null) extras.relatedPostedLoadTons = relatedLoad;

      output.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          id: `ctdot-${structureId}-${appliesTo}`,
          structureId,
          postedClearanceInches: inches,
          road: appliesTo === "under" ? crossed || facility : facility || crossed,
          crossing: appliesTo === "under" ? facility || crossed : crossed || facility,
          appliesTo,
          county: town,
          state: "CT",
          location: [facility, crossed].filter(Boolean).join(" over ") || town,
          owner: text(p.OwnerValue_Description) || "CTDOT",
          direction: null,
          clearanceType: "posted",
          notes: [
            "Posted values from CTDOT Bridges. Connecticut posting practice may differ from New York’s one-foot convention; we warn off the posted number only.",
            "Direction and lane-specific clearances are not supplied in this layer.",
          ],
          sources: [
            {
              agency: "CTDOT",
              dataset: "CTDOT Bridges",
              recordId: structureId,
              sourceUrl: `${CTDOT_URL}/query?where=BridgeStructureNumber%3D%27${encodeURIComponent(structureId)}%27&outFields=*&f=pjson`,
              retrievedAt,
            },
          ],
          ...(Object.keys(extras).length ? { extras } : {}),
        },
      });
    }
  }

  return { features: output, rejected };
}
