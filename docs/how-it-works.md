# How it works

Heads Up has no database and no backend of its own for the data. A set of scripts turns public agency datasets into static GeoJSON files that are committed to the repo, and the browser loads those files and does all the clearance checking itself. The only server code is two small proxy routes for place search and driving routes. Paths are relative to the repo root.

For the source findings and launch checklist see `data-audit.md`, and for corridor heights that came from research rather than a feed see `docs/researched-heights.md`.

## The big picture

```
agency feeds ──fetch──▶ data/raw/ ──build──▶ data/built/ ──unify──▶ public/data/awareness-*.geojson ──▶ map in the browser
```

- `data/raw/` holds the downloaded snapshots plus `manifest.json` with a SHA-256 for each file and the retrieval time.
- `data/built/` holds per-layer intermediates (clearances, parkways, facilities, posted loads, major crossings). The app does not serve these.
- `public/data/` is what the app actually loads. The main two files are `awareness-points.geojson` and `awareness-lines.geojson`. A few other layers sit beside them: NYC truck routes, street closures, loading zones, road features and labels, and crossing limits.

## The data pipeline

You can run the full pipeline end-to-end with **`npm run data:refresh`** (or **`npm run data:refresh:quick`** to rebuild without refetching from networks). A GitHub Action (`.github/workflows/data-refresh.yml`) runs `npm run data:refresh` every Monday at 03:00 UTC and opens a PR if agency data changed and all integrity assertions pass.

The underlying pipeline steps run in this order:

1. **`data:fetch`** (`scripts/fetch-sources.ts`) downloads the NYSDOT commercial-vehicle feed, the NYSDOT posted-load layer, CTDOT posted clearances (paged), and NYC's legacy low-bridge KML. It refuses to replace the snapshot if the NYSDOT record count doesn't match the feed's own count query, and it writes files to `.tmp` names first and renames them. It then writes the manifest.
2. **`data:fetch-nj`** (`scripts/fetch-nj-clearances.ts`) looks up the NJDOT truck-map structures in the NJDOT bridge layer by BRKEY, and grabs OpenStreetMap `maxheight` tags for NJ. It updates the manifest.
3. **`data:build`** (`scripts/build-dataset.ts`) checks every raw file against the manifest hashes and stops on a mismatch. Each agency has an adapter in `scripts/sources/` that parses its own format into one record shape. NYSDOT heights are stored as decimal feet, so the adapter only accepts values that round-trip to whole inches (see `data-audit.md`). Records are merged by id and a conflicting duplicate throws. OSM points within 40 m of an agency point are dropped so community tags never override a posted sign. It writes `data/built/clearances-nyc-li.geojson`, `data/built/posted-load-nyc-li.geojson`, the `data/audit/` reports and `public/data/metadata.json`.
4. **`data:awareness`** (`scripts/build-awareness.ts`) pulls NYC Open Data (truck routes, current street closures, loading-zone signs) straight into `public/data/`.
5. **Corridor layers.** `data:ct-awareness`, `data:hv-parkways` and `data:nj-awareness` fetch parkway and crossing rules and geometry for Connecticut, the Hudson Valley and New Jersey. `data:enrich-parkway-heights` and `data:apply-researched-heights` then fill in corridor heights. Each of these edits `data/built/parkways-nyc-li.geojson` and `facilities-nyc-li.geojson` in place, replacing only the features it owns. None of the scripts creates those two files from scratch, so they have to exist already (they are committed).
6. **`data:build-unified`** (`scripts/build-unified-awareness.ts`) reads the intermediates and writes the two unified files using the schema in `src/lib/awareness-schema.ts`. Every feature carries its limits, access rules, notes and a `sources` list with agency, dataset, record id, URL and retrieval time. Unknown values are left null, never guessed.

`scripts/sources/registry.ts` is a written list of feeds and their status. No script reads it, so treat it as notes.

Road features, road labels and crossing limits under `public/data/` are committed files that none of the scripts here regenerate.

## The app

- **Entry.** `/` takes a vehicle height (12 inches up to 13′6″). Anything taller shows the "oversized loads" message. `/map` is the map, and `/methodology` explains sources and limits.
- **State lives in the URL.** `height`, `width`, `weight`, `commercial`, `lat`, `lng`, `z`, `bridge`, `facility`, `from`, `to` and `route` are all read from the query string in `map-explorer.tsx`, so a link reproduces a view.
- **Loading.** The map fetches `awareness-points.geojson` and `awareness-lines.geojson` once, then `src/lib/awareness-project.ts` converts them into the flatter shapes the map and detail cards use. The optional layers (truck routes, closures, loading zones, road features, crossing limits) are only fetched when their toggle is switched on.
- **Colours.** For a posted clearance, `getClearanceSeverity` in `src/lib/clearance.ts` gives red when the clearance is at or below your height, orange when it is 1 to 12 inches above, and clear otherwise. Facilities (parkways, bridges, tunnels) go through `src/lib/facility-status.ts`. Height is always checked. Width and weight only count if you entered them, and a commercial ban only applies if you tick commercial. A facility with no known limit is gray "unknown" rather than promoted to a warning.
- **Route check.** From/To calls `/api/drive`, which resolves both places with Nominatim (restricted to the coverage box), waits 1.1 seconds between the two lookups, asks OSRM for up to 3 alternatives and keeps the ones that differ meaningfully (`keepDistinctRoutes` in `src/lib/path.ts`). In the browser, `featuresAlongRoute` keeps posted clearance points within 120 m of each route line, orders them along it, and `scoreRoute` counts how many are red or orange. It only looks at clearance points, not parkway bans or weight limits.
- **Place suggestions** come from `/api/places`, which is the same Nominatim search limited to 6 results.
- **Map.** MapLibre GL with the worker file copied into `public/maplibre/` by `scripts/prepare-maplibre.mjs` (run on install, dev and build). The basemap style comes from `NEXT_PUBLIC_MAP_STYLE`, defaulting to CARTO Voyager.

## Environment variables

All optional. The defaults work without any keys.

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_MAP_STYLE` | MapLibre style URL for the basemap |
| `OSRM_URL` | Routing server (default: the public OSRM demo server) |
| `NOMINATIM_URL` | Geocoder (default: the public OpenStreetMap Nominatim) |

## Limits worth knowing

- **Not field-verified.** The data is what agencies publish. NYC's 149 legacy locations are kept in `data/audit/` but not shown as posted warnings.
- **Coverage is a bounding box** (`COVERAGE` in `src/lib/path.ts`), roughly NYC, Long Island, the Hudson Valley, southwest Connecticut and northern New Jersey. Searches and routes outside it are rejected.
- **The data goes stale.** It is a snapshot with no scheduled refresh.
- **Routing and geocoding use public demo servers.** OSRM and Nominatim have usage policies and no uptime promise. That is what `OSRM_URL` and `NOMINATIM_URL` are for.
- **It is a clearance check, not navigation.** Routes are not chosen for your vehicle height.
- **Corridor heights are sometimes derived.** Where a state feed had no height for a parkway, a value comes from the lowest nearby posted clearance or from research (`docs/researched-heights.md`). Those are evidence, not a signed limit. Where nothing was found the corridor stays gray.
- **Tests run against the committed data.** `npm test` runs `tests/*.test.ts` with `tsx`, and some of them read the snapshots in `data/`, so refreshing the data can change counts that the tests pin.
