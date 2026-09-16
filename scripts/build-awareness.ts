import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";

import {
  NYC_NLZ_SIGNS_ID,
  NYC_NLZ_SIGNS_PAGE,
  NYC_SIGN_WORK_ORDERS_ID,
  NYC_SIGN_WORK_ORDERS_PAGE,
  buildLoadingZonesCollection,
  type RawLoadingSign,
} from "./sources/nyc-loading-zones";
import {
  NYC_STREET_CLOSURES_ID,
  NYC_STREET_CLOSURES_PAGE,
  buildStreetClosuresCollection,
} from "./sources/nyc-street-closures";
import {
  NYC_TRUCK_ROUTES_ID,
  NYC_TRUCK_ROUTES_PAGE,
  buildTruckRoutesCollection,
} from "./sources/nyc-truck-routes";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "data");
const BUILT_DIR = path.join(ROOT, "data", "built");

type RawProps = Record<string, string | undefined>;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchAllTruckRouteFeatures() {
  const pageSize = 5000;
  let offset = 0;
  const features: Feature<MultiLineString | LineString, RawProps>[] = [];

  for (;;) {
    const url = new URL(
      `https://data.cityofnewyork.us/resource/${NYC_TRUCK_ROUTES_ID}.geojson`,
    );
    url.searchParams.set("$limit", String(pageSize));
    url.searchParams.set("$offset", String(offset));

    const collection = await fetchJson<FeatureCollection<MultiLineString | LineString, RawProps>>(
      url.toString(),
    );
    const batch = collection.features ?? [];
    if (batch.length === 0) break;
    features.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }

  return features;
}

async function fetchActiveStreetClosureRows() {
  const today = new Date().toISOString().slice(0, 10);
  const pageSize = 2000;
  let offset = 0;
  const rows: Record<string, string>[] = [];

  for (;;) {
    const url = new URL(
      `https://data.cityofnewyork.us/resource/${NYC_STREET_CLOSURES_ID}.json`,
    );
    url.searchParams.set("$limit", String(pageSize));
    url.searchParams.set("$offset", String(offset));
    url.searchParams.set("$where", `workenddate >= '${today}'`);

    const batch = await fetchJson<Record<string, string>[]>(url.toString());
    if (batch.length === 0) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchPagedSignRows(datasetId: string, where: string) {
  const pageSize = 5000;
  let offset = 0;
  const rows: RawLoadingSign[] = [];

  for (;;) {
    const url = new URL(`https://data.cityofnewyork.us/resource/${datasetId}.json`);
    url.searchParams.set("$limit", String(pageSize));
    url.searchParams.set("$offset", String(offset));
    url.searchParams.set("$where", where);
    url.searchParams.set(
      "$select",
      [
        "order_number",
        "record_type",
        "borough",
        "on_street",
        "from_street",
        "to_street",
        "side_of_street",
        "sign_code",
        "sign_description",
        "sign_x_coord",
        "sign_y_coord",
      ].join(","),
    );

    const batch = await fetchJson<RawLoadingSign[]>(url.toString());
    if (batch.length === 0) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchTruckLoadingSignRows() {
  return fetchPagedSignRows(
    NYC_SIGN_WORK_ORDERS_ID,
    [
      "record_type = 'Current'",
      "sign_x_coord IS NOT NULL",
      "sign_y_coord IS NOT NULL",
      "(",
      "upper(sign_description) like '%TRUCK LOADING%'",
      "OR upper(sign_description) like '%TRUCKS LOADING%'",
      ")",
    ].join(" "),
  );
}

async function fetchNeighborhoodLoadingSignRows() {
  return fetchPagedSignRows(
    NYC_NLZ_SIGNS_ID,
    "record_type = 'Current' AND sign_x_coord IS NOT NULL AND sign_y_coord IS NOT NULL",
  );
}

async function main() {
  console.log("Fetching NYC Truck Routes...");
  const routeFeatures = await fetchAllTruckRouteFeatures();
  const routes = buildTruckRoutesCollection(routeFeatures);
  console.log(`  ${routes.features.length} unique segments with geometry`);

  console.log("Fetching active NYC Street Closures...");
  const closureRows = await fetchActiveStreetClosureRows();
  const closures = buildStreetClosuresCollection(closureRows);
  console.log(`  ${closures.features.length} active block closures with line geometry`);

  console.log("Fetching NYC truck + neighborhood loading signs...");
  const [truckLoadingRows, nlzRows] = await Promise.all([
    fetchTruckLoadingSignRows(),
    fetchNeighborhoodLoadingSignRows(),
  ]);
  const loadingZones = buildLoadingZonesCollection(truckLoadingRows, nlzRows);
  console.log(
    `  ${loadingZones.features.length} current loading-zone signs with coordinates` +
      ` (${truckLoadingRows.length} truck rows, ${nlzRows.length} NLZ rows fetched)`,
  );

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(BUILT_DIR, { recursive: true });

  const routesPath = path.join(OUT_DIR, "truck-routes-nyc.geojson");
  const closuresPath = path.join(OUT_DIR, "street-closures-nyc.geojson");
  const loadingPath = path.join(OUT_DIR, "loading-zones-nyc.geojson");
  const metaPath = path.join(BUILT_DIR, "awareness-metadata.json");

  await writeFile(routesPath, `${JSON.stringify(routes)}\n`);
  await writeFile(closuresPath, `${JSON.stringify(closures)}\n`);
  await writeFile(loadingPath, `${JSON.stringify(loadingZones)}\n`);

  const withRestriction = routes.features.filter(f => Boolean(f.properties.restriction)).length;
  const byType = {
    Through: routes.features.filter(f => f.properties.routeType === "Through").length,
    Local: routes.features.filter(f => f.properties.routeType === "Local").length,
    "Limited Local": routes.features.filter(f => f.properties.routeType === "Limited Local").length,
    Other: routes.features.filter(f => f.properties.routeType === "Other").length,
  };
  const loadingByType = {
    truck: loadingZones.features.filter(f => f.properties.zoneType === "truck").length,
    neighborhood: loadingZones.features.filter(f => f.properties.zoneType === "neighborhood").length,
  };

  await writeFile(
    metaPath,
    `${JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        sources: {
          truckRoutes: {
            dataset: NYC_TRUCK_ROUTES_ID,
            url: NYC_TRUCK_ROUTES_PAGE,
            segmentCount: routes.features.length,
            withRestrictionText: withRestriction,
            byRouteType: byType,
          },
          streetClosures: {
            dataset: NYC_STREET_CLOSURES_ID,
            url: NYC_STREET_CLOSURES_PAGE,
            activeCount: closures.features.length,
            filter: "workenddate >= today (build day); LINESTRING/MULTILINESTRING only",
            geometryNote:
              "WKT in EPSG:2263 (NY Long Island State Plane ftUS), converted to WGS84",
          },
          loadingZones: {
            truckSignsDataset: NYC_SIGN_WORK_ORDERS_ID,
            truckSignsUrl: NYC_SIGN_WORK_ORDERS_PAGE,
            neighborhoodSignsDataset: NYC_NLZ_SIGNS_ID,
            neighborhoodSignsUrl: NYC_NLZ_SIGNS_PAGE,
            signCount: loadingZones.features.length,
            byZoneType: loadingByType,
            filter: "record_type = Current with State Plane coordinates",
            geometryNote: "sign_x_coord/sign_y_coord in EPSG:2263 → WGS84 points",
          },
        },
        notes: [
          "Awareness overlays only — not used for path routing.",
          "NYC only; Long Island clearances remain separate.",
          "Truck restrictions are segments with non-empty restrictio text.",
          "Loading zones are curb sign locations, not guaranteed open spaces.",
        ],
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${routesPath}`);
  console.log(`Wrote ${closuresPath}`);
  console.log(`Wrote ${loadingPath}`);
  console.log(`Wrote ${metaPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
