import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export const NYC_URL = "https://www.nyc.gov/html/dot/downloads/misc/lowbridges_citywide_data_71309.kml";
export type LegacyRecord = {
  id: string; longitude: number; latitude: number; road: string; crossing: string; borough: string;
  clearanceInches: number | null; directional: Record<string, number>; raw: Record<string, string>;
  clearanceType: "unverified"; sourceDate: "2009-07-14";
};

export function parseFeetInches(feet: unknown, inches: unknown): number | null {
  if (!/^\d+$/.test(String(feet)) || !/^\d+$/.test(String(inches))) return null;
  const f = Number(feet), i = Number(inches);
  return f > 0 && f < 30 && i >= 0 && i < 12 ? f * 12 + i : null;
}

export function normalizeNyc(kml: string): LegacyRecord[] {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const document = parser.parse(kml)?.kml?.Document;
  if (!document) throw new Error("NYC source is not the expected KML document");
  const records: LegacyRecord[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const n = node as Record<string, unknown>;
    if (n.Point && typeof n.description === "string") {
      const raw: Record<string, string> = {};
      const clean = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();
      for (const row of n.description.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => clean(m[1]));
        if (cells.length === 2) raw[cells[0]] = cells[1];
      }
      const coords = String((n.Point as Record<string, unknown>).coordinates).trim().split(",").map(Number);
      const directional: Record<string, number> = {};
      for (const d of ["Northbound", "Southbound", "Eastbound", "Westbound"]) {
        const value = parseFeetInches(raw[`${d} Feet`], raw[`${d} Inches`]);
        if (value !== null) directional[d] = value;
      }
      const identity = JSON.stringify([coords, raw]);
      records.push({ id: `nyc-${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`, longitude: coords[0], latitude: coords[1],
        road: raw.Highway || "", crossing: raw.BRIDGE || "", borough: raw.Borough || "", clearanceInches: parseFeetInches(raw.BRIDGE_CLEARANCE_FEET, raw.BRIDGE_CLEARANCE_INCHES),
        directional, raw, clearanceType: "unverified", sourceDate: "2009-07-14" });
      return;
    }
    Object.values(n).forEach(visit);
  }
  visit(document);
  if (!records.length) throw new Error("NYC KML has no readable placemarks");
  return records;
}
