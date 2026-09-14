/** EPSG:2263 — NAD83 / New York Long Island (ftUS) → WGS84. */

const DEG = Math.PI / 180;
const FEET_TO_M = 0.3048006096012192;
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);

const LAT0 = 40.16666666666666 * DEG;
const LON0 = -74 * DEG;
const PHI1 = 40.66666666666666 * DEG;
const PHI2 = 41.03333333333333 * DEG;
const FE = 984250 * FEET_TO_M;
const FN = 0;

function mFactor(phi: number) {
  return Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
}

function tFactor(phi: number) {
  const s = Math.sin(phi);
  return Math.tan(Math.PI / 4 - phi / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2);
}

const N = Math.log(mFactor(PHI1) / mFactor(PHI2)) / Math.log(tFactor(PHI1) / tFactor(PHI2));
const F0 = mFactor(PHI1) / (N * tFactor(PHI1) ** N);
const R0 = A * F0 * tFactor(LAT0) ** N;

/** Convert NY Long Island State Plane feet to [lng, lat] WGS84. */
export function statePlaneToLngLat(eastingFeet: number, northingFeet: number): [number, number] {
  const x = eastingFeet * FEET_TO_M - FE;
  const y = northingFeet * FEET_TO_M - FN;
  const r = Math.sign(N) * Math.hypot(x, R0 - y);
  const t = (r / (A * F0)) ** (1 / N);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    phi = Math.PI / 2 - 2 * Math.atan(t * ((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi))) ** (E / 2));
  }
  const lambda = LON0 + Math.atan2(x, R0 - y) / N;
  return [lambda / DEG, phi / DEG];
}

function parsePairList(body: string): [number, number][] | null {
  const coords: [number, number][] = [];
  for (const pair of body.split(",")) {
    const parts = pair.trim().split(/\s+/).map(Number);
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    const [lng, lat] = statePlaneToLngLat(parts[0], parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
    coords.push([
      Math.round(lng * 1e5) / 1e5,
      Math.round(lat * 1e5) / 1e5,
    ]);
  }
  return coords.length >= 2 ? coords : null;
}

/** Parse LINESTRING / MULTILINESTRING WKT in State Plane feet into WGS84 rings. */
export function parseStatePlaneLineWkt(wkt: string): [number, number][] | null {
  const trimmed = wkt.trim();
  const line = trimmed.match(/^LINESTRING\s*\((.+)\)$/i);
  if (line) return parsePairList(line[1]);

  const multi = trimmed.match(/^MULTILINESTRING\s*\((.+)\)$/i);
  if (!multi) return null;
  // Prefer the longest segment so MapLibre gets a single LineString.
  let best: [number, number][] | null = null;
  for (const segment of multi[1].match(/\([^()]+\)/g) ?? []) {
    const coords = parsePairList(segment.slice(1, -1));
    if (!coords) continue;
    if (!best || coords.length > best.length) best = coords;
  }
  return best;
}
