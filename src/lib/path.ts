import type { Feature, Point } from "geojson";
import type { ClearanceRecord } from "./types";

/** NYC, Long Island, Hudson Valley, SW CT, and NYC-facing NJ. */
export const COVERAGE = { minLng: -74.55, maxLng: -71.8, minLat: 40.3, maxLat: 41.7 };
export const CORRIDOR_METERS = 120;
const EARTH_M = 6371000;

export type LngLat = [number, number];
export type Place = { label: string; lng: number; lat: number };
export type DriveRoute = {
  coordinates: number[][];
  distanceMeters: number;
  durationSeconds: number;
};

export type DriveResult = {
  from: Place;
  to: Place;
  routes: DriveRoute[];
};

export type DrivePath = { from: Place; to: Place; coordinates: number[][]; distanceMeters: number; routes?: DriveRoute[] };

export function inCoverage(lng: number, lat: number) {
  return lng >= COVERAGE.minLng && lng <= COVERAGE.maxLng && lat >= COVERAGE.minLat && lat <= COVERAGE.maxLat;
}

export function haversineMeters(a: LngLat, b: LngLat) {
  const toR = (d: number) => d * Math.PI / 180;
  const dLat = toR(b[1] - a[1]), dLng = toR(b[0] - a[0]);
  const sin = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(sin)));
}

function toMeters(point: number[], origin: number[]): [number, number] {
  const x = (point[0] - origin[0]) * 111320 * Math.cos(origin[1] * Math.PI / 180);
  const y = (point[1] - origin[1]) * 110540;
  return [x, y];
}

function distanceToSegmentMeters(point: LngLat, start: number[], end: number[]) {
  const p = toMeters(point, start), e = toMeters(end, start);
  const length2 = e[0] ** 2 + e[1] ** 2;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (p[0] * e[0] + p[1] * e[1]) / length2));
  const dx = p[0] - e[0] * t, dy = p[1] - e[1] * t;
  return { meters: Math.hypot(dx, dy), t, segmentMeters: Math.hypot(e[0], e[1]) };
}

export function distanceToPolylineMeters(point: LngLat, line: number[][]) {
  let nearest = Infinity;
  for (let i = 1; i < line.length; i++) nearest = Math.min(nearest, distanceToSegmentMeters(point, line[i - 1], line[i]).meters);
  return nearest;
}

export function distanceAlongPolylineMeters(point: LngLat, line: number[][]) {
  let best = { score: Infinity, along: 0 };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const part = distanceToSegmentMeters(point, line[i - 1], line[i]);
    if (part.meters < best.score) best = { score: part.meters, along: walked + part.segmentMeters * part.t };
    walked += part.segmentMeters;
  }
  return best.along;
}

export function featuresAlongRoute(features: Feature<Point, ClearanceRecord>[], line: number[][], corridor = CORRIDOR_METERS) {
  if (line.length < 2) return [];
  return features.map(feature => {
    const point = feature.geometry.coordinates as LngLat;
    return { feature, offset: distanceToPolylineMeters(point, line), along: distanceAlongPolylineMeters(point, line) };
  }).filter(item => item.offset <= corridor)
    .sort((a, b) => a.along - b.along || a.feature.properties.id.localeCompare(b.feature.properties.id))
    .map(item => item.feature);
}

/** True when two OSRM candidates are meaningfully different paths. */
export function routeLinesDiffer(
  a: number[][],
  b: number[][],
  distanceA: number,
  distanceB: number,
) {
  const shorter = Math.min(distanceA, distanceB);
  const gap = Math.abs(distanceA - distanceB);
  if (gap > Math.max(1500, shorter * 0.08)) return true;
  if (a.length < 2 || b.length < 2) return false;
  const step = Math.max(1, Math.floor(a.length / 12));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += step) {
    sum += distanceToPolylineMeters(a[i] as LngLat, b);
    count += 1;
  }
  return count > 0 && sum / count > 450;
}

export function keepDistinctRoutes(routes: DriveRoute[]) {
  const kept: DriveRoute[] = [];
  for (const route of routes) {
    if (route.coordinates.length < 2) continue;
    if (kept.every(existing => routeLinesDiffer(
      route.coordinates,
      existing.coordinates,
      route.distanceMeters,
      existing.distanceMeters,
    ))) {
      kept.push(route);
    }
  }
  return kept.slice(0, 3);
}

export function formatDriveMiles(meters: number) {
  const miles = meters / 1609.344;
  return miles >= 10 ? `${miles.toFixed(0)} mi` : `${miles.toFixed(1)} mi`;
}

export function formatDriveMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

