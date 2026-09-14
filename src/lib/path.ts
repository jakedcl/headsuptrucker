import type { Feature, Point } from "geojson";
import type { ClearanceRecord } from "./types";

export const COVERAGE = { minLng: -74.3, maxLng: -71.8, minLat: 40.45, maxLat: 41.35 };
export const CORRIDOR_METERS = 120;
const EARTH_M = 6371000;

export type LngLat = [number, number];
export type Place = { label: string; lng: number; lat: number };
export type DrivePath = { from: Place; to: Place; coordinates: number[][]; distanceMeters: number };

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
