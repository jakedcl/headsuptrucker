import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";

export const NYC_TRUCK_ROUTES_ID = "jjja-shxy";
export const NYC_TRUCK_ROUTES_URL = `https://data.cityofnewyork.us/resource/${NYC_TRUCK_ROUTES_ID}.geojson`;
export const NYC_TRUCK_ROUTES_PAGE =
  "https://data.cityofnewyork.us/Transportation/New-York-City-Truck-Routes/jjja-shxy";

export type TruckRouteType = "Through" | "Local" | "Limited Local" | "Other";

export type TruckRouteRecord = {
  id: string;
  street: string;
  borough: string;
  routeType: TruckRouteType;
  restriction: string | null;
  isBridge: boolean;
  isTunnel: boolean;
  isExpressway: boolean;
};

type RawProps = Record<string, string | undefined>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function flag(value: unknown) {
  return text(value).toUpperCase() === "Y";
}

export function normalizeRouteType(value: unknown): TruckRouteType {
  const raw = text(value).toLowerCase();
  if (raw === "through") return "Through";
  if (raw === "local") return "Local";
  if (raw === "limited local") return "Limited Local";
  return "Other";
}

export function normalizeTruckRouteFeature(
  feature: Feature<MultiLineString | LineString, RawProps>,
): Feature<MultiLineString | LineString, TruckRouteRecord> | null {
  const geometry = feature.geometry;
  if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) return null;
  const p = feature.properties || {};
  const id = text(p.segmentid) || text(p.objectid_1);
  if (!id) return null;
  const restriction = text(p.restrictio) || null;
  return {
    type: "Feature",
    geometry,
    properties: {
      id: `nyc-truck-${id}`,
      street: text(p.street) || "Unnamed street",
      borough: text(p.boroname) || "New York City",
      routeType: normalizeRouteType(p.routetype),
      restriction,
      isBridge: flag(p.thrubrg) || flag(p.localbrg),
      isTunnel: flag(p.thrutunl) || flag(p.localtunl),
      isExpressway: flag(p.thruexwy),
    },
  };
}

export function roundCoords<T extends MultiLineString | LineString>(geometry: T, digits = 5): T {
  const round = (n: number) => Math.round(n * 10 ** digits) / 10 ** digits;
  if (geometry.type === "LineString") {
    return { ...geometry, coordinates: geometry.coordinates.map(([lng, lat]) => [round(lng), round(lat)]) };
  }
  return {
    ...geometry,
    coordinates: geometry.coordinates.map(line => line.map(([lng, lat]) => [round(lng), round(lat)])),
  };
}

export function buildTruckRoutesCollection(
  features: Feature<MultiLineString | LineString, RawProps>[],
): FeatureCollection<MultiLineString | LineString, TruckRouteRecord> {
  const out: Feature<MultiLineString | LineString, TruckRouteRecord>[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const normalized = normalizeTruckRouteFeature(feature);
    if (!normalized || seen.has(normalized.properties.id)) continue;
    seen.add(normalized.properties.id);
    out.push({ ...normalized, geometry: roundCoords(normalized.geometry) });
  }
  out.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  return { type: "FeatureCollection", features: out };
}
