export type Severity = "danger" | "caution" | "clear";

export function getClearanceSeverity(clearance: number, vehicle: number): Severity {
  if (!Number.isFinite(clearance) || !Number.isFinite(vehicle) || clearance <= 0 || vehicle <= 0) throw new Error("Heights must be positive numbers.");
  const margin = clearance - vehicle;
  return margin <= 0 ? "danger" : margin <= 12 ? "caution" : "clear";
}

export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

export function parseVehicleHeight(feet: string, inches: string): number | null {
  if (!/^\d{1,2}$/.test(feet) || !/^\d{1,2}$/.test(inches)) return null;
  const ft = Number(feet), inc = Number(inches), total = ft * 12 + inc;
  return inc < 12 && total >= 12 && total <= 240 ? total : null;
}

export function parseHeightParam(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const height = Number(value);
  return height >= 12 && height <= 240 ? height : null;
}

export function describeMargin(clearance: number, vehicle: number): string {
  const margin = clearance - vehicle;
  if (margin === 0) return "Equal to your vehicle height";
  return `${Math.abs(margin)}″ ${margin < 0 ? "lower than" : "above"} your vehicle height`;
}
