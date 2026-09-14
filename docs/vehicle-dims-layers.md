# Vehicle dimensions → unlock awareness layers

Kickoff + **data research** (2026-09-14). Still awareness, not legal routing. Missing data ≠ clear road.

## Shipped on this branch

| Input | Unlocks on map |
|---|---|
| Height (existing) | Clearance pins |
| **Width (in)** | Crossing-limit lines (11 parsed `restrictio` patterns) |
| **Weight (tons)** | Posted-load bridge pins (~75) |
| **Commercial** | Parkway ban lines |

Also toggleable with legend: bridges / tunnels / expressways (+ labels), major crossings, truck routes, closures, loading zones.

GeoJSON in `public/data/`: `posted-load-nyc-li`, `parkways-nyc-li`, `road-features-nyc`, `road-labels-nyc`, `crossing-limits-nyc`, `major-crossings`.

## What we already ship

| Layer | Source | Structured dims? |
|---|---|---|
| Posted vertical clearances | NYSDOT Comm Vehicle / height feed | **Height** (numeric) — live product |
| NYC truck routes | NYC Open Data `jjja-shxy` | Network only; `restrictio` is **free text** (~860 segs, **11 unique strings**) |
| Street closures | NYC DOT | Time/space, not vehicle size |
| Loading zones | NYC | Curb use, not size |

The old “posted limits on these routes” overlay was just truck-route segments with non-empty `restrictio`. It looked like bans; it was notes (height/width/weight/time/hazmat mixed).

## What we can actually get next

### 1. NYSDOT CommVehicleDataFeed (best structured GIS)

Service: `https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer`

| Layer | NYC/LI signal | Fields that matter |
|---|---|---|
| **Posted Height Bridges** (1) | ~535 with posted vertical | `POSTED_VRT_CLRNC_ON` / `_UNDER` (same family as today’s map) |
| **Posted Load Bridges** (0) | **~75** with `POSTED_LOAD_TONS > 0` | Numeric **weight** posting (tons) |
| **Parkways** (2) | ~36 segs in Region 11 | `CV_RESTRICTIONS` — almost all “No Commercial Vehicles” (+ GCP exception text) |
| **Bridges** (3) | ~3k inventory points | Broader inventory; use posted subsets, not everything |

Also present: `TOTAL_HZ_CLEARANCE_ON` / `_UNDER` (numeric feet). **Do not treat these as “max vehicle width” without a dictionary check** — samples look like structure/roadway horizontal clearance, with sentinels like `99.99`.

Sibling: [NYSDOT Structures](https://gis.dot.ny.gov/hostingny/rest/services/Asset/NYSDOT_Structures/FeatureServer/0) (`PostedLoadtons`, `RPosted`) and [PostedBridges](https://gis.dot.ny.gov/hostingny/rest/services/Geocortex/PostedBridges/MapServer) (R-posted / load-posted / closed).

### 2. Parse the 11 truck-route restriction strings (finite!)

Unique `restrictio` texts already in our GeoJSON mention height, width, weight, axle, flammables, time-of-day. Examples:

- Height + width + weight (Holland-ish pattern)
- “No trucks on lower level”
- “No trucks in central tube”
- Peak-hour no through trucks

**Idea:** curated parser for those 11 strings → structured `{height?, width?, weight?, flags[]}` on known segments. Small, high-value, honest about coverage.

### 3. Major crossings — hand-curated (no good public API)

| Operator | What they publish | Machine-readable? |
|---|---|---|
| **MTA Bridges & Tunnels** | Per-crossing height / width / weight | Web pages only |
| **PANYNJ** | GWB, Holland, Lincoln, etc. H/W/weight/hazmat | PDF / HTML only |

Worth a tiny curated GeoJSON (8–15 facilities): Brooklyn Bridge truck ban, tunnel heights (QMT / Hugh L. Carey ~12′1″), PANYNJ tunnel widths, etc. High user value; maintain manually.

### 4. Citywide rules (context chips, not map geometry)

[NYC size & weight](https://www.nyc.gov/html/dot/html/motorist/sizewt.shtml): default tractor-trailer envelope (~13′6″ H, 8′ W / 8′6″ STAA, length caps, 80k GVW / bridge formula). Good for “your truck vs city default” UI, not per-bridge pins.

### 5. Weak / skip for now

- NYC Bridge Ratings open data — condition ratings, not postings.
- NYC 2009 low-bridges KML — already audited; not posted-authoritative.
- Hoping FHWA NBI alone solves NYC width postings — inventory ≠ local posted signs.

## Product shape (fits the “unlock layers” idea)

1. **Height** (have) → clearance hazard coloring.
2. **Weight (tons)** → unlock **posted-load bridges** (~75 NYC/LI) from CommVehicle layer 0 / Structures.
3. **Width** → unlock **parsed route notes** + **curated crossing limits**; *not* raw `TOTAL_HZ_*` until semantics confirmed.
4. **Vehicle class: commercial** → unlock **parkways banned** polyline layer (clean win).
5. Optional later: hazmat / axle flags from the same 11 strings + PANYNJ PDF.

UI sketch: height always; width/weight optional fields; layers appear or filter when those fields are set. Empty input = layer off or “enter weight to see load postings.”

## Suggested build order

1. Spike importer for CommVehicle **Posted Load** + **Parkways** (Region 11 + LI if desired).
2. Dictionary pass on `TOTAL_HZ_*` vs true posted width (inventory manual / sample BINs).
3. Tiny curated **crossings** file (MTA + PANYNJ + Brooklyn Bridge).
4. Parser for the 11 `restrictio` strings → structured props (replace the old dotted-red “all text” overlay with something filterable).
5. Wire optional width/weight inputs → layer unlock / filter.

## Honesty rules (product copy)

- Posted load ≠ your legal route.
- Parkway ban ≠ every local street ban.
- Curated crossings can go stale — date the file, link sources.
- No data on a segment never means “wide/heavy OK.”
