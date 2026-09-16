/**
 * Canonical awareness schema for the multi-source pipeline.
 *
 * Geometry roles:
 * - line  → roads / bridges / tunnels / parkways / highways (clickable corridors)
 * - point → posted clearances, overpasses, weight pins, point facilities
 *
 * Every adapter maps agency-specific fields into these shapes. Extra agency
 * attributes go in `extras` so we never invent values, but also never throw
 * away useful provenance.
 *
 * Build flow:
 *   fetch          → data/raw/
 *   normalize      → data/built/{layer}.geojson  (pipeline intermediates)
 *   merge/dedupe   → public/data/awareness-lines.geojson
 *                    public/data/awareness-points.geojson
 *
 * The map reads only the unified awareness files (plus optional NYC layers
 * like truck routes). Intermediates stay in data/built/ and are not served.
 */

import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from "geojson";

export type AwarenessState = "NY" | "CT" | "NJ" | "PA";

/** What the feature is for map styling / filters. */
export type AwarenessKind =
  | "road"
  | "highway"
  | "parkway"
  | "bridge"
  | "tunnel"
  | "underpass"
  | "overpass"
  | "clearance"
  | "posted_load"
  | "truck_route"
  | "closure"
  | "loading_zone"
  | "crossing";

export type AwarenessGeometryRole = "line" | "point";

/**
 * Dimensional / legal limits. Null / omitted = unknown (never invent).
 * For posted clearances, `heightInches` is the max vehicle height that fits.
 * Min/max pairs are for ranges when a source publishes both ends.
 */
export type AwarenessLimits = {
  heightInches?: number | null;
  heightInchesMin?: number | null;
  heightInchesMax?: number | null;
  /** Deck / direction splits when the source has them. */
  heightUpperInches?: number | null;
  heightLowerInches?: number | null;
  heightUnderInches?: number | null;
  heightOnInches?: number | null;

  widthInches?: number | null;
  widthInchesMin?: number | null;
  widthInchesMax?: number | null;

  weightTons?: number | null;
  weightTonsMin?: number | null;
  weightTonsMax?: number | null;
  postedLoadTons?: number | null;
};

/** Commercial / vehicle-type access rules. */
export type AwarenessAccess = {
  commercialBan?: boolean;
  trucksBanned?: boolean;
  busesBanned?: boolean;
  hazmatBanned?: boolean;
  /** Grand Central–style limited commercial allowance. */
  commercialException?: boolean;
  passengerOnlyHeightInches?: number | null;
  noTrucksLower?: boolean;
  /** Free-text agency rule when enums are not enough. */
  restriction?: string | null;
  vehicleTypesAllowed?: string[];
  vehicleTypesBanned?: string[];
};

export type AwarenessProvenance = {
  /** Stable adapter id, e.g. `nysdot-posted-height`. */
  sourceId: string;
  agency: string;
  dataset: string;
  recordId: string;
  sourceUrl: string;
  retrievedAt: string;
  datasetUpdatedAt?: string;
};

/**
 * Shared properties for every awareness feature after normalize.
 * Keep map-facing fields flat so MapLibre + detail panels stay simple.
 */
export type AwarenessProperties = {
  id: string;
  name: string;
  kind: AwarenessKind;
  geometryRole: AwarenessGeometryRole;
  state: AwarenessState;
  county?: string | null;
  town?: string | null;
  operator?: string | null;
  road?: string | null;
  crossing?: string | null;
  location?: string | null;
  direction?: string | null;
  appliesTo?: "under" | "on" | null;
  limits: AwarenessLimits;
  access: AwarenessAccess;
  notes: string[];
  sources: AwarenessProvenance[];
  /** Leftover agency fields worth keeping (BIN, structure number, etc.). */
  extras?: Record<string, string | number | boolean | null>;
};

export type AwarenessPointFeature = Feature<Point, AwarenessProperties>;
export type AwarenessLineFeature = Feature<LineString | MultiLineString, AwarenessProperties>;
export type AwarenessFeature = AwarenessPointFeature | AwarenessLineFeature;

export type AwarenessPointCollection = FeatureCollection<Point, AwarenessProperties>;
export type AwarenessLineCollection = FeatureCollection<
  LineString | MultiLineString,
  AwarenessProperties
>;

/** Empty shells for adapters / merge step. */
export function emptyPointCollection(): AwarenessPointCollection {
  return { type: "FeatureCollection", features: [] };
}

export function emptyLineCollection(): AwarenessLineCollection {
  return { type: "FeatureCollection", features: [] };
}

export function isPointFeature(f: AwarenessFeature): f is AwarenessPointFeature {
  return f.properties.geometryRole === "point" && f.geometry?.type === "Point";
}

export function isLineFeature(f: AwarenessFeature): f is AwarenessLineFeature {
  return (
    f.properties.geometryRole === "line" &&
    (f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString")
  );
}
