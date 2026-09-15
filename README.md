# Heads Up

A free, map-first tool for exploring posted vehicle clearances around NYC, Long Island, the Hudson Valley, southwest Connecticut, and NYC-facing New Jersey. Enter your vehicle height; red markers are at or below it, and orange markers are 1–12 inches above it. No account, payment, destination, or routing service is required.

**Status:** local working prototype. The app builds successfully for Vercel, but has not been deployed or field-verified. See [data-audit.md](data-audit.md) for source findings and outstanding launch work.

## Run locally

Use Node.js 22.9+ (tested here with Node 25.2.1).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. Stop the server with Ctrl+C. Edit files under `src/`; the browser updates automatically. The same folder can also be opened in Cursor.

```sh
npm test
npm run typecheck
npm run build
```

## Data pipeline

The committed snapshot lets the app run without calling government APIs. Basemap tiles still need network access.

```sh
npm run data:fetch
npm run data:build
npm test
```

`data:fetch` downloads and validates official sources, checks the NYSDOT total, and records hashes and retrieval time. `data:build` verifies those hashes, parses source-specific formats, emits posted GeoJSON, and writes audit reports. Review snapshot test changes before accepting updated counts. There is no automatic scheduled refresh yet.

- `scripts/sources/nysdot-posted-height.ts`: posted-on/under adapter and validated decimal-foot conversion (NYC, LI, Hudson Valley).
- `scripts/sources/nysdot-posted-load.ts`: posted-load tons from the same NYSDOT commercial-vehicle feed.
- `scripts/sources/ctdot-posted-height.ts`: CTDOT posted feet+inches for Fairfield and New Haven County.
- `scripts/sources/nyc-low-bridges.ts`: legacy KML adapter preserving directional values.
- `public/data/awareness-points.geojson` / `awareness-lines.geojson`: unified dots and corridors the map reads.
- `data/raw/`: reproducible source snapshots and provenance.
- `data/audit/`: normalized NYC records, overlap candidates, omitted fields, and statistics.
- `src/lib/clearance.ts`: height validation, formatting, and warning thresholds.

NYC's 149 legacy locations are **not** labeled as posted warnings. They are retained for audit until their age and clearance semantics are resolved. The warning layer uses NYSDOT and CTDOT posted fields only — never NBI measured heights as signs.

## Product behavior

- `/`: vehicle-height entry.
- `/map?height=108`: map for a 9 ft vehicle.
- URL parameters `lat`, `lng`, `z`, `bridge`, `from`, and `to` preserve the map view, selected record, and optional path check.
- From/To on the map traces a driving path and lists posted records near it. This is not turn-by-turn navigation.
- Clustered markers expand on click; individual records open source details.
- Gray optional markers mean more than 12 inches above your height, not guaranteed fit.
- Mobile layout includes a map and accessible clearance list.
- `/methodology`: sources, dates, limitations, and posting rules.

MapLibre handles the map; Next.js, React, and TypeScript handle the UI. Static GeoJSON keeps infrastructure simple. Fonts are served locally. No analytics, tracking accounts, or geolocation storage are configured. The current basemap is OpenStreetMap raster tiles, subject to its usage policy; the provider receives tile requests. Location requires an explicit button click.

## Deployment

This is a standard Next.js project. On Vercel use the Next.js preset, `npm run build`, and the default output configuration. No data API keys are needed. The production build uses the committed data snapshot, so agency downtime does not break deployment.

Before public launch, complete the audit's outstanding checks and choose a tile-hosting arrangement appropriate for expected traffic. The current OSM endpoint cannot promise viral-scale availability. If replacing the tiles using `NEXT_PUBLIC_TILE_URL`, update attribution and methodology for that provider. The app currently sets `robots` to noindex while it is a prototype; remove that only when ready for public discovery.

## Scope

Posted clearance is separate from road legality, weights, truck restrictions, and routing. The application never adds New York's one-foot posting allowance to hazard calculations. Missing data does not guarantee clearance.
