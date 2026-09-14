import type { Feature, FeatureCollection, Point } from "geojson";
import { statePlaneToLngLat } from "../../src/lib/nyc-state-plane";

/** Street Sign Work Orders — DOT’s commercial loading-zone map source. */
export const NYC_SIGN_WORK_ORDERS_ID = "qt6m-xctn";
export const NYC_SIGN_WORK_ORDERS_URL = `https://data.cityofnewyork.us/resource/${NYC_SIGN_WORK_ORDERS_ID}.json`;
export const NYC_SIGN_WORK_ORDERS_PAGE =
  "https://data.cityofnewyork.us/Transportation/Street-Sign-Work-Orders/qt6m-xctn";

/** Dedicated Neighborhood Loading Zone sign locations. */
export const NYC_NLZ_SIGNS_ID = "6pjf-tf5u";
export const NYC_NLZ_SIGNS_URL = `https://data.cityofnewyork.us/resource/${NYC_NLZ_SIGNS_ID}.json`;
export const NYC_NLZ_SIGNS_PAGE =
  "https://data.cityofnewyork.us/Transportation/Neighborhood-Loading-Zone-signs-locations-NYCDOT/6pjf-tf5u";

export type LoadingZoneType = "truck" | "neighborhood";

export type LoadingZoneRecord = {
  id: string;
  zoneType: LoadingZoneType;
  street: string;
  fromStreet: string;
  toStreet: string;
  borough: string;
  side: string;
  signCode: string;
  signText: string;
};

export type RawLoadingSign = {
  order_number?: string;
  record_type?: string;
  borough?: string;
  on_street?: string;
  from_street?: string;
  to_street?: string;
  side_of_street?: string;
  sign_code?: string;
  sign_description?: string;
  sign_x_coord?: string | number;
  sign_y_coord?: string | number;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isCurrentSign(recordType: unknown) {
  return text(recordType).toLowerCase() === "current";
}

export function isTruckLoadingSign(description: unknown) {
  const d = text(description).toUpperCase();
  return d.includes("TRUCK LOADING") || d.includes("TRUCKS LOADING");
}

export function classifyLoadingZone(description: unknown): LoadingZoneType | null {
  const d = text(description).toUpperCase();
  if (!d) return null;
  if (d.includes("NEIGHBORHOOD LOADING")) return "neighborhood";
  if (isTruckLoadingSign(d)) return "truck";
  return null;
}

export function normalizeLoadingZone(
  row: RawLoadingSign,
  index: number,
  forcedType?: LoadingZoneType,
): Feature<Point, LoadingZoneRecord> | null {
  if (!isCurrentSign(row.record_type)) return null;
  const x = num(row.sign_x_coord);
  const y = num(row.sign_y_coord);
  if (x === null || y === null) return null;

  const signText = text(row.sign_description);
  const zoneType = forcedType ?? classifyLoadingZone(signText);
  if (!zoneType) return null;

  const [lng, lat] = statePlaneToLngLat(x, y);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return null;
  }

  const order = text(row.order_number) || `row-${index}`;
  const code = text(row.sign_code) || "sign";
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5],
    },
    properties: {
      id: `nyc-loading-${zoneType}-${order}-${code}-${index}`,
      zoneType,
      street: text(row.on_street) || "Unnamed street",
      fromStreet: text(row.from_street),
      toStreet: text(row.to_street),
      borough: text(row.borough) || "New York City",
      side: text(row.side_of_street),
      signCode: code,
      signText: signText || "Loading zone",
    },
  };
}

export function buildLoadingZonesCollection(
  truckRows: RawLoadingSign[],
  nlzRows: RawLoadingSign[] = [],
): FeatureCollection<Point, LoadingZoneRecord> {
  const out: Feature<Point, LoadingZoneRecord>[] = [];
  const seen = new Set<string>();

  truckRows.forEach((row, index) => {
    const feature = normalizeLoadingZone(row, index, "truck");
    if (!feature || seen.has(feature.properties.id)) return;
    // Only keep rows that actually read as truck loading when forced.
    if (!isTruckLoadingSign(feature.properties.signText)) return;
    seen.add(feature.properties.id);
    out.push(feature);
  });

  nlzRows.forEach((row, index) => {
    const feature = normalizeLoadingZone(row, truckRows.length + index, "neighborhood");
    if (!feature || seen.has(feature.properties.id)) return;
    seen.add(feature.properties.id);
    out.push(feature);
  });

  out.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  return { type: "FeatureCollection", features: out };
}
