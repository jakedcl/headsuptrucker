/**
 * Facility go / no-go for a vehicle profile.
 *
 * Height is always evaluated when the facility has a height limit.
 * Width / weight only count when the user entered them — if omitted,
 * we treat those dimensions as OK (unknown ≠ fail).
 */

export type FacilityKind = "bridge" | "tunnel" | "parkway" | "underpass" | "road";

export type LimitStatus = "danger" | "caution" | "ok" | "unknown";

export type FacilityLimits = {
  id: string;
  name: string;
  kind: FacilityKind;
  operator?: string | null;
  /** Posted / restricted vertical clearance in inches, if known. */
  heightInches?: number | null;
  heightUpperInches?: number | null;
  heightLowerInches?: number | null;
  widthInches?: number | null;
  weightTons?: number | null;
  postedLoadTons?: number | null;
  trucksBanned?: boolean;
  commercialBan?: boolean;
  /** Grand Central–style limited commercial allowance. */
  gcpTruckException?: boolean;
  passengerOnlyHeightInches?: number | null;
  noTrucksLower?: boolean;
  noHazmat?: boolean;
  restrictionNote?: string | null;
};

export type VehicleForStatus = {
  heightInches: number;
  widthInches: number | null;
  weightTons: number | null;
  commercial: boolean;
};

export type StatusReason = {
  dimension: "height" | "width" | "weight" | "commercial" | "access";
  status: LimitStatus;
  label: string;
  detail: string;
};

export type FacilityEvaluation = {
  status: LimitStatus;
  reasons: StatusReason[];
  summary: string;
};

function worst(a: LimitStatus, b: LimitStatus): LimitStatus {
  const rank: Record<LimitStatus, number> = { danger: 3, caution: 2, unknown: 1, ok: 0 };
  return rank[a] >= rank[b] ? a : b;
}

function formatIn(inches: number) {
  const feet = Math.floor(inches / 12);
  const rem = Math.round(inches % 12);
  return rem ? `${feet}′${rem}″` : `${feet}′`;
}

/** Effective posted height for comparison (prefer lower deck when present). */
export function effectiveHeightLimit(facility: FacilityLimits): number | null {
  const candidates = [
    facility.heightInches,
    facility.heightLowerInches,
    facility.heightUpperInches,
    facility.passengerOnlyHeightInches,
  ].filter((n): n is number => typeof n === "number" && n > 0);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

export function evaluateFacility(
  facility: FacilityLimits,
  vehicle: VehicleForStatus,
): FacilityEvaluation {
  const reasons: StatusReason[] = [];
  const heightLimit = effectiveHeightLimit(facility);

  if (heightLimit != null) {
    const margin = heightLimit - vehicle.heightInches;
    if (margin <= 0) {
      reasons.push({
        dimension: "height",
        status: "danger",
        label: "Height",
        detail: `Posted ${formatIn(heightLimit)} — at or below your ${formatIn(vehicle.heightInches)}.`,
      });
    } else if (margin <= 12) {
      reasons.push({
        dimension: "height",
        status: "caution",
        label: "Height",
        detail: `Posted ${formatIn(heightLimit)} — only ${margin}″ above your vehicle.`,
      });
    } else {
      reasons.push({
        dimension: "height",
        status: "ok",
        label: "Height",
        detail: `Posted ${formatIn(heightLimit)} — clears your ${formatIn(vehicle.heightInches)}.`,
      });
    }
  }

  // Width: only when the user entered a width.
  if (vehicle.widthInches != null) {
    if (facility.widthInches != null) {
      if (vehicle.widthInches >= facility.widthInches) {
        reasons.push({
          dimension: "width",
          status: "danger",
          label: "Width",
          detail: `Limit ${formatIn(facility.widthInches)} — your ${formatIn(vehicle.widthInches)} does not fit.`,
        });
      } else {
        reasons.push({
          dimension: "width",
          status: "ok",
          label: "Width",
          detail: `Limit ${formatIn(facility.widthInches)} — clears your ${formatIn(vehicle.widthInches)}.`,
        });
      }
    } else {
      reasons.push({
        dimension: "width",
        status: "unknown",
        label: "Width",
        detail: "No posted width in our sources for this place.",
      });
    }
  }

  // Weight: only when the user entered a weight.
  if (vehicle.weightTons != null) {
    const load = facility.postedLoadTons ?? facility.weightTons ?? null;
    if (load != null) {
      if (vehicle.weightTons >= load) {
        reasons.push({
          dimension: "weight",
          status: "danger",
          label: "Weight",
          detail: `Posted ${load} t — your ${vehicle.weightTons} t is at or over the limit.`,
        });
      } else {
        reasons.push({
          dimension: "weight",
          status: "ok",
          label: "Weight",
          detail: `Posted ${load} t — clears your ${vehicle.weightTons} t.`,
        });
      }
    } else {
      reasons.push({
        dimension: "weight",
        status: "unknown",
        label: "Weight",
        detail: "No posted load in our sources for this place.",
      });
    }
  }

  if (facility.trucksBanned && vehicle.commercial) {
    reasons.push({
      dimension: "access",
      status: "danger",
      label: "Trucks",
      detail: "Trucks are not permitted on this crossing.",
    });
  }

  if (facility.commercialBan && vehicle.commercial) {
    if (facility.gcpTruckException) {
      reasons.push({
        dimension: "commercial",
        status: "caution",
        label: "Commercial",
        detail:
          facility.restrictionNote ||
          "Commercial vehicles banned except a limited GCP segment (check exception).",
      });
    } else {
      reasons.push({
        dimension: "commercial",
        status: "danger",
        label: "Commercial",
        detail: facility.restrictionNote || "Commercial / truck vehicles are not allowed.",
      });
    }
  } else if (facility.commercialBan && !vehicle.commercial) {
    reasons.push({
      dimension: "commercial",
      status: "ok",
      label: "Commercial",
      detail: "Commercial vehicles banned — fine if you are not commercial.",
    });
  }

  if (facility.noTrucksLower && vehicle.commercial) {
    reasons.push({
      dimension: "access",
      status: "caution",
      label: "Lower level",
      detail: "No trucks on the lower level — use upper where allowed.",
    });
  }

  if (facility.noHazmat) {
    // Informational only — we don't collect hazmat cargo yet, so this must not
    // turn a height-clear facility orange for every driver.
    reasons.push({
      dimension: "access",
      status: "ok",
      label: "Hazmat",
      detail: "Hazardous materials are prohibited here (FYI).",
    });
  }

  // Overall: ignore "unknown" (and pure FYI) when deciding go/no-go.
  const actionable = reasons.filter(r => r.status !== "unknown" && r.label !== "Hazmat");
  let status: LimitStatus = "ok";
  if (actionable.length === 0 && reasons.every(r => r.status === "unknown" || r.label === "Hazmat")) {
    status = reasons.some(r => r.status === "unknown") ? "unknown" : "ok";
  } else if (actionable.length === 0) status = "unknown";
  else status = actionable.reduce<LimitStatus>((acc, r) => worst(acc, r.status), "ok");

  const summary =
    status === "danger"
      ? "Not OK for your vehicle"
      : status === "caution"
        ? "Tight / restricted — check details"
        : status === "ok"
          ? "Looks OK for what we know"
          : "Not enough posted limits to judge";

  return { status, reasons, summary };
}
