/**
 * Master Data Refresh Pipeline for Heads Up.
 *
 * Runs the full 10-step data fetching, normalization, corridor merging,
 * enrichment, and unification pipeline with strict safety gates and diff reporting.
 *
 * Usage:
 *   npx tsx scripts/refresh-data.ts              # Full fetch + build + verify
 *   npx tsx scripts/refresh-data.ts --skip-fetch # Re-build and re-verify from existing raw data
 */

import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

interface Metadata {
  retrievedAt: string;
  sourceUpdatedAt?: string;
  nysdotStatewideStructures: number;
  postedRecords: number;
  uniqueStructures: number;
  ctdotPostedRecords?: number;
  njTruckMapRecords?: number;
  osmNjMaxheightRecords?: number;
  counties?: Array<{ county: string; sourceStructures: number; postedUnder: number; postedOn: number }>;
}

interface ClearanceFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    id: string;
    road?: string;
    crossing?: string;
    county?: string;
    state: string;
    postedClearanceInches: number;
    clearanceType: string;
  };
}

const ROOT = process.cwd();
const BUILT_DIR = path.join(ROOT, "data", "built");
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const AUDIT_DIR = path.join(ROOT, "data", "audit");

const args = process.argv.slice(2);
const skipFetch = args.includes("--skip-fetch");

function runStep(name: string, scriptRelativePath: string) {
  console.log(`\n============================================================`);
  console.log(`▶ [Step] ${name} (${scriptRelativePath})`);
  console.log(`============================================================`);
  const startTime = Date.now();
  try {
    execFileSync("npx", ["tsx", scriptRelativePath], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    });
    console.log(`✔ Finished ${name} in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error(`\n✖ FAILED: Step "${name}" (${scriptRelativePath}) exited with an error.`);
    throw error;
  }
}

async function loadJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Starting Heads Up automated data refresh pipeline...");
  const pipelineStartTime = Date.now();

  // 1. Snapshot previous metadata and clearance points for baseline comparison
  const metadataPath = path.join(PUBLIC_DATA_DIR, "metadata.json");
  const clearancesPath = path.join(BUILT_DIR, "clearances-nyc-li.geojson");

  const prevMeta = await loadJsonSafe<Metadata>(metadataPath);
  const prevClearances = await loadJsonSafe<{ features: ClearanceFeature[] }>(clearancesPath);

  // 2. Execute pipeline steps in exact topological dependency order
  if (!skipFetch) {
    // Step 1: NYSDOT, CTDOT, NYC KML raw snapshots
    runStep("Fetch State DOT Clearances", "scripts/fetch-sources.ts");
    // Step 2: NJDOT & OSM Overpass NJ snapshots
    runStep("Fetch NJ Clearances", "scripts/fetch-nj-clearances.ts");
  } else {
    console.log("\n[Notice] --skip-fetch flag passed. Skipping network download steps.");
  }

  // Step 3: Raw normalization & hash check -> data/built/
  runStep("Build Baseline Dataset & Normalization", "scripts/build-dataset.ts");

  if (!skipFetch) {
    // Step 4: Live NYC Open Data (truck routes, closures, loading zones)
    runStep("Build NYC Truck Awareness Layers", "scripts/build-awareness.ts");
  }

  // Step 5: CTDOT corridor restrictions & loads
  runStep("Merge Connecticut Corridors", "scripts/merge-ct-awareness.ts");

  // Step 6: NJDOT & PANYNJ corridor restrictions (must precede HV to establish shared Palisades corridor)
  runStep("Merge New Jersey Corridors & Crossings", "scripts/merge-nj-awareness.ts");

  // Step 7: Hudson Valley parkways & merges into shared Palisades
  runStep("Merge Hudson Valley Parkways", "scripts/merge-hv-parkways.ts");

  // Step 8: Spatial calculation of corridor minimum heights
  runStep("Enrich Parkway Corridor Heights", "scripts/enrich-parkway-heights.ts");

  // Step 9: Re-assert hand-researched corridor heights
  runStep("Apply Researched Corridor Heights", "scripts/apply-researched-heights.ts");

  // Step 10: Produce final unified public GeoJSON
  runStep("Build Unified Awareness GeoJSON", "scripts/build-unified-awareness.ts");

  // 3. Automated Safety Gate & Anomaly Assertions
  console.log(`\n============================================================`);
  console.log(`▶ [Safety Verification Gate] Running integrity assertions...`);
  console.log(`============================================================`);

  const nextMeta = await loadJsonSafe<Metadata>(metadataPath);
  const nextClearances = await loadJsonSafe<{ features: ClearanceFeature[] }>(clearancesPath);

  if (!nextMeta || !nextClearances) {
    throw new Error("Verification failed: Metadata or clearances GeoJSON was not created.");
  }

  // Check A: Structure count drop check
  if (prevMeta && prevMeta.uniqueStructures > 0) {
    const prevCount = prevMeta.uniqueStructures;
    const nextCount = nextMeta.uniqueStructures;
    const dropRatio = (prevCount - nextCount) / prevCount;

    if (dropRatio > 0.02) {
      throw new Error(
        `SAFETY HALT: Unique structures dropped by ${(dropRatio * 100).toFixed(1)}% ` +
          `(from ${prevCount} to ${nextCount}). Drops exceeding 2% indicate potential upstream API truncation.`,
      );
    }
  }

  // Check B: Verify final public files exist and have non-trivial size
  const pointsPath = path.join(PUBLIC_DATA_DIR, "awareness-points.geojson");
  const linesPath = path.join(PUBLIC_DATA_DIR, "awareness-lines.geojson");

  if (!existsSync(pointsPath) || !existsSync(linesPath)) {
    throw new Error("Verification failed: Final public awareness GeoJSON files are missing.");
  }

  const pointsContent = await readFile(pointsPath, "utf8");
  const linesContent = await readFile(linesPath, "utf8");

  if (pointsContent.length < 50000 || linesContent.length < 10000) {
    throw new Error("Verification failed: Output GeoJSON files appear truncated or empty.");
  }

  // Check C: Critical corridors must be present in lines
  const linesGeoJson = JSON.parse(linesContent);
  const corridorIds = new Set(linesGeoJson.features.map((f: { properties?: { id?: string } }) => f.properties?.id));
  const criticalCorridors = [
    "parkway-ct-merritt-parkway",
    "parkway-saw-mill-river-parkway",
    "parkway-hutchinson-river-parkway-westchester",
    "parkway-nj-palisades-interstate-parkway",
    "parkway-southern-state-parkway",
    "parkway-northern-state-parkway",
  ];

  for (const corridor of criticalCorridors) {
    if (!corridorIds.has(corridor)) {
      throw new Error(`SAFETY HALT: Critical corridor missing from unified lines: ${corridor}`);
    }
  }

  // Check D: Run test suite & typecheck
  console.log("Running npm test...");
  execFileSync("npx", ["tsx", "--test", "tests/*.test.ts"], { cwd: ROOT, stdio: "inherit" });

  console.log("Running npm run typecheck...");
  execFileSync("npx", ["tsc", "--noEmit"], { cwd: ROOT, stdio: "inherit" });

  console.log("✔ All safety assertions, regression tests, and typechecks passed!");

  // 4. Generate Diff Summary for Audit & Pull Request Description
  await mkdir(AUDIT_DIR, { recursive: true });

  const prevMap = new Map((prevClearances?.features || []).map(f => [f.properties.id, f]));
  const nextMap = new Map(nextClearances.features.map(f => [f.properties.id, f]));

  const added: ClearanceFeature[] = [];
  const removed: ClearanceFeature[] = [];
  const heightChanged: Array<{ id: string; road: string; oldH: number; newH: number }> = [];

  for (const [id, nextF] of nextMap.entries()) {
    const prevF = prevMap.get(id);
    if (!prevF) {
      added.push(nextF);
    } else if (prevF.properties.postedClearanceInches !== nextF.properties.postedClearanceInches) {
      heightChanged.push({
        id,
        road: nextF.properties.road || nextF.properties.crossing || id,
        oldH: prevF.properties.postedClearanceInches,
        newH: nextF.properties.postedClearanceInches,
      });
    }
  }

  for (const [id, prevF] of prevMap.entries()) {
    if (!nextMap.has(id)) {
      removed.push(prevF);
    }
  }

  const formatFtIn = (inches: number) => {
    const ft = Math.floor(inches / 12);
    const inc = inches % 12;
    return `${ft}′${inc}″`;
  };

  const linesSummary: string[] = [];
  linesSummary.push(`## Weekly Clearance Data Refresh Summary`);
  linesSummary.push(`**Executed at**: ${new Date().toISOString()}`);
  linesSummary.push(`**Agency Source Snapshot**: ${nextMeta.retrievedAt.slice(0, 10)}`);
  linesSummary.push(``);
  linesSummary.push(`### Overview`);
  linesSummary.push(`- **Total Posted Records**: ${nextMeta.postedRecords} (${nextMeta.postedRecords - (prevMeta?.postedRecords || nextMeta.postedRecords)} net)`);
  linesSummary.push(`- **Unique Structures**: ${nextMeta.uniqueStructures} (${nextMeta.uniqueStructures - (prevMeta?.uniqueStructures || nextMeta.uniqueStructures)} net)`);
  linesSummary.push(`- **New Structures Added**: ${added.length}`);
  linesSummary.push(`- **Structures Removed**: ${removed.length}`);
  linesSummary.push(`- **Heights Changed**: ${heightChanged.length}`);
  linesSummary.push(``);

  if (heightChanged.length > 0) {
    linesSummary.push(`### ⚠️ Height Changes (${heightChanged.length})`);
    for (const h of heightChanged) {
      linesSummary.push(
        `- **${h.road}** (\`${h.id}\`): ${formatFtIn(h.oldH)} (${h.oldH}″) → **${formatFtIn(h.newH)} (${h.newH}″)**`,
      );
    }
    linesSummary.push(``);
  }

  if (added.length > 0) {
    linesSummary.push(`### ➕ Added Clearance Structures (${added.length})`);
    for (const f of added.slice(0, 15)) {
      linesSummary.push(
        `- **${f.properties.road || f.properties.crossing || f.properties.id}** (${f.properties.county || f.properties.state}): ${formatFtIn(f.properties.postedClearanceInches)}`,
      );
    }
    if (added.length > 15) {
      linesSummary.push(`- *...and ${added.length - 15} more.*`);
    }
    linesSummary.push(``);
  }

  if (removed.length > 0) {
    linesSummary.push(`### ➖ Removed Structures (${removed.length})`);
    for (const f of removed) {
      linesSummary.push(
        `- **${f.properties.road || f.properties.crossing || f.properties.id}** (${f.properties.county || f.properties.state}): was ${formatFtIn(f.properties.postedClearanceInches)}`,
      );
    }
    linesSummary.push(``);
  }

  linesSummary.push(`### Safety Verification Checks`);
  linesSummary.push(`- [x] Structure count drop < 2% threshold verified`);
  linesSummary.push(`- [x] Critical parkway corridors verified`);
  linesSummary.push(`- [x] Regression test suite passed (\`npm test\`)`);
  linesSummary.push(`- [x] TypeScript typecheck passed (\`npm run typecheck\`)`);
  linesSummary.push(``);

  const summaryText = linesSummary.join("\n");
  const summaryPath = path.join(AUDIT_DIR, "last-refresh-summary.md");
  await writeFile(summaryPath, summaryText, "utf8");

  console.log(`\n============================================================`);
  console.log(`Summary written to ${summaryPath}`);
  console.log(`============================================================`);
  console.log(summaryText);
  console.log(`Pipeline completed successfully in ${((Date.now() - pipelineStartTime) / 1000).toFixed(1)}s.`);
}

main().catch(error => {
  console.error("Refresh pipeline failed:", error);
  process.exit(1);
});
