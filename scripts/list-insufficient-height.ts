import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { evaluateFacility } from "../src/lib/facility-status";
import { toFacilityLimits } from "../src/lib/facilities";

const fac = JSON.parse(readFileSync("public/data/facilities-nyc-li.geojson", "utf8"));
const vehicle = { heightInches: 120, widthInches: null as number | null, weightTons: null as number | null, commercial: false };

type Row = {
  id: string;
  name: string;
  kind: string;
  operator: string | null;
  commercialBan: boolean;
  note: string;
};

const insufficient: Row[] = [];
for (const f of fac.features) {
  const limits = toFacilityLimits(f.properties || {});
  const ev = evaluateFacility(limits, vehicle);
  const heightGap = ev.reasons.find(
    r =>
      r.dimension === "height" &&
      (r.status === "unknown" || r.status === "caution") &&
      /No (corridor|posted) height/i.test(r.detail),
  );
  if (!heightGap) continue;
  insufficient.push({
    id: limits.id,
    name: limits.name,
    kind: limits.kind,
    operator: limits.operator || null,
    commercialBan: Boolean(limits.commercialBan),
    note: heightGap.detail,
  });
}

insufficient.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

const byKind: Record<string, Row[]> = {};
for (const row of insufficient) {
  (byKind[row.kind] ||= []).push(row);
}

console.log(`TOTAL insufficient-height: ${insufficient.length}\n`);
for (const kind of Object.keys(byKind).sort()) {
  const rows = byKind[kind];
  console.log(`## ${kind} (${rows.length})`);
  for (const r of rows) {
    console.log(
      `- ${r.name}  [${r.id}]${r.operator ? ` — ${r.operator}` : ""}${r.commercialBan ? " — commercial ban" : ""}`,
    );
  }
  console.log("");
}

mkdirSync("docs", { recursive: true });
writeFileSync(
  "docs/insufficient-height-facilities.json",
  `${JSON.stringify({ generatedAt: new Date().toISOString(), count: insufficient.length, byKind, items: insufficient }, null, 2)}\n`,
);

let md = `# Facilities yellow due to insufficient height data\n\n`;
md += `Generated ${new Date().toISOString().slice(0, 10)}. These paint **caution/yellow** because we have **no posted/corridor height**, not because of the 12″ tight-clearance band.\n\n`;
md += `Count: **${insufficient.length}**\n\n`;
for (const kind of Object.keys(byKind).sort()) {
  const rows = byKind[kind];
  md += `## ${kind} (${rows.length})\n\n`;
  for (const r of rows) {
    md += `- **${r.name}** (\`${r.id}\`)`;
    if (r.operator) md += ` — ${r.operator}`;
    if (r.commercialBan) md += ` — commercial ban`;
    md += `\n`;
  }
  md += `\n`;
}
writeFileSync("docs/insufficient-height-facilities.md", md);
console.log("Wrote docs/insufficient-height-facilities.md");
