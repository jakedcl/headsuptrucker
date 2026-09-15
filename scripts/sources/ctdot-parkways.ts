import type { Feature, LineString, MultiLineString, Position } from "geojson";

/** CTDOT OSTA Parkway Restrictions (layer 11). */
export const CTDOT_PARKWAYS_URL =
  "https://services1.arcgis.com/FCaUeJ5SOVtImake/arcgis/rest/services/CTDOT_Office_of_the_State_Traffic_Administration_OSTA/FeatureServer/11";

export const CT_PARKWAY_DISPLAY: Record<string, string> = {
  "MERRITT PARKWAY": "Merritt Parkway",
  "WILBUR CROSS PARKWAY": "Wilbur Cross Parkway",
  "MILFORD PARKWAY": "Milford Parkway",
};

export type CtdotParkwayRaw = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: Position[] | Position[][] } | null;
};

/** Same property shape as public/data/parkways-nyc-li.geojson. */
export type ParkwayProps = {
  id: string;
  name: string;
  kind: "parkway";
  restriction: string;
  commercialBan: boolean;
  gcpTruckException: boolean;
  passengerOnlyHeightInches: number;
  widthInches: number | null;
  weightTons: number | null;
  labelLng: number;
  labelLat: number;
  extras?: Record<string, string | number | boolean | null>;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function labelPoint(coords: Position[]): [number, number] | null {
  if (!coords.length) return null;
  const mid = coords[Math.floor(coords.length / 2)];
  if (!Number.isFinite(mid[0]) || !Number.isFinite(mid[1])) return null;
  return [mid[0], mid[1]];
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sampleProps(features: CtdotParkwayRaw[], rawName: string) {
  return features.find(f => text(f.properties.ParkwayName).toUpperCase() === rawName)?.properties;
}

/** Dissolve CT OSTA segments into one MultiLineString per named parkway. */
export function normalizeCtdotParkways(features: CtdotParkwayRaw[]): Feature<MultiLineString, ParkwayProps>[] {
  const groups = new Map<string, Position[][]>();

  for (const feature of features) {
    const rawName = text(feature.properties.ParkwayName).toUpperCase();
    if (!CT_PARKWAY_DISPLAY[rawName] || !feature.geometry) continue;
    if (feature.geometry.type === "LineString") {
      const line = feature.geometry.coordinates as Position[];
      if (line.length < 2) continue;
      const list = groups.get(rawName) || [];
      list.push(line);
      groups.set(rawName, list);
    } else if (feature.geometry.type === "MultiLineString") {
      const list = groups.get(rawName) || [];
      for (const line of feature.geometry.coordinates as Position[][]) {
        if (line.length >= 2) list.push(line);
      }
      groups.set(rawName, list);
    }
  }

  const output: Feature<MultiLineString, ParkwayProps>[] = [];
  for (const [rawName, lines] of groups) {
    const name = CT_PARKWAY_DISPLAY[rawName];
    const flat = lines.flat();
    const label = labelPoint(flat);
    if (!label || !lines.length) continue;

    const props = sampleProps(features, rawName) || {};
    const heightFt = num(props.VehicleHeightRestriction) ?? 8;
    const widthFt = num(props.VehicleWidthRestriction);
    const lengthFt = num(props.VehicleLengthRestriction);
    const gvwLbs = num(props.GrossVehicleWeightRestriction);

    const dims = [
      `${heightFt}′ height`,
      widthFt != null ? `${widthFt}′ width` : null,
      lengthFt != null ? `${lengthFt}′ length` : null,
      gvwLbs != null ? `${gvwLbs.toLocaleString("en-US")} lb combination GVW` : null,
    ].filter(Boolean);

    const extras: Record<string, string | number | boolean | null> = {};
    const widthInches = widthFt != null ? Math.round(widthFt * 12) : null;
    const weightTons = gvwLbs != null ? Math.round((gvwLbs / 2000) * 100) / 100 : null;
    if (lengthFt != null) extras.vehicleLengthInches = Math.round(lengthFt * 12);
    if (gvwLbs != null) extras.gvwPounds = gvwLbs;

    output.push({
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: lines },
      properties: {
        id: `parkway-ct-${slug(name)}`,
        name,
        kind: "parkway",
        restriction: `No commercial vehicles — max ${dims.join(", ")} (CT parkway rules).`,
        commercialBan: true,
        gcpTruckException: false,
        passengerOnlyHeightInches: Math.round(heightFt * 12),
        widthInches,
        weightTons,
        labelLng: label[0],
        labelLat: label[1],
        ...(Object.keys(extras).length ? { extras } : {}),
      },
    });
  }

  return output.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
}

/** Facility-shaped props matching public/data/facilities-nyc-li.geojson parkways. */
export function parkwayToFacility(feature: Feature<MultiLineString | LineString, ParkwayProps>) {
  const p = feature.properties;
  return {
    type: "Feature" as const,
    geometry: feature.geometry,
    properties: {
      id: p.id,
      name: p.name,
      kind: "parkway" as const,
      operator: "CTDOT / OSTA",
      heightInches: p.passengerOnlyHeightInches,
      passengerOnlyHeightInches: p.passengerOnlyHeightInches,
      widthInches: p.widthInches,
      weightTons: p.weightTons,
      postedLoadTons: null as number | null,
      trucksBanned: false,
      commercialBan: true,
      gcpTruckException: false,
      noTrucksLower: false,
      noHazmat: false,
      restrictionNote: p.restriction,
      geometryRole: "line" as const,
      labelLng: p.labelLng,
      labelLat: p.labelLat,
      extras: p.extras || {},
    },
  };
}
