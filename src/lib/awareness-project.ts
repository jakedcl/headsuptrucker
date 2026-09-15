/**
 * Project canonical awareness features back into the flat prop shapes the
 * map + detail cards already understand. Keeps the UI stable while the
 * pipeline writes one shared schema.
 */

import type { FeatureCollection, Point } from "geojson";
import type { ClearanceRecord } from "@/lib/types";
import type {
  AwarenessFeature,
  AwarenessKind,
  AwarenessLineCollection,
  AwarenessPointCollection,
  AwarenessProperties,
} from "@/lib/awareness-schema";

// Re-export helpers used by tests / callers.
export type { AwarenessProperties };

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Clearance dots → ClearanceRecord props the list/detail already use. */
export function toClearanceRecord(props: AwarenessProperties): ClearanceRecord {
  const height = props.limits.heightInches;
  if (typeof height !== "number" || !Number.isFinite(height)) {
    throw new Error(`Clearance ${props.id} missing heightInches`);
  }
  return {
    id: props.id,
    structureId: str(props.extras?.structureId, props.id),
    postedClearanceInches: height,
    road: props.road || "",
    crossing: props.crossing || "",
    appliesTo: props.appliesTo === "on" ? "on" : "under",
    county: props.county || props.town || "",
    state: props.state === "CT" ? "CT" : "NY",
    location: props.location || "",
    owner: props.operator || str(props.extras?.owner),
    direction: props.direction ?? null,
    clearanceType: "posted",
    notes: props.notes || [],
    sources: (props.sources || []).map(s => ({
      agency: s.agency,
      dataset: s.dataset,
      recordId: s.recordId,
      sourceUrl: s.sourceUrl,
      retrievedAt: s.retrievedAt,
      ...(s.datasetUpdatedAt ? { datasetUpdatedAt: s.datasetUpdatedAt } : {}),
    })),
  };
}

export function clearancesFromPoints(
  points: AwarenessPointCollection,
): FeatureCollection<Point, ClearanceRecord> {
  return {
    type: "FeatureCollection",
    features: points.features
      .filter(f => f.properties.kind === "clearance")
      .map(f => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: toClearanceRecord(f.properties),
      })),
  };
}

/** Parkway / ban corridor lines → legacy parkway props. */
export function parkwaysFromLines(lines: AwarenessLineCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines.features
      .filter(
        f =>
          f.properties.kind === "parkway" ||
          str(f.properties.extras?.layer) === "parkway",
      )
      .map(f => {
        const p = f.properties;
        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            id: p.id,
            name: p.name,
            kind: "parkway",
            restriction: p.access.restriction || null,
            commercialBan: Boolean(p.access.commercialBan),
            gcpTruckException: Boolean(p.access.commercialException),
            passengerOnlyHeightInches: p.access.passengerOnlyHeightInches ?? null,
            labelLng: num(p.extras?.labelLng),
            labelLat: num(p.extras?.labelLat),
            state: p.state,
            extras: p.extras || {},
            notes: p.notes,
            sources: p.sources,
          },
        };
      }),
  };
}

/** Posted-load pins. */
export function postedLoadFromPoints(points: AwarenessPointCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.features
      .filter(f => f.properties.kind === "posted_load")
      .map(f => {
        const p = f.properties;
        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            id: p.id,
            bin: str(p.extras?.bin, p.id),
            name: p.name,
            county: p.county || p.town || "",
            postedLoadTons: p.limits.postedLoadTons ?? p.limits.weightTons ?? null,
            kind: "posted-load",
            state: p.state,
            extras: p.extras || {},
            notes: p.notes,
            sources: p.sources,
          },
        };
      }),
  };
}

function facilityProps(p: AwarenessProperties) {
  const kind =
    p.kind === "crossing"
      ? str(p.extras?.facilityKind, "bridge")
      : p.kind === "clearance" || p.kind === "posted_load"
        ? "road"
        : p.kind;
  return {
    id: p.id,
    name: p.name,
    kind,
    operator: p.operator ?? null,
    heightInches: p.limits.heightInches ?? null,
    heightUpperInches: p.limits.heightUpperInches ?? null,
    heightLowerInches: p.limits.heightLowerInches ?? null,
    widthInches: p.limits.widthInches ?? null,
    weightTons: p.limits.weightTons ?? null,
    postedLoadTons: p.limits.postedLoadTons ?? null,
    trucksBanned: Boolean(p.access.trucksBanned),
    commercialBan: Boolean(p.access.commercialBan),
    gcpTruckException: Boolean(p.access.commercialException),
    passengerOnlyHeightInches: p.access.passengerOnlyHeightInches ?? null,
    noTrucksLower: Boolean(p.access.noTrucksLower),
    noHazmat: Boolean(p.access.hazmatBanned),
    restrictionNote: p.access.restriction ?? null,
    geometryRole: p.geometryRole,
    state: p.state,
    county: p.county ?? null,
    town: p.town ?? null,
    extras: p.extras || {},
    notes: p.notes,
    sources: p.sources,
    labelLng: num(p.extras?.labelLng),
    labelLat: num(p.extras?.labelLat),
  };
}

const FACILITY_KINDS = new Set<AwarenessKind>([
  "bridge",
  "tunnel",
  "parkway",
  "underpass",
  "road",
  "highway",
  "crossing",
]);

/** Facilities (points + lines) → flat facility props for status eval. */
export function facilitiesFromAwareness(
  points: AwarenessPointCollection,
  lines: AwarenessLineCollection,
): FeatureCollection {
  const candidates: AwarenessFeature[] = [
    ...points.features.filter(
      f => FACILITY_KINDS.has(f.properties.kind) || str(f.properties.extras?.layer) === "facility",
    ),
    ...lines.features.filter(
      f => FACILITY_KINDS.has(f.properties.kind) || str(f.properties.extras?.layer) === "facility",
    ),
  ];

  const byId = new Map<
    string,
    ReturnType<typeof facilityProps> & { geometry: AwarenessFeature["geometry"] }
  >();
  for (const f of candidates) {
    const existing = byId.get(f.properties.id);
    const taggedFacility = str(f.properties.extras?.layer) === "facility";
    if (existing && !taggedFacility && str(existing.extras?.layer) === "facility") continue;
    byId.set(f.properties.id, { ...facilityProps(f.properties), geometry: f.geometry });
  }

  return {
    type: "FeatureCollection",
    features: [...byId.values()].map(({ geometry, ...properties }) => ({
      type: "Feature" as const,
      geometry,
      properties,
    })),
  };
}

/** Major crossing dots. */
export function majorCrossingsFromPoints(points: AwarenessPointCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.features
      .filter(
        f =>
          f.properties.kind === "crossing" ||
          str(f.properties.extras?.layer) === "major-crossing",
      )
      .map(f => {
        const p = f.properties;
        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            id: p.id,
            name: p.name,
            kind: str(p.extras?.facilityKind, p.kind === "crossing" ? "bridge" : p.kind),
            operator: p.operator ?? null,
            heightIn: p.limits.heightInches ?? null,
            widthIn: p.limits.widthInches ?? null,
            noHazmat: Boolean(p.access.hazmatBanned),
            state: p.state,
            extras: p.extras || {},
            notes: p.notes,
            sources: p.sources,
          },
        };
      }),
  };
}
