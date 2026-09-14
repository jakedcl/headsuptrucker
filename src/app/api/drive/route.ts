import { NOMINATIM_UA, placeFromInput } from "@/lib/geocode";
import type { Place } from "@/lib/path";

const OSRM = process.env.OSRM_URL || "https://router.project-osrm.org";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function drivingLine(from: Place, to: Place) {
  const url = `${OSRM.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const response = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
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
  const fromInput = (body as { from?: unknown }).from;
  const toInput = (body as { to?: unknown }).to;
  try {
    const from = await placeFromInput(fromInput);
    if (typeof fromInput === "string" && typeof toInput === "string") await new Promise(resolve => setTimeout(resolve, 1100));
    const to = await placeFromInput(toInput);
    if (!from) return jsonError("Couldn’t find that starting place in NYC or Long Island.", 404);
    if (!to) return jsonError("Couldn’t find that destination in NYC or Long Island.", 404);
    if (from.label.toLowerCase() === to.label.toLowerCase() && Math.abs(from.lng - to.lng) < 1e-5 && Math.abs(from.lat - to.lat) < 1e-5) {
      return jsonError("Pick two different places.", 400);
    }
    const route = await drivingLine(from, to);
    if (!route) return jsonError("Couldn’t trace a driving path between those places. Try nearby street names.", 502);
    return Response.json({ from, to, coordinates: route.coordinates, distanceMeters: route.distanceMeters });
  } catch {
    return jsonError("Place lookup is unavailable right now. You can still pan the map.", 503);
  }
}
