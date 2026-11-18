# NYC + Long Island clearance data audit

> **Note:** This document is the original September 2026 NYC + Long Island source audit. Current regional coverage, agencies, and limitations are described on [/methodology](https://headsuptrucker.vercel.app/methodology).

Snapshot retrieved 2026-09-14 UTC (2026-09-13 local). This is a source audit, not field verification of signs.

## Result

The first map contains **555 posted-clearance records across 535 NYSDOT structures**. NYC's **149 legacy locations** are parsed and retained for comparison, but not promoted to posted warnings. No cross-source records were merged.

| County | NYSDOT structures | Under-road postings | On-bridge postings |
|---|---:|---:|---:|
| Bronx | 48 | 45 | 5 |
| Kings | 49 | 44 | 9 |
| New York | 83 | 71 | 20 |
| Queens | 125 | 115 | 16 |
| Richmond | 7 | 7 | 0 |
| Nassau | 146 | 146 | 0 |
| Suffolk | 77 | 77 | 0 |
| Total | 535 | 505 | 50 |

The statewide layer returns 1,125 structures, verified against its count query. Twenty launch-area structures have both on and under postings; these are separate roadway restrictions, not duplicate display records.

## NYSDOT semantics and conversion

[Live layer and fields](https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer/1). [Inventory manual](https://www.dot.ny.gov/divisions/engineering/structures/repository/manuals/inventory/NYSDOT_inventory_manual_2020.pdf), printed page 73, defines posted-on and posted-under values as signage for their respective roadways; zero can mean a removed posting and blanks indicate no posting. It distinguishes postings from measured clearances.

The ArcGIS double fields use **decimal feet rounded to hundredths**. This encoding is empirically identified from the entire snapshot: every fractional part of the under field is one of `.00, .08, .17, .25, .33, .42, .50, .58, .67, .75, .83, .92`, exactly the hundredth-foot representation of whole-inch increments. The layer metadata does not explicitly declare this encoding; the importer therefore accepts only values that round-trip to that pattern. It does not interpret `.83` as 83 inches, round arbitrary decimals, or add a physical-clearance allowance.

Conversion: `inches = round(decimalFeet * 12)`, accepted only if rounding `inches / 12` to two decimals reproduces the raw value. Non-finite, string, non-positive, sentinel, and out-of-range values are rejected. New encodings require review.

Real source fixtures:

| BIN | Carried feature | Posted-under raw | Normalized |
|---|---|---:|---|
| 1520229 | PENINSULA BLVD | 8.83 | 8′ 10″ |
| 1520190 | FRANKLIN AVE | 7.75 | 7′ 9″ |
| 1059680 | SEAMANS NECK RD | 8.08 | 8′ 1″ |
| 7709540 | LIRR PT JEFF BR | 10.92 | 10′ 11″ |

These fixtures confirm implementation against source fields, not signs in the field. The Southern State corridor is represented in records with location text containing SSP and under-road reference codes beginning 908M. Other routes retain the agency's route-code labels; readable aliases should come from an authoritative route lookup, not guesswork.

`PERMITTED_VC_*` and `CARRIED_LABEL` are preserved in raw snapshots and never substitute for posted fields. For example, BIN 5524290 has a carried label of 14′1″, posted-on 13.25, and posted-under 13.5. Those concepts must not be interchanged. `POSTED_LEGEND` values N/O/P/R have no domain explanation in this layer. N appears on many positive posted-under records; it must not be treated as “no height posting.”

515 launch-area on/under fields are omitted because they contain no active posting. This counts fields, not lost structures. Locally owned structures are included: the exported records include city, county, railroad, authority, private, and state ownership.

## Geometry and direction

All 1,125 returned GeoJSON geometries are null, including when `returnGeometry=true` and `outSR=4326` are explicitly supplied. The importer uses NYSDOT's `LONGITUDE` and `LATITUDE` attributes, documented as decimal degrees in its manual. It validates finite numbers and a NYC/LI envelope after filtering by county. This is an attribute fallback, not a coordinate projection guess.

Points describe structures. Their coordinates are not guaranteed to mark signs or individual lanes. No explicit direction field is provided by this layer; directional applicability remains unknown even when some road names contain NB/SB. Arched structures appear in the inventory, but this is not a lane-specific arch-clearance map.

## NYC Open Data

[Catalog rn6h-i66u](https://data.cityofnewyork.us/Transportation/Citywide-Low-Bridges/rn6h-i66u) is an `href` asset with no Socrata columns. It points to the [official KML](https://www.nyc.gov/html/dot/downloads/misc/lowbridges_citywide_data_71309.kml). A plain curl request initially returned 403; a browser-style user agent succeeded.

The KML document title dates it 7-13-2009; the [readme](https://www.nyc.gov/html/dot/downloads/pdf/lowbridge_kml_readme_july09.pdf) says July 14, 2009. The catalog modification on October 30, 2024 is not evidence that these values were updated. Its “Annually” metadata is not a verified current refresh cadence.

149 placemarks contain HTML tables inside CDATA descriptions. Fields include BRIDGE, Highway, BRIDGE_CLEARANCE_FEET/INCHES, four directional feet/inches pairs, Bridge Owner, and Borough. Coordinates are longitude/latitude. 36 placemarks contain non-zero directional values. The adapter preserves all of them, including the overall minimum. A `(0, 0)` direction is missing data, never a zero-height hazard.

The documentation describes low clearances on limited-access highways, explicitly excludes local streets, and does not unambiguously label all values as posted signs. Accordingly, the adapter emits `clearanceType: unverified`. These records remain in `data/audit/nyc-normalized.json`, rather than being mislabeled as posted in the live layer. This is the evidence-based exception to the initial proposal to combine both datasets directly.

## Overlaps and conflicts

A 60-meter proximity review found **145 candidate pairs involving 118 NYC legacy locations**. Only 53 pairs share the same numeric clearance; 92 differ. These are proximity candidates, not proven matched structures. Road names and direction must still be reviewed. No shared BIN is available in the KML.

The audit exports every candidate with both names and heights to `data/audit/overlap-candidates.json`. No cross-source display merge is made, and no old NYC value overrides NYSDOT. Within NYSDOT, identity is BIN plus on/under applicability; a conflicting repeat identity fails the build.

## Distribution and freshness

Across 555 roadway posting records, counts strictly below each height are: 8 ft: 16; 9 ft: 36; 10 ft: 108; 11 ft: 225; 12 ft: 339; 13 ft: 539. For a 9 ft vehicle, 40 records are red and 78 orange across the whole exported dataset (viewport counts differ).

The NYSDOT snapshot's `Date_FC_Updated` is 2026-09-13T09:05:27Z. We label it a layer update, not a sign inspection date. Download time is separately stored with SHA-256 hashes and a verified source count in `data/raw/manifest.json`. Refresh frequency is not asserted from one observation. Live downloads are a separate command from app builds.

## Remaining launch work

- Compare representative sign postings and coordinates with current agency evidence, especially parkway arches and structures with multiple roads.
- Confirm the service's conversion semantics with an agency data dictionary or maintainer beyond the empirical encoding checks.
- Review the full NYC overlap report and resolve the legacy dataset's posted-versus-measured semantics before incorporating its warnings.
- Audit named corridor coverage across the other Long Island parkways. A matching region count does not establish complete corridor coverage.
- Consider authoritative county polygons for stronger coordinate QA and official reference-route names for readable labels.
- Confirm production tile capacity and hosting. The default Carto Voyager vector style (`NEXT_PUBLIC_MAP_STYLE`) is a best-effort public service; heavy traffic may require a dedicated tile arrangement. No bulk downloads, prefetch, proxying, or cache bypass are implemented.

Source gaps must remain visible. A missing marker is never evidence of unrestricted clearance.
