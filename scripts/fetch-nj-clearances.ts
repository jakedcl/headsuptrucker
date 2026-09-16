/**
 * Fetch NJ clearance inputs:
 * 1) Geocode 2024 Truck Map structure numbers via NJDOT Bridges FeatureServer
 * 2) OpenStreetMap maxheight tags for New Jersey (Overpass)
 *
 * Writes data/raw/nj-truck-map-bridges.geojson + data/raw/osm-nj-maxheight.json
 * then updates manifest hashes for those files only (does not re-fetch NY/CT).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  NJ_BRIDGES_URL,
  NJ_TRUCK_MAP_2024,
  brkeyCandidates,
} from "./sources/nj-truck-map";
import { OSM_NJ_QUERY, OSM_OVERPASS_URL } from "./sources/osm-nj-maxheight";

const RAW = "data/raw";
await mkdir(RAW, { recursive: true });

async function download(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "HeadsUpClearanceMap/0.1 (https://github.com/jakedcl/headsuptrucker)",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`);
  return response.text();
}

async function fetchBridgeMatches() {
  const features: unknown[] = [];
  for (const row of NJ_TRUCK_MAP_2024) {
    const keys = brkeyCandidates(row.structureNumber);
    const where = keys.map(k => `BRKEY='${k.replace(/'/g, "''")}'`).join(" OR ");
    const query = new URLSearchParams({
      where,
      outFields: "OBJECTID,BRKEY,FACILITY,FEATINT,STRUCNAME,VCLRUNDER,VCLROVER,COUNTY",
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
    });
    const page = JSON.parse(await download(`${NJ_BRIDGES_URL}/query?${query}`));
    if (!Array.isArray(page.features)) throw new Error(`Bad Bridges response for ${row.structureNumber}`);
    for (const f of page.features) {
      (f.properties ||= {})._truckMapStructure = row.structureNumber;
      features.push(f);
    }
  }
  return { type: "FeatureCollection", features };
}

console.log("Fetching NJDOT Bridges matches for truck-map structures…");
const bridges = await fetchBridgeMatches();
console.log(`  ${bridges.features.length} bridge features`);

console.log("Fetching OpenStreetMap maxheight for New Jersey…");
const osmText = await download(OSM_OVERPASS_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `data=${encodeURIComponent(OSM_NJ_QUERY)}`,
});
const osm = JSON.parse(osmText);
if (!Array.isArray(osm.elements)) throw new Error("Overpass response missing elements");
console.log(`  ${osm.elements.length} OSM elements`);

const files: Record<string, string> = {
  "nj-truck-map-bridges.geojson": `${JSON.stringify(bridges)}\n`,
  "osm-nj-maxheight.json": `${JSON.stringify(osm)}\n`,
};

for (const [name, contents] of Object.entries(files)) {
  await writeFile(`${RAW}/${name}`, contents);
}

let manifest: {
  retrievedAt?: string;
  hashes?: Record<string, string>;
  [key: string]: unknown;
} = {};
try {
  manifest = JSON.parse(await readFile(`${RAW}/manifest.json`, "utf8"));
} catch {
  manifest = { retrievedAt: new Date().toISOString(), hashes: {} };
}
manifest.njClearancesRetrievedAt = new Date().toISOString();
manifest.njTruckMapBridgeCount = bridges.features.length;
manifest.osmNjMaxheightCount = osm.elements.length;
manifest.hashes = {
  ...(manifest.hashes || {}),
  ...Object.fromEntries(
    Object.entries(files).map(([name, contents]) => [name, createHash("sha256").update(contents).digest("hex")]),
  ),
};
await writeFile(`${RAW}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log("Wrote nj-truck-map-bridges.geojson + osm-nj-maxheight.json. Run npm run data:build && npm run data:build-unified.");
