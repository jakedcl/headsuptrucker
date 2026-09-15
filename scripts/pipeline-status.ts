/**
 * Prints the awareness source registry and intended pipeline stages.
 * Does not fetch or rewrite public GeoJSON — safe to run anytime.
 */
import { AWARENESS_SOURCES } from "./sources/registry";

const byStatus = (status: string) => AWARENESS_SOURCES.filter(s => s.status === status);

console.log("Heads Up — awareness data pipeline\n");
console.log("Stages:");
console.log("  1. fetch     npm run data:fetch          → data/raw/{sourceId}/");
console.log("  2. normalize adapters in scripts/sources → data/normalized/");
console.log("  3. merge     dedupe by id + conflict check → public/data/awareness-*.geojson");
console.log("  4. cache     weekly refresh is enough for posted limits / corridors\n");
console.log("Target outputs (next migration):");
console.log("  public/data/awareness-points.geojson  — clearances, loads, point facilities");
console.log("  public/data/awareness-lines.geojson   — roads, parkways, bridges, tunnels\n");
console.log(`Sources (${AWARENESS_SOURCES.length}):\n`);

for (const status of ["active", "manual", "planned"] as const) {
  const list = byStatus(status);
  console.log(`## ${status} (${list.length})`);
  for (const s of list) {
    console.log(`  - ${s.id}`);
    console.log(`      ${s.agency} · ${s.states.join(",")} · ${s.geometry} · ${s.extracts.join(", ")}`);
    console.log(`      ${s.notes}`);
  }
  console.log("");
}
