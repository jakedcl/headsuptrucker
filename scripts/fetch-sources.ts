import { mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NYSDOT_URL } from "./sources/nysdot-posted-height";
import { NYC_URL, normalizeNyc } from "./sources/nyc-low-bridges";

const directory = "data/raw";
await mkdir(directory, { recursive: true });
async function download(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HeadsUpDataAudit/0.1" }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`);
  return response.text();
}
const query = new URLSearchParams({ where: "1=1", outFields: "*", outSR: "4326", returnGeometry: "true", orderByFields: "OBJECTID", f: "geojson" });
const [nycMeta, nysMeta, nycKml, nysRecords, countText] = await Promise.all([
  download("https://data.cityofnewyork.us/api/views/rn6h-i66u.json"), download(`${NYSDOT_URL}?f=pjson`),
  download(NYC_URL), download(`${NYSDOT_URL}/query?${query}`), download(`${NYSDOT_URL}/query?where=1%3D1&returnCountOnly=true&f=json`),
]);
const nys = JSON.parse(nysRecords), count = JSON.parse(countText).count;
if (!Array.isArray(nys.features) || nys.exceededTransferLimit || nys.features.length !== count || count === 0) throw new Error("NYSDOT count mismatch or truncated response; refusing to replace snapshot");
normalizeNyc(nycKml);
const files: Record<string, string> = { "nyc-metadata.json": nycMeta, "nysdot-metadata.json": nysMeta, "nyc-low-bridges.kml": nycKml, "nysdot-statewide.geojson": nysRecords };
const manifest = { retrievedAt: new Date().toISOString(), nysdotCount: count, hashes: Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, createHash("sha256").update(contents).digest("hex")])) };
for (const [name, contents] of Object.entries(files)) await writeFile(`${directory}/${name}.tmp`, contents);
for (const name of Object.keys(files)) await rename(`${directory}/${name}.tmp`, `${directory}/${name}`);
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Downloaded ${count} NYSDOT structures and the NYC legacy KML. Run npm run data:build.`);
