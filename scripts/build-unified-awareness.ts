/**
 * Build unified awareness-points / awareness-lines from today's per-layer
 * public GeoJSON. One shared schema; agency leftovers stay in `extras`.
 *
 * Usage: npm run data:build-unified
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { FeatureCollection, LineString, MultiLineString, Point } from "geojson";
import type {
  AwarenessKind,
  AwarenessLineCollection,
  AwarenessLineFeature,
  AwarenessPointCollection,
  AwarenessPointFeature,
  AwarenessProperties,
  AwarenessProvenance,
  AwarenessState,
} from "../src/lib/awareness-schema";

const PUBLIC = "public/data";
type Props = Record<string, unknown>;

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const flag = (v: unknown) => Boolean(v);

function stateFromId(id: string): AwarenessState {
  if (id.includes("-ct-") || id.startsWith("ctdot-") || id.startsWith("load-ct-")) return "CT";
  if (id.includes("-nj-") || id.startsWith("nj-") || id.startsWith("parkway-nj-")) return "NJ";
  return "NY";
}

function postedLoadState(id: string, county: string): AwarenessState {
  if (id.startsWith("load-ct-") || id.includes("-ct-")) return "CT";
  const ny = new Set([
    "BRONX",
    "KINGS",
    "NEW YORK",
    "QUEENS",
    "RICHMOND",
    "NASSAU",
    "SUFFOLK",
    "WESTCHESTER",
    "ROCKLAND",
    "PUTNAM",
    "ORANGE",
    "DUTCHESS",
  ]);
  return ny.has(county.toUpperCase()) ? "NY" : "CT";
}

function mapSources(raw: unknown, fallback: AwarenessProvenance): AwarenessProvenance[] {
  if (!Array.isArray(raw) || raw.length === 0) return [fallback];
  return raw.map((s: Props) => ({
    sourceId: str(s.sourceId, fallback.sourceId),
    agency: str(s.agency, fallback.agency),
    dataset: str(s.dataset, fallback.dataset),
    recordId: str(s.recordId, fallback.recordId),
    sourceUrl: str(s.sourceUrl, fallback.sourceUrl),
    retrievedAt: str(s.retrievedAt, fallback.retrievedAt),
    ...(typeof s.datasetUpdatedAt === "string"
      ? { datasetUpdatedAt: s.datasetUpdatedAt }
      : {}),
  }));
}

function makeProps(
  partial: Omit<AwarenessProperties, "limits" | "access" | "notes" | "sources"> & {
    limits?: AwarenessProperties["limits"];
    access?: AwarenessProperties["access"];
    notes?: string[];
    sources?: AwarenessProvenance[];
  },
): AwarenessProperties {
  return {
    ...partial,
    limits: partial.limits || {},
    access: partial.access || {},
    notes: partial.notes || [],
    sources: partial.sources || [],
  };
}

function mergeProps(a: AwarenessProperties, b: AwarenessProperties): AwarenessProperties {
  return {
    ...a,
    ...b,
    limits: { ...a.limits, ...b.limits },
    access: { ...a.access, ...b.access },
    notes: [...new Set([...(a.notes || []), ...(b.notes || [])])],
    sources: [...a.sources, ...b.sources],
    extras: { ...(a.extras || {}), ...(b.extras || {}) },
  };
}

function leftovers(raw: Props, skip: string[]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (skip.includes(k)) continue;
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

function counts(features: Array<{ properties: AwarenessProperties }>) {
  const out: Record<string, number> = {};
  for (const f of features) out[f.properties.kind] = (out[f.properties.kind] || 0) + 1;
  return out;
}

const NJ_CROSSINGS = new Set([
  "gwb-upper",
  "gwb-lower",
  "holland",
  "lincoln",
  "bayonne",
  "goethals",
  "outerbridge",
]);

async function main() {
  await mkdir(PUBLIC, { recursive: true });

  const clearances = await readJson<FeatureCollection<Point, Props>>(
    `${PUBLIC}/clearances-nyc-li.geojson`,
  );
  const parkways = await readJson<FeatureCollection<MultiLineString | LineString, Props>>(
    `${PUBLIC}/parkways-nyc-li.geojson`,
  );
  const postedLoad = await readJson<FeatureCollection<Point, Props>>(
    `${PUBLIC}/posted-load-nyc-li.geojson`,
  );
  const facilities = await readJson<
    FeatureCollection<Point | MultiLineString | LineString, Props>
  >(`${PUBLIC}/facilities-nyc-li.geojson`);
  const majorCrossings = await readJson<FeatureCollection<Point, Props>>(
    `${PUBLIC}/major-crossings.geojson`,
  );

  const pointMap = new Map<string, AwarenessPointFeature>();
  const lineMap = new Map<string, AwarenessLineFeature>();

  const putPoint = (feature: AwarenessPointFeature) => {
    const prev = pointMap.get(feature.properties.id);
    pointMap.set(
      feature.properties.id,
      prev
        ? { ...feature, properties: mergeProps(prev.properties, feature.properties) }
        : feature,
    );
  };
  const putLine = (feature: AwarenessLineFeature) => {
    const prev = lineMap.get(feature.properties.id);
    lineMap.set(
      feature.properties.id,
      prev
        ? { ...feature, properties: mergeProps(prev.properties, feature.properties) }
        : feature,
    );
  };

  for (const f of clearances.features) {
    const p = f.properties || {};
    const id = str(p.id);
    if (!id || f.geometry?.type !== "Point") continue;
    const state: AwarenessState = str(p.state) === "CT" ? "CT" : "NY";
    const fallback: AwarenessProvenance = {
      sourceId: state === "CT" ? "ctdot-posted-height" : "nysdot-posted-height",
      agency: state === "CT" ? "CTDOT" : "NYSDOT",
      dataset: state === "CT" ? "CTDOT Bridges" : "Posted Height Bridges",
      recordId: str(p.structureId, id),
      sourceUrl: "",
      retrievedAt: new Date().toISOString(),
    };
    putPoint({
      type: "Feature",
      geometry: f.geometry,
      properties: makeProps({
        id,
        name: str(p.road) || str(p.location) || id,
        kind: "clearance",
        geometryRole: "point",
        state,
        county: str(p.county) || null,
        operator: str(p.owner) || null,
        road: str(p.road) || null,
        crossing: str(p.crossing) || null,
        location: str(p.location) || null,
        direction: p.direction == null ? null : str(p.direction),
        appliesTo: p.appliesTo === "on" ? "on" : "under",
        limits: { heightInches: num(p.postedClearanceInches) },
        notes: Array.isArray(p.notes) ? p.notes.map(String) : [],
        sources: mapSources(p.sources, fallback),
        extras: {
          structureId: str(p.structureId) || null,
          clearanceType: str(p.clearanceType, "posted"),
          layer: "clearance",
          owner: str(p.owner) || null,
          ...(p.extras && typeof p.extras === "object"
            ? (p.extras as Record<string, string | number | boolean | null>)
            : {}),
        },
      }),
    });
  }

  for (const f of postedLoad.features) {
    const p = f.properties || {};
    const id = str(p.id);
    if (!id || f.geometry?.type !== "Point") continue;
    const county = str(p.county);
    const state = postedLoadState(id, county);
    putPoint({
      type: "Feature",
      geometry: f.geometry,
      properties: makeProps({
        id,
        name: str(p.name, id),
        kind: "posted_load",
        geometryRole: "point",
        state,
        county: county || null,
        limits: { postedLoadTons: num(p.postedLoadTons) },
        sources: [
          {
            sourceId: state === "CT" ? "ctdot-posted-load" : "nysdot-posted-load",
            agency: state === "CT" ? "CTDOT" : "NYSDOT",
            dataset: "Posted load bridges",
            recordId: str(p.bin, id),
            sourceUrl: "",
            retrievedAt: new Date().toISOString(),
          },
        ],
        extras: {
          bin: str(p.bin) || null,
          layer: "posted-load",
          ...(p.extras && typeof p.extras === "object"
            ? (p.extras as Record<string, string | number | boolean | null>)
            : {}),
        },
      }),
    });
  }

  for (const f of parkways.features) {
    const p = f.properties || {};
    const id = str(p.id);
    if (!id || !f.geometry) continue;
    if (f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString") continue;
    const state = stateFromId(id);
    putLine({
      type: "Feature",
      geometry: f.geometry,
      properties: makeProps({
        id,
        name: str(p.name, id),
        kind: "parkway",
        geometryRole: "line",
        state,
        limits: { heightInches: num(p.passengerOnlyHeightInches), widthInches: num(p.widthInches), weightTons: num(p.weightTons) },
        access: {
          commercialBan: flag(p.commercialBan),
          commercialException: flag(p.gcpTruckException),
          passengerOnlyHeightInches: num(p.passengerOnlyHeightInches),
          restriction: str(p.restriction) || null,
        },
        sources: [
          {
            sourceId:
              state === "CT"
                ? "ctdot-parkways"
                : state === "NJ"
                  ? "njdot-roadway-corridors"
                  : "nysdot-parkways",
            agency: state === "CT" ? "CTDOT" : state === "NJ" ? "NJDOT" : "NYSDOT",
            dataset: "Parkway / corridor restrictions",
            recordId: id,
            sourceUrl: "",
            retrievedAt: new Date().toISOString(),
          },
        ],
        extras: {
          labelLng: num(p.labelLng),
          labelLat: num(p.labelLat),
          layer: "parkway",
          ...leftovers(p, [
            "id",
            "name",
            "kind",
            "restriction",
            "commercialBan",
            "gcpTruckException",
            "passengerOnlyHeightInches",
            "widthInches",
            "weightTons",
            "labelLng",
            "labelLat",
            "extras",
          ]),
          ...(p.extras && typeof p.extras === "object" ? (p.extras as Record<string, string | number | boolean | null>) : {}),
        },
      }),
    });
  }

  const facilitySkip = [
    "id",
    "name",
    "kind",
    "operator",
    "heightInches",
    "heightUpperInches",
    "heightLowerInches",
    "widthInches",
    "weightTons",
    "postedLoadTons",
    "trucksBanned",
    "commercialBan",
    "gcpTruckException",
    "passengerOnlyHeightInches",
    "noTrucksLower",
    "noHazmat",
    "restrictionNote",
    "geometryRole",
    "labelLng",
    "labelLat",
  ];

  for (const f of facilities.features) {
    const p = f.properties || {};
    const id = str(p.id);
    if (!id || !f.geometry) continue;
    const role = str(p.geometryRole) || (f.geometry.type === "Point" ? "point" : "line");
    const kindRaw = str(p.kind, "road");
    const kind = (
      ["bridge", "tunnel", "parkway", "underpass", "road", "highway"].includes(kindRaw)
        ? kindRaw
        : "road"
    ) as AwarenessKind;
    const state = stateFromId(id);
    const featureProps = makeProps({
      id,
      name: str(p.name, id),
      kind,
      geometryRole: role === "line" ? "line" : "point",
      state,
      operator: str(p.operator) || null,
      limits: {
        heightInches: num(p.heightInches),
        heightUpperInches: num(p.heightUpperInches),
        heightLowerInches: num(p.heightLowerInches),
        widthInches: num(p.widthInches),
        weightTons: num(p.weightTons),
        postedLoadTons: num(p.postedLoadTons),
      },
      access: {
        trucksBanned: flag(p.trucksBanned),
        commercialBan: flag(p.commercialBan),
        commercialException: flag(p.gcpTruckException),
        passengerOnlyHeightInches: num(p.passengerOnlyHeightInches),
        noTrucksLower: flag(p.noTrucksLower),
        hazmatBanned: flag(p.noHazmat),
        restriction: str(p.restrictionNote) || null,
      },
      sources: [
        {
          sourceId: "facilities-curated",
          agency: str(p.operator, "curated"),
          dataset: "Facilities",
          recordId: id,
          sourceUrl: "",
          retrievedAt: new Date().toISOString(),
        },
      ],
      extras: {
        labelLng: num(p.labelLng),
        labelLat: num(p.labelLat),
        layer: "facility",
        ...leftovers(p, facilitySkip),
      },
    });

    if (
      role === "line" &&
      (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
    ) {
      putLine({ type: "Feature", geometry: f.geometry, properties: featureProps });
    } else if (f.geometry.type === "Point") {
      putPoint({
        type: "Feature",
        geometry: f.geometry,
        properties: { ...featureProps, geometryRole: "point" },
      });
    }
  }

  // Major crossings last so curated crossing tags win over facility duplicates.
  for (const f of majorCrossings.features) {
    const p = f.properties || {};
    const id = str(p.id);
    if (!id || f.geometry?.type !== "Point") continue;
    putPoint({
      type: "Feature",
      geometry: f.geometry,
      properties: makeProps({
        id,
        name: str(p.name, id),
        kind: "crossing",
        geometryRole: "point",
        state: NJ_CROSSINGS.has(id) ? "NJ" : "NY",
        operator: str(p.operator) || null,
        limits: { heightInches: num(p.heightIn), widthInches: num(p.widthIn) },
        access: { hazmatBanned: flag(p.noHazmat) },
        sources: [
          {
            sourceId: "panynj-crossings",
            agency: "PANYNJ / MTA",
            dataset: "Major crossings (curated)",
            recordId: id,
            sourceUrl: "",
            retrievedAt: new Date().toISOString(),
          },
        ],
        extras: {
          facilityKind: str(p.kind, "bridge"),
          layer: "major-crossing",
          ...leftovers(p, ["id", "name", "kind", "operator", "heightIn", "widthIn", "noHazmat"]),
        },
      }),
    });
  }

  const pointCollection: AwarenessPointCollection = {
    type: "FeatureCollection",
    features: [...pointMap.values()].sort((a, b) =>
      a.properties.id.localeCompare(b.properties.id),
    ),
  };
  const lineCollection: AwarenessLineCollection = {
    type: "FeatureCollection",
    features: [...lineMap.values()].sort((a, b) =>
      a.properties.id.localeCompare(b.properties.id),
    ),
  };

  const metadata = {
    builtAt: new Date().toISOString(),
    schema: "awareness-v1",
    points: pointCollection.features.length,
    lines: lineCollection.features.length,
    pointKinds: counts(pointCollection.features),
    lineKinds: counts(lineCollection.features),
    sources: [
      "clearances-nyc-li.geojson",
      "parkways-nyc-li.geojson",
      "posted-load-nyc-li.geojson",
      "facilities-nyc-li.geojson",
      "major-crossings.geojson",
    ],
    note: "Unified from existing public layers. Extras preserved. NYC truck routes / closures / loading zones remain separate.",
  };

  await writeFile(`${PUBLIC}/awareness-points.geojson`, JSON.stringify(pointCollection));
  await writeFile(`${PUBLIC}/awareness-lines.geojson`, JSON.stringify(lineCollection));
  await writeFile(`${PUBLIC}/awareness-unified-metadata.json`, JSON.stringify(metadata, null, 2));

  console.log("Wrote awareness-points.geojson", pointCollection.features.length, metadata.pointKinds);
  console.log("Wrote awareness-lines.geojson", lineCollection.features.length, metadata.lineKinds);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
