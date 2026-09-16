import type { Feature, Point, Position } from "geojson";

/** CTDOT Bridges inventory — posted load fields live here. */
export const CTDOT_BRIDGES_URL =
  "https://services1.arcgis.com/FCaUeJ5SOVtImake/arcgis/rest/services/CTDOT_Bridges/FeatureServer/0";

export type CtdotBridgeRaw = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: Position[][] | Position[][][] | Position } | null;
};

/** Same property shape as data/built/posted-load-nyc-li.geojson. */
export type PostedLoadProps = {
  id: string;
  bin: string;
  name: string;
  county: string;
  postedLoadTons: number;
  kind: "posted-load";
};

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function townName(raw: unknown): string {
  const value = text(raw);
  if (!value) return "";
  const parts = value.split(" - ");
  return (parts.length > 1 ? parts.slice(1).join(" - ") : value).toUpperCase();
}

function parseTons(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

/** Prefer "all vehicles" posting; otherwise the lowest listed config (most restrictive). */
export function postedLoadTonsFromProps(props: Record<string, unknown>): number | null {
  const all = parseTons(props.PostedLoadAll_6000042);
  if (all != null) return all;
  const candidates = [
    parseTons(props.PostedLdSingleUnit_6000034),
    parseTons(props.PostedLoadSemiTrlr_6000036),
    parseTons(props.PostedLoad4Axle_6000038),
    parseTons(props.PostedLoad3S2_6000040),
  ].filter((n): n is number => n != null);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

function ringCentroid(ring: Position[]): [number, number] | null {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  const end =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
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

export function polygonCentroid(geometry: CtdotBridgeRaw["geometry"]): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") return ringCentroid((geometry.coordinates as Position[][])[0] || []);
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as Position[][][];
    return ringCentroid(polys[0]?.[0] || []);
  }
  if (geometry.type === "Point") {
    const c = geometry.coordinates as Position;
    if (Number.isFinite(c[0]) && Number.isFinite(c[1])) return [c[0], c[1]];
  }
  return null;
}

export type CoverageBox = { minLng: number; maxLng: number; minLat: number; maxLat: number };

export function normalizeCtdotPostedLoad(
  features: CtdotBridgeRaw[],
  coverage: CoverageBox,
): Feature<Point, PostedLoadProps>[] {
  const output: Feature<Point, PostedLoadProps>[] = [];

  for (const feature of features) {
    const tons = postedLoadTonsFromProps(feature.properties);
    if (tons == null) continue;
    const centroid = polygonCentroid(feature.geometry);
    if (!centroid) continue;
    const [lng, lat] = centroid;
    if (lng < coverage.minLng || lng > coverage.maxLng || lat < coverage.minLat || lat > coverage.maxLat) {
      continue;
    }

    const structureId = text(feature.properties.BridgeStructureNumber);
    if (!structureId) continue;
    const facility = text(feature.properties.FacilityCarried_NBI7);
    const crossed = text(feature.properties.FeatureCrossed_NBI6A);
    const town = townName(feature.properties.Town_NBI4);
    const name = [facility, crossed].filter(Boolean).join(" / ") || structureId;

    output.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id: `load-ct-${structureId}`,
        bin: structureId,
        name,
        county: town || "CT",
        postedLoadTons: tons,
        kind: "posted-load",
      },
    });
  }

  return output.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
}
