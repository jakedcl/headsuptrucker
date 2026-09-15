/**
 * Fill parkway corridor height from the lowest nearby posted clearance when
 * the parkway object has no official passengerOnlyHeightInches.
 *
 * Preference order (safer than pure proximity):
 *  1) Clearances within ~120 m whose road/crossing/location names the parkway
 *  2) Else clearances within ~55 m (need ≥2 hits) — proximity fallback
 *  3) Else leave empty → UI shows yellow / insufficient data
 *
 * Official LI (94″) / CT (96″) values are never overwritten.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection, LineString, MultiLineString, Position } from "geojson";

const PUBLIC = path.join(process.cwd(), "public", "data");
const NAME_THRESH_DEG = 0.0011; // ~120 m
const PROX_THRESH_DEG = 0.0005; // ~55 m

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function linesOf(geom: LineString | MultiLineString): Position[][] {
  return geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
}

function dist2(a: Position, b: Position) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function minDist2ToGeom(point: Position, geom: LineString | MultiLineString): number {
  let best = Infinity;
  for (const line of linesOf(geom)) {
    for (let i = 0; i < line.length; i++) {
      best = Math.min(best, dist2(point, line[i]));
      if (i === 0) continue;
      const a = line[i - 1];
      const b = line[i];
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const len2 = abx * abx + aby * aby;
      if (len2 < 1e-18) continue;
      let t = ((point[0] - a[0]) * abx + (point[1] - a[1]) * aby) / len2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, dist2(point, [a[0] + t * abx, a[1] + t * aby]));
    }
  }
  return best;
}

/** Tokens from parkway name useful for matching clearance text. */
function nameTokens(name: string): string[] {
  const cleaned = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(parkway|pkwy|drive|state|system|interstate|n\.?y\.?c\.?|westchester|richmond)\b/gi, " ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .toLowerCase();
  return cleaned
    .split(/[\s-]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 4);
}

function textMatch(blob: string, tokens: string[], fullName: string): boolean {
  if (!tokens.length) return false;
  const b = blob.toLowerCase();
  const hits = tokens.filter(t => b.includes(t));
  if (hits.length >= 2) return true;
  if (hits.length === 1 && hits[0].length >= 4) return true;
  const name = fullName.toLowerCase();
  // Whole distinctive phrases from the parkway title
  const phrases = [
    name.replace(/\s*\([^)]*\)\s*/g, " ").trim(),
    ...[
      "cross island",
      "grand central",
      "henry hudson",
      "jackie robinson",
      "bronx river",
      "bronx pelham",
      "hutchinson river",
      "franklin d. roosevelt",
      "fdr drive",
      "shore parkway",
      "belt parkway",
      "mosholu",
      "harlem river",
      "ocean parkway",
    ],
  ];
  return phrases.some(p => p.length >= 4 && b.includes(p));
}

async function loadFc(file: string) {
  return JSON.parse(await readFile(path.join(PUBLIC, file), "utf8")) as FeatureCollection;
}

async function main() {
  const parkways = await loadFc("parkways-nyc-li.geojson");
  const facilities = await loadFc("facilities-nyc-li.geojson");
  const clearances = await loadFc("clearances-nyc-li.geojson");

  const clearancePts: Array<{ coord: Position; height: number; blob: string }> = [];
  for (const f of clearances.features) {
    if (f.geometry?.type !== "Point") continue;
    const h = num(f.properties?.postedClearanceInches) ?? num(f.properties?.heightInches);
    if (h == null || h <= 0) continue;
    const blob = [f.properties?.road, f.properties?.crossing, f.properties?.location, f.properties?.name]
      .filter(Boolean)
      .join(" ");
    clearancePts.push({ coord: f.geometry.coordinates as Position, height: h, blob });
  }

  const derived = new Map<string, { height: number; count: number; method: string }>();
  const nameThresh2 = NAME_THRESH_DEG * NAME_THRESH_DEG;
  const proxThresh2 = PROX_THRESH_DEG * PROX_THRESH_DEG;

  for (const pw of parkways.features) {
    const id = String(pw.properties?.id || "");
    const name = String(pw.properties?.name || "");
    if (!id || (pw.geometry?.type !== "LineString" && pw.geometry?.type !== "MultiLineString")) continue;
    const official = num(pw.properties?.passengerOnlyHeightInches) ?? num(pw.properties?.heightInches);
    // Keep official corridor heights (and prior derived only if re-running after wipe — we skip any existing)
    if (official != null && pw.properties?.heightSource !== "derived-min-clearance") continue;
    // Recompute derived each run
    if (pw.properties?.heightSource === "derived-min-clearance") {
      pw.properties.passengerOnlyHeightInches = null;
      pw.properties.heightInches = null;
      delete pw.properties.heightSource;
      delete pw.properties.heightSampleCount;
    }

    const tokens = nameTokens(name);
    const named: number[] = [];
    const prox: number[] = [];
    for (const c of clearancePts) {
      const d2 = minDist2ToGeom(c.coord, pw.geometry);
      if (d2 <= nameThresh2 && textMatch(c.blob, tokens, name)) named.push(c.height);
      if (d2 <= proxThresh2) prox.push(c.height);
    }

    let pick: number[] = [];
    let method = "";
    if (named.length >= 1) {
      pick = named;
      method = "name+near";
    } else if (prox.length >= 2) {
      pick = prox;
      method = "proximity";
    }
    if (!pick.length) continue;
    const height = Math.round(Math.min(...pick));
    derived.set(id, { height, count: pick.length, method });
  }

  let filled = 0;
  for (const pw of parkways.features) {
    const id = String(pw.properties?.id || "");
    const d = derived.get(id);
    if (!d || !pw.properties) continue;
    const official = num(pw.properties.passengerOnlyHeightInches) ?? num(pw.properties.heightInches);
    if (official != null && pw.properties.heightSource !== "derived-min-clearance") continue;
    pw.properties.passengerOnlyHeightInches = d.height;
    pw.properties.heightInches = d.height;
    pw.properties.heightSource = "derived-min-clearance";
    pw.properties.heightSampleCount = d.count;
    pw.properties.heightMethod = d.method;
    filled += 1;
  }

  for (const f of facilities.features) {
    if (String(f.properties?.kind) !== "parkway" || !f.properties) continue;
    const id = String(f.properties.id || "");
    const d = derived.get(id);
    const official = num(f.properties.passengerOnlyHeightInches) ?? num(f.properties.heightInches);
    if (official != null && f.properties.heightSource !== "derived-min-clearance") continue;
    if (!d) {
      if (f.properties.heightSource === "derived-min-clearance") {
        f.properties.passengerOnlyHeightInches = null;
        f.properties.heightInches = null;
        delete f.properties.heightSource;
        delete f.properties.heightSampleCount;
        delete f.properties.heightMethod;
      }
      continue;
    }
    f.properties.passengerOnlyHeightInches = d.height;
    f.properties.heightInches = d.height;
    f.properties.heightSource = "derived-min-clearance";
    f.properties.heightSampleCount = d.count;
    f.properties.heightMethod = d.method;
  }

  await writeFile(path.join(PUBLIC, "parkways-nyc-li.geojson"), `${JSON.stringify(parkways)}\n`);
  await writeFile(path.join(PUBLIC, "facilities-nyc-li.geojson"), `${JSON.stringify(facilities)}\n`);

  console.log(`Clearance points: ${clearancePts.length}`);
  console.log(`Parkways filled from nearby clearances: ${filled}`);
  for (const [id, d] of [...derived.entries()].sort()) {
    const ft = Math.floor(d.height / 12);
    const inch = d.height % 12;
    console.log(`  ${id}: ${d.height}" (${ft}'${inch}") via ${d.method} n=${d.count}`);
  }
  const missing = parkways.features.filter(
    f => num(f.properties?.passengerOnlyHeightInches) == null && num(f.properties?.heightInches) == null,
  );
  console.log(`Parkways still without height (→ yellow): ${missing.length}`);
  for (const f of missing) console.log(`  ${f.properties?.id} — ${f.properties?.name}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
