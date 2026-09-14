import { COVERAGE, inCoverage, type Place } from "@/lib/path";

const USER_AGENT = "HeadsUpClearanceMap/0.1 (https://github.com/jakedcl/headsuptrucker)";
const NOMINATIM = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const OSRM = process.env.OSRM_URL || "https://router.project-osrm.org";

function parseQuery(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function geocode(query: string): Promise<Place | null> {
  const url = new URL("/search", NOMINATIM.endsWith("/") ? NOMINATIM : `${NOMINATIM}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", `${COVERAGE.minLng},${COVERAGE.maxLat},${COVERAGE.maxLng},${COVERAGE.minLat}`);
  url.searchParams.set("bounded", "1");
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("geocode-unavailable");
  const rows = await response.json() as { display_name?: string; lon?: string; lat?: string }[];
  const hit = Array.isArray(rows) ? rows[0] : null;
  const lng = Number(hit?.lon), lat = Number(hit?.lat);
  if (!hit || !Number.isFinite(lng) || !Number.isFinite(lat) || !inCoverage(lng, lat)) return null;
  return { label: (hit.display_name || query).split(",").slice(0, 3).join(",").trim(), lng, lat };
}

async function drivingLine(from: Place, to: Place) {
  const url = `${OSRM.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("route-unavailable");
  const body = await response.json() as { code?: string; routes?: { distance?: number; geometry?: { type?: string; coordinates?: number[][] } }[] };
  const route = body.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (body.code !== "Ok" || route?.geometry?.type !== "LineString" || !Array.isArray(coords) || coords.length < 2) return null;
  const coordinates = coords.filter(pair => Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1])).map(pair => [pair[0], pair[1]] as [number, number]);
  if (coordinates.length < 2) return null;
  return { coordinates, distanceMeters: typeof route.distance === "number" ? route.distance : 0 };
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Enter a starting place and a destination.", 400); }
  const fromQuery = parseQuery((body as { from?: unknown }).from);
  const toQuery = parseQuery((body as { to?: unknown }).to);
  if (fromQuery.length < 2 || toQuery.length < 2) return jsonError("Enter a starting place and a destination in NYC or Long Island.", 400);
  if (fromQuery.toLowerCase() === toQuery.toLowerCase()) return jsonError("Pick two different places.", 400);
  try {
    const from = await geocode(fromQuery);
    await new Promise(resolve => setTimeout(resolve, 1100));
    const to = await geocode(toQuery);
    if (!from) return jsonError("Couldn’t find that starting place in NYC or Long Island.", 404);
    if (!to) return jsonError("Couldn’t find that destination in NYC or Long Island.", 404);
    const route = await drivingLine(from, to);
    if (!route) return jsonError("Couldn’t trace a driving path between those places. Try nearby street names.", 502);
    return Response.json({ from, to, coordinates: route.coordinates, distanceMeters: route.distanceMeters });
  } catch {
    return jsonError("Place lookup is unavailable right now. You can still pan the map.", 503);
  }
}
