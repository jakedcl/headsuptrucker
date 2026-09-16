/**
 * Merge CTDOT parkway restrictions + posted-load bridges into the existing
 * NYC/LI GeoJSON files so the map keeps one shared dataset (no CT-only layers).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection } from "geojson";

import { COVERAGE } from "../src/lib/path";
import {
  CTDOT_PARKWAYS_URL,
  normalizeCtdotParkways,
  parkwayToFacility,
  type CtdotParkwayRaw,
} from "./sources/ctdot-parkways";
import {
  CTDOT_BRIDGES_URL,
  normalizeCtdotPostedLoad,
  type CtdotBridgeRaw,
} from "./sources/ctdot-posted-load";

const ROOT = process.cwd();
const BUILT = path.join(ROOT, "data", "built");
const RAW = path.join(ROOT, "data", "raw");

async function fetchGeoJson(url: string, where: string) {
  const features: FeatureCollection["features"] = [];
  let offset = 0;
  for (;;) {
    const query = new URL(`${url}/query`);
    query.searchParams.set("where", where);
    query.searchParams.set("outFields", "*");
    query.searchParams.set("returnGeometry", "true");
    query.searchParams.set("outSR", "4326");
    query.searchParams.set("f", "geojson");
    query.searchParams.set("resultRecordCount", "2000");
    query.searchParams.set("resultOffset", String(offset));
    const response = await fetch(query, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`CTDOT fetch failed (${response.status}): ${query}`);
    const body = (await response.json()) as FeatureCollection;
    const batch = body.features || [];
    features.push(...batch);
    if (batch.length < 2000) break;
    offset += batch.length;
  }
  return { type: "FeatureCollection" as const, features };
}

function isCtId(id: unknown) {
  return typeof id === "string" && (id.startsWith("parkway-ct-") || id.startsWith("load-ct-"));
}

async function main() {
  console.log("Fetching CTDOT parkway restrictions...");
  const parkwayRaw = await fetchGeoJson(CTDOT_PARKWAYS_URL, "1=1");
  await mkdir(RAW, { recursive: true });
  await writeFile(path.join(RAW, "ctdot-parkways.geojson"), `${JSON.stringify(parkwayRaw)}\n`);
  const ctParkways = normalizeCtdotParkways(parkwayRaw.features as CtdotParkwayRaw[]);
  console.log(`  ${parkwayRaw.features.length} segments → ${ctParkways.length} parkways`);

  console.log("Fetching CTDOT bridges with posted loads...");
  const loadWhere = [
    "PostedLdSingleUnit_6000034 IS NOT NULL",
    "PostedLoadSemiTrlr_6000036 IS NOT NULL",
    "PostedLoad4Axle_6000038 IS NOT NULL",
    "PostedLoad3S2_6000040 IS NOT NULL",
    "PostedLoadAll_6000042 IS NOT NULL",
  ].join(" OR ");
  const bridgeRaw = await fetchGeoJson(CTDOT_BRIDGES_URL, loadWhere);
  await writeFile(path.join(RAW, "ctdot-posted-load.geojson"), `${JSON.stringify(bridgeRaw)}\n`);
  const ctLoads = normalizeCtdotPostedLoad(bridgeRaw.features as CtdotBridgeRaw[], {
    minLng: COVERAGE.minLng,
    maxLng: COVERAGE.maxLng,
    minLat: COVERAGE.minLat,
    maxLat: COVERAGE.maxLat,
  });
  console.log(`  ${bridgeRaw.features.length} posted-load bridges → ${ctLoads.length} in coverage`);

  const parkwaysPath = path.join(BUILT, "parkways-nyc-li.geojson");
  const loadsPath = path.join(BUILT, "posted-load-nyc-li.geojson");
  const facilitiesPath = path.join(BUILT, "facilities-nyc-li.geojson");
  const metaPath = path.join(BUILT, "awareness-metadata.json");

  const parkways = JSON.parse(await readFile(parkwaysPath, "utf8")) as FeatureCollection;
  const loads = JSON.parse(await readFile(loadsPath, "utf8")) as FeatureCollection;
  const facilities = JSON.parse(await readFile(facilitiesPath, "utf8")) as FeatureCollection;
  const meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;

  parkways.features = [...parkways.features.filter(f => !isCtId(f.properties?.id)), ...ctParkways];
  loads.features = [...loads.features.filter(f => !isCtId(f.properties?.id)), ...ctLoads];
  const ctFacilities = ctParkways.map(parkwayToFacility);
  facilities.features = [
    ...facilities.features.filter(f => !isCtId(f.properties?.id)),
    ...ctFacilities,
  ];

  await writeFile(parkwaysPath, `${JSON.stringify(parkways)}\n`);
  await writeFile(loadsPath, `${JSON.stringify(loads)}\n`);
  await writeFile(facilitiesPath, `${JSON.stringify(facilities)}\n`);

  const sources = (meta.sources || {}) as Record<string, Record<string, unknown>>;
  sources.postedLoad = {
    ...(sources.postedLoad || {}),
    file: "posted-load-nyc-li.geojson",
    count: loads.features.length,
    unit: "US tons",
    ny: "NYSDOT CommVehicleDataFeed /0",
    ct: "CTDOT Bridges posted-load fields",
    ctCount: ctLoads.length,
  };
  sources.parkways = {
    ...(sources.parkways || {}),
    file: "parkways-nyc-li.geojson",
    facilityCount: parkways.features.length,
    ny: "NYSDOT CommVehicleDataFeed /2 Regions 10–11 + OSM geometry",
    ct: "CTDOT OSTA Parkway Restrictions",
    ctCount: ctParkways.length,
  };
  meta.sources = sources;
  meta.builtAt = new Date().toISOString();
  const notes = Array.isArray(meta.notes) ? meta.notes.filter((n): n is string => typeof n === "string") : [];
  if (!notes.some(n => n.includes("CTDOT parkways"))) {
    notes.push("CTDOT parkways + posted-load bridges are merged into the same GeoJSON as NYC/LI.");
  }
  meta.notes = notes;
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  console.log(`Wrote ${parkwaysPath} (${parkways.features.length} parkways)`);
  console.log(`Wrote ${loadsPath} (${loads.features.length} posted-load points)`);
  console.log(`Wrote ${facilitiesPath} (${facilities.features.length} facilities)`);
  console.log(`Wrote ${metaPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
