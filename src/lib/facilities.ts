import {
  evaluateFacility,
  type FacilityLimits,
  type FacilityEvaluation,
  type VehicleForStatus,
} from "@/lib/facility-status";

/** Normalize GeoJSON / curated facility props into the status model. */
export function toFacilityLimits(props: Record<string, unknown>): FacilityLimits {
  return {
    id: String(props.id || ""),
    name: String(props.name || "Facility"),
    kind: (props.kind as FacilityLimits["kind"]) || "road",
    operator: (props.operator as string) || null,
    heightInches: num(props.heightInches),
    heightUpperInches: num(props.heightUpperInches),
    heightLowerInches: num(props.heightLowerInches),
    widthInches: num(props.widthInches),
    weightTons: num(props.weightTons),
    postedLoadTons: num(props.postedLoadTons),
    trucksBanned: bool(props.trucksBanned),
    commercialBan: bool(props.commercialBan),
    gcpTruckException: bool(props.gcpTruckException),
    passengerOnlyHeightInches: num(props.passengerOnlyHeightInches),
    noTrucksLower: bool(props.noTrucksLower),
    noHazmat: bool(props.noHazmat),
    restrictionNote: (props.restrictionNote as string) || null,
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return Boolean(value);
}

export function annotateFacilities(
  collection: import("geojson").FeatureCollection,
  vehicle: VehicleForStatus,
): import("geojson").FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map(feature => {
      const limits = toFacilityLimits((feature.properties || {}) as Record<string, unknown>);
      const evaluation = evaluateFacility(limits, vehicle);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          ...limits,
          status: evaluation.status,
          summary: evaluation.summary,
        },
      };
    }),
  };
}

export function evaluateFacilityProps(
  props: Record<string, unknown>,
  vehicle: VehicleForStatus,
): FacilityEvaluation {
  return evaluateFacility(toFacilityLimits(props), vehicle);
}
