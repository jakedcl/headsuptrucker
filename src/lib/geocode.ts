import { COVERAGE, inCoverage, type Place } from "@/lib/path";

export const NOMINATIM_UA = "HeadsUpClearanceMap/0.1 (https://github.com/jakedcl/headsuptrucker)";
const NOMINATIM = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";

export function cleanPlaceQuery(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function shortLabel(displayName: string, fallback: string) {
  return (displayName || fallback).split(",").slice(0, 3).join(",").trim();
}

type NominatimHit = { display_name?: string; lon?: string; lat?: string };

async function nominatimSearch(query: string, limit: number) {
  const url = new URL("/search", NOMINATIM.endsWith("/") ? NOMINATIM : `${NOMINATIM}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("viewbox", `${COVERAGE.minLng},${COVERAGE.maxLat},${COVERAGE.maxLng},${COVERAGE.minLat}`);
  url.searchParams.set("bounded", "1");
  const response = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("geocode-unavailable");
  const rows = await response.json() as NominatimHit[];
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const hit of rows) {
    const lng = Number(hit.lon), lat = Number(hit.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !inCoverage(lng, lat)) continue;
    const label = shortLabel(hit.display_name || "", query);
    const key = `${label}|${lng.toFixed(5)}|${lat.toFixed(5)}`;
    if (seen.has(key) || !label) continue;
    seen.add(key);
    places.push({ label, lng, lat });
  }
  return places;
}

export async function searchPlaces(query: string, limit = 5) {
  const cleaned = cleanPlaceQuery(query);
  if (cleaned.length < 2) return [];
  return nominatimSearch(cleaned, Math.min(Math.max(limit, 1), 8));
}

export async function resolvePlace(query: string) {
  return (await searchPlaces(query, 1))[0] || null;
}

export function parsePlaceInput(value: unknown): Place | string | null {
  if (typeof value === "string") {
    const cleaned = cleanPlaceQuery(value);
    return cleaned.length >= 2 ? cleaned : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { label?: unknown; lng?: unknown; lat?: unknown };
  const label = cleanPlaceQuery(record.label);
  const lng = Number(record.lng), lat = Number(record.lat);
  if (!label || !Number.isFinite(lng) || !Number.isFinite(lat) || !inCoverage(lng, lat)) return null;
  return { label, lng, lat };
}

export async function placeFromInput(value: unknown) {
  const parsed = parsePlaceInput(value);
  if (!parsed) return null;
  if (typeof parsed !== "string") return parsed;
  return resolvePlace(parsed);
}
