import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { COUNTIES, normalizeNysdot, type RawFeature } from "./sources/nysdot-posted-height";
import { normalizeNyc } from "./sources/nyc-low-bridges";
import { normalizeCtdot, type CtdotRawFeature } from "./sources/ctdot-posted-height";
import { normalizeNysdotPostedLoad, type NysdotLoadRaw } from "./sources/nysdot-posted-load";
import {
  NJ_TRUCK_MAP_2024,
  normalizeNjTruckMap,
  type BridgeCoord,
} from "./sources/nj-truck-map";
import { normalizeOsmNjMaxheight, type OsmElement } from "./sources/osm-nj-maxheight";

const read = (path: string) => readFile(path, "utf8");
const manifest = JSON.parse(await read("data/raw/manifest.json"));
for (const [name, expected] of Object.entries(manifest.hashes)) {
  // NJ snapshots are optional until data:fetch-nj has been run.
  if (name === "nj-truck-map-bridges.geojson" || name === "osm-nj-maxheight.json") {
    try {
      await read(`data/raw/${name}`);
    } catch {
      continue;
    }
  }
  const actual = createHash("sha256").update(await read(`data/raw/${name}`)).digest("hex");
  if (actual !== expected) throw new Error(`Raw snapshot hash mismatch: ${name}`);
}

const raw = JSON.parse(await read("data/raw/nysdot-statewide.geojson"));
if (!Array.isArray(raw.features) || raw.features.length !== manifest.nysdotCount || raw.exceededTransferLimit) {
  throw new Error("Incomplete NYSDOT snapshot");
}
const ctdotRaw = JSON.parse(await read("data/raw/ctdot-bridges.geojson"));
if (!Array.isArray(ctdotRaw.features) || ctdotRaw.features.length !== manifest.ctdotCount) {
  throw new Error("Incomplete CTDOT snapshot");
}

const nyc = normalizeNyc(await read("data/raw/nyc-low-bridges.kml"));
const normalized = normalizeNysdot(raw.features, manifest.retrievedAt);
const ctdot = normalizeCtdot(ctdotRaw.features as CtdotRawFeature[], manifest.retrievedAt);

/** Prefer agency/brochure points over nearby community OSM tags. */
const metersBetween = (a: number[], b: number[]) => {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

let njTruck = { features: [] as ReturnType<typeof normalizeNjTruckMap>["features"], rejected: [] as { id: string; reason: string }[] };
let osmNj = { features: [] as ReturnType<typeof normalizeOsmNjMaxheight>["features"], rejected: [] as { id: string; value: string; reason: string }[] };
try {
  const bridgesRaw = JSON.parse(await read("data/raw/nj-truck-map-bridges.geojson"));
  const coords = new Map<string, BridgeCoord>();
  for (const f of bridgesRaw.features || []) {
    const p = f.properties || {};
    const brkey = String(p.BRKEY || "");
    const published = String(p._truckMapStructure || "");
    const g = f.geometry;
    if (!brkey || g?.type !== "Point" || !Array.isArray(g.coordinates)) continue;
    const [lng, lat] = g.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const entry: BridgeCoord = {
      brkey,
      lng,
      lat,
      facility: typeof p.FACILITY === "string" ? p.FACILITY : undefined,
      featint: typeof p.FEATINT === "string" ? p.FEATINT : undefined,
    };
    coords.set(brkey, entry);
    coords.set(brkey.replace(/^0+/, ""), entry);
    if (published) {
      coords.set(published, entry);
      coords.set(published.replace(/^0+/, ""), entry);
    }
  }
  njTruck = normalizeNjTruckMap(
    NJ_TRUCK_MAP_2024,
    coords,
    manifest.njClearancesRetrievedAt || manifest.retrievedAt,
  );
} catch {
  njTruck = { features: [], rejected: [{ id: "*", reason: "nj-truck-map-bridges.geojson missing — run npm run data:fetch-nj" }] };
}

try {
  const osmRaw = JSON.parse(await read("data/raw/osm-nj-maxheight.json"));
  osmNj = normalizeOsmNjMaxheight(
    (osmRaw.elements || []) as OsmElement[],
    manifest.njClearancesRetrievedAt || manifest.retrievedAt,
  );
} catch {
  osmNj = { features: [], rejected: [{ id: "*", value: "", reason: "osm-nj-maxheight.json missing — run npm run data:fetch-nj" }] };
}

const unique = new Map<string, (typeof normalized.features)[number]>();
for (const f of [...normalized.features, ...ctdot.features, ...njTruck.features]) {
  const previous = unique.get(f.properties.id);
  if (previous && JSON.stringify(previous) !== JSON.stringify(f)) {
    throw new Error(`Conflicting duplicate ${f.properties.id}`);
  }
  unique.set(f.properties.id, f);
}

const agencyPoints = [...unique.values()].map(f => f.geometry.coordinates);
let osmKept = 0;
let osmDroppedNearAgency = 0;
for (const f of osmNj.features) {
  const nearAgency = agencyPoints.some(pt => metersBetween(pt, f.geometry.coordinates) <= 40);
  if (nearAgency) {
    osmDroppedNearAgency += 1;
    continue;
  }
  if (unique.has(f.properties.id)) continue;
  unique.set(f.properties.id, f);
  osmKept += 1;
}

const features = [...unique.values()].sort((a, b) => a.properties.id.localeCompare(b.properties.id));
if (features.length < 100) throw new Error("Unexpectedly few launch-area records; manual review required");
if (ctdot.features.length < 1) throw new Error("No CTDOT posted clearances after normalize; manual review required");

const distance = metersBetween;
const nyFeatures = features.filter(f => f.properties.state === "NY");
const candidates = nyc.flatMap(n =>
  nyFeatures
    .filter(f => f.properties.appliesTo === "under")
    .flatMap(f => {
      const meters = distance([n.longitude, n.latitude], f.geometry.coordinates);
      return meters <= 60
        ? [{
            nycId: n.id,
            nysdotId: f.properties.id,
            meters: Math.round(meters),
            nycRoad: n.road,
            nycCrossing: n.crossing,
            nysdotRoad: f.properties.road,
            nysdotCrossing: f.properties.crossing,
            nycInches: n.clearanceInches,
            postedInches: f.properties.postedClearanceInches,
            sameValue: n.clearanceInches === f.properties.postedClearanceInches,
          }]
        : [];
    }),
);

const counties = [...COUNTIES].map(county => ({
  county,
  sourceStructures: raw.features.filter((f: RawFeature) => f.properties.COUNTY_NAME === county).length,
  postedUnder: features.filter(f => f.properties.county === county && f.properties.appliesTo === "under").length,
  postedOn: features.filter(f => f.properties.county === county && f.properties.appliesTo === "on").length,
}));

const ctdotTowns = [...new Set(ctdot.features.map(f => f.properties.county))].sort().map(town => ({
  town,
  postedUnder: ctdot.features.filter(f => f.properties.county === town && f.properties.appliesTo === "under").length,
  postedOn: ctdot.features.filter(f => f.properties.county === town && f.properties.appliesTo === "on").length,
}));

const dates = [
  ...new Set(features.flatMap(f => f.properties.sources.flatMap(s => (s.datasetUpdatedAt ? [s.datasetUpdatedAt] : [])))),
].sort();

const stats = {
  retrievedAt: manifest.retrievedAt,
  sourceUpdatedAt: dates.at(-1) ?? null,
  nysdotStatewideStructures: raw.features.length,
  postedRecords: features.length,
  uniqueStructures: new Set(features.map(f => f.properties.structureId)).size,
  counties,
  ctdotSourceBridges: ctdotRaw.features.length,
  ctdotPostedRecords: ctdot.features.length,
  ctdotTowns,
  njTruckMapRecords: njTruck.features.length,
  njTruckMapRejected: njTruck.rejected.length,
  osmNjMaxheightRecords: osmKept,
  osmNjMaxheightParsed: osmNj.features.length,
  osmNjDroppedNearAgency: osmDroppedNearAgency,
  osmNjRejected: osmNj.rejected.length,
  nysdotPostedLoadRecords: 0,
  nycLegacyRecords: nyc.length,
  nycDirectionalRecords: nyc.filter(n => Object.keys(n.directional).length).length,
  overlapCandidatePairs: candidates.length,
  overlapLegacyRecords: new Set(candidates.map(c => c.nycId)).size,
  agreeingCandidatePairs: candidates.filter(c => c.sameValue).length,
  mergedAcrossSources: ctdot.features.length,
  belowFeet: Object.fromEntries(
    [8, 9, 10, 11, 12, 13].map(ft => [ft, features.filter(f => f.properties.postedClearanceInches < ft * 12).length]),
  ),
  nullSourceGeometries: raw.features.filter((f: RawFeature) => !f.geometry).length,
  omittedFields: normalized.rejected.length + ctdot.rejected.length,
};

await mkdir("data/audit", { recursive: true });
await mkdir("public/data", { recursive: true });
const save = (path: string, data: unknown) => writeFile(path, JSON.stringify(data, null, 2) + "\n");

const loadRaw = JSON.parse(await read("data/raw/nysdot-posted-load.geojson"));
if (!Array.isArray(loadRaw.features) || loadRaw.features.length === 0) {
  throw new Error("Incomplete NYSDOT posted-load snapshot");
}
const nyLoads = normalizeNysdotPostedLoad(loadRaw.features as NysdotLoadRaw[]);
if (nyLoads.length < 50) throw new Error("Unexpectedly few NY posted-load records; manual review required");
let ctLoads: typeof nyLoads = [];
try {
  const existingLoads = JSON.parse(await read("public/data/posted-load-nyc-li.geojson"));
  ctLoads = (existingLoads.features || []).filter(
    (f: { properties?: { id?: string } }) => String(f.properties?.id || "").startsWith("load-ct-"),
  );
} catch {
  ctLoads = [];
}
const postedLoadFeatures = [...nyLoads, ...ctLoads].sort((a, b) => a.properties.id.localeCompare(b.properties.id));
stats.nysdotPostedLoadRecords = nyLoads.length;

await save("data/audit/nyc-normalized.json", nyc);
await save("data/audit/overlap-candidates.json", candidates);
await save("data/audit/omitted-fields.json", [...normalized.rejected, ...ctdot.rejected]);
await save("data/audit/statistics.json", stats);
await save("public/data/metadata.json", stats);
await save("public/data/clearances-nyc-li.geojson", { type: "FeatureCollection", features });
await save("public/data/posted-load-nyc-li.geojson", { type: "FeatureCollection", features: postedLoadFeatures });
console.log(JSON.stringify(stats, null, 2));
