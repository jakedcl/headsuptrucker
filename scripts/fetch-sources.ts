import { mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NYSDOT_URL } from "./sources/nysdot-posted-height";
import { NYC_URL, normalizeNyc } from "./sources/nyc-low-bridges";
import { CTDOT_URL } from "./sources/ctdot-posted-height";
import { NYSDOT_LOAD_URL } from "./sources/nysdot-posted-load";

const directory = "data/raw";
await mkdir(directory, { recursive: true });

async function download(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 HeadsUpDataAudit/0.1" },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`);
  return response.text();
}

async function downloadCtdot() {
  const where = "PostedVertUnderClrncFt > 0 OR PostedVertClrncFt_6000029 > 0";
  const features: unknown[] = [];
  let offset = 0;
  for (;;) {
    const query = new URLSearchParams({
      where,
      outFields: "*",
      outSR: "4326",
      returnGeometry: "true",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: "2000",
      f: "geojson",
    });
    const page = JSON.parse(await download(`${CTDOT_URL}/query?${query}`));
    if (!Array.isArray(page.features)) throw new Error("CTDOT response missing features array");
    features.push(...page.features);
    if (!page.properties?.exceededTransferLimit && !page.exceededTransferLimit) break;
    if (page.features.length === 0) break;
    offset += page.features.length;
  }
  return JSON.stringify({ type: "FeatureCollection", features });
}

const nysQuery = new URLSearchParams({
  where: "1=1",
  outFields: "*",
  outSR: "4326",
  returnGeometry: "true",
  orderByFields: "OBJECTID",
  f: "geojson",
});
const nysLoadQuery = new URLSearchParams({
  where: "POSTED_LOAD_TONS>0",
  outFields: "*",
  outSR: "4326",
  returnGeometry: "true",
  orderByFields: "OBJECTID",
  f: "geojson",
});

const [nycMeta, nysMeta, nycKml, nysRecords, countText, nysLoadRecords, ctdotRecords, ctdotMeta] = await Promise.all([
  download("https://data.cityofnewyork.us/api/views/rn6h-i66u.json"),
  download(`${NYSDOT_URL}?f=pjson`),
  download(NYC_URL),
  download(`${NYSDOT_URL}/query?${nysQuery}`),
  download(`${NYSDOT_URL}/query?where=1%3D1&returnCountOnly=true&f=json`),
  download(`${NYSDOT_LOAD_URL}/query?${nysLoadQuery}`),
  downloadCtdot(),
  download(`${CTDOT_URL}?f=pjson`),
]);

const nys = JSON.parse(nysRecords);
const count = JSON.parse(countText).count;
if (!Array.isArray(nys.features) || nys.exceededTransferLimit || nys.features.length !== count || count === 0) {
  throw new Error("NYSDOT count mismatch or truncated response; refusing to replace snapshot");
}
const ctdot = JSON.parse(ctdotRecords);
if (!Array.isArray(ctdot.features) || ctdot.features.length === 0) {
  throw new Error("CTDOT SW posted-clearance query returned no features");
}
const nysLoad = JSON.parse(nysLoadRecords);
if (!Array.isArray(nysLoad.features) || nysLoad.features.length === 0) {
  throw new Error("NYSDOT posted-load query returned no features");
}
normalizeNyc(nycKml);

const files: Record<string, string> = {
  "nyc-metadata.json": nycMeta,
  "nysdot-metadata.json": nysMeta,
  "nyc-low-bridges.kml": nycKml,
  "nysdot-statewide.geojson": nysRecords,
  "nysdot-posted-load.geojson": nysLoadRecords,
  "ctdot-bridges.geojson": ctdotRecords,
  "ctdot-metadata.json": ctdotMeta,
};
const manifest = {
  retrievedAt: new Date().toISOString(),
  nysdotCount: count,
  nysdotPostedLoadCount: nysLoad.features.length,
  ctdotCount: ctdot.features.length,
  hashes: Object.fromEntries(
    Object.entries(files).map(([name, contents]) => [name, createHash("sha256").update(contents).digest("hex")]),
  ),
};
for (const [name, contents] of Object.entries(files)) await writeFile(`${directory}/${name}.tmp`, contents);
for (const name of Object.keys(files)) await rename(`${directory}/${name}.tmp`, `${directory}/${name}`);
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Downloaded ${count} NYSDOT height structures, ${nysLoad.features.length} posted-load bridges, ${ctdot.features.length} CTDOT SW bridges, and the NYC legacy KML. Run npm run data:build.`,
);
