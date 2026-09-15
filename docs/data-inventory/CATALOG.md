# Dimension / restriction data catalog

Everything we can use for height / width / weight / class unlocks.
Counts are NYC + Long Island unless noted. Snapshot probed 2026-09-14.

---

## A. Already live (height)

| What | Count | Shape | Unlock |
|---|---:|---|---|
| Posted vertical clearances | 555 roadway records / 535 structures | points | height → red/orange |

Source: NYSDOT posted-height feed (existing importer).

---

## B. Posted load bridges (weight) — NEW, structured

**Source:** NYSDOT `CommVehicleDataFeed` layer 0  
**Count:** **75** with `POSTED_LOAD_TONS > 0`  
**Range:** 3–36 tons (median 15)

| County | n |
|---|---:|
| New York | 25 |
| Suffolk | 18 |
| Queens | 14 |
| Nassau | 9 |
| Bronx | 5 |
| Kings | 3 |
| Richmond | 1 |

**Fields per point:** `BIN`, label, county, lat/lng, `POSTED_LOAD_TONS`, optional posted vertical, `OTHER_POSTING`, `R_POSTED` (all NO in this set).

**Display ideas:** purple/weight pins; filter to `postedTons < yourWeightTons`; detail “Posted load: Nt”.

**Notable:** Brooklyn Bridge approach family at **3t**; Rikers / Roosevelt Island bridges **36t**.

Full list: `posted-load-nyc-li.json`.

---

## C. Parkways / no commercial vehicles — NEW, structured

**Source:** same feed, layer 2 (polylines)  
**Count:** **56** segments in Regions 10 (LI) + 11 (NYC) = **28 named facilities** (usually 2 dirs each)

### Type 1 — “No Commercial Vehicles” (NYC-style)
Belt (Cross Island, Laurelton, Shore, Southern), Bronx Pelham, Bronx River, Cross Bay, FDR, Harlem River, Henry Hudson, Hutch (NYC), Jackie Robinson, Korean War Vets, Mosholu, Ocean (NYC), Shore Front, **Grand Central (most of it)**.

### Type 2 — Passenger-only + **94″ height** (LI parkways)
Bay/Ocean (LI), Bethpage, Loop, Meadowbrook, Northern State, Ocean (Nassau/Suffolk), Robert Moses Causeway, Sagtikos/Sunken Meadow, Southern State, Wantagh.

### Special exception
**Grand Central Parkway (RFK → BQE only):** commercial + single-unit trucks ≤ **12′6″**, ≤ 3 axles / 10 tires allowed. Rest of GCP = no commercial.

**Unlock:** vehicle class = commercial (or any truck) → show banned parkways. Optional: height ≤ 94″ still fails LI parkways.

Full list: `parkways-r10-11.json`.

---

## D. Truck-route `restrictio` notes — 11 unique strings (parseable)

**Source:** NYC Truck Routes (already in app) — **860** segments, **11** texts.

These are the old “posted limits” lines — but now we can structure them:

| # segs | Facility (from street names) | Parsed dims / flags |
|---:|---|---|
| 137 | **Williamsburg Bridge** | In: H 12′11″ W? Wt 10t · Out: H 13′4″ Wt 36t |
| 134 | **RFK Bridge** | From MN: H 13′5″ · From RI→QNS: **W 12′0″** |
| 122 | **Hugh L. Carey Tunnel** | H 12′1″ · **W 8′6″** · Wt 7.5t |
| 106 | **Ed Koch Queensboro** (upper) | H 11′6″ · Wt 15t |
| 72 | **Manhattan Bridge** | Up H 13′4″ · Low H 13′8″ · Wt 36t |
| 72 | **Verrazzano** | Upper H 15′0″ · **No trucks on lower** |
| 67 | **Holland Tunnel** | H 12′6″ · **W 8′0″** · 2–3 axle single-unit only · **No flamm/explosives** |
| 51 | **Queens Midtown Tunnel** | H 12′1″ · **W 8′6″** · Wt 7.5t |
| 40 | **Lincoln Tunnel** | H 13′0″ · **W 8′6″** · **No trucks central tube** · No flamm/explosives |
| 40 | **George Washington Bridge** | Up H 13′6″ · **W 8′6″** · **No trucks on lower** |
| 19 | **34th St** (E/W) | **No through trucks 11am–6pm** (time only) |

**Unlock:** width and/or weight filter against parsed numbers; flag chips for lane bans / hazmat / time.

Raw strings: `restrictio-unique.json`.

---

## E. Major crossings — curated (no GIS API)

Official pages (hand-maintain a small GeoJSON). Prefer operator numbers over truck-route text when they disagree.

### MTA Bridges & Tunnels
[Source](https://www.mta.info/agency/bridges-and-tunnels/trucks-commercial-vehicle-information) (updated Mar 9, 2026)

| Facility | Height | Width | Other |
|---|---|---|---|
| Queens Midtown Tunnel | **12′1″** | **8′6″** (tunnels) | Hazmat prohibited |
| Hugh L. Carey Tunnel | **12′1″** | **8′6″** | Hazmat prohibited |
| Henry Hudson Bridge | **12′0″** | 9′6″ bridges | **Trucks never allowed** |
| Verrazzano lower WB/EB | 13′7″ / 13′6″ | 9′6″ | |
| Verrazzano upper WB/EB | 14′6″ / 14′5″ | 9′6″ | |
| RFK (multi-span) | 12′11″–15′2″ by span/dir | 9′6″ | |
| Bronx-Whitestone | 15′0″ / 15′1″ | 9′6″ | |
| Throgs Neck | 15′2″ / 14′11″ | 9′6″ | |
| Cross Bay Veterans Memorial | **13′10″–15′2″** by approach (6 published) | 9′6″ | |
| Marine Parkway | multi by approach | 9′6″ | |
| All MTA crossings | — | — | NYS bridge formula; max **80k GVW** / axle caps |

Tunnel width blanket: **8′6″**. Bridge width blanket: **9′6″**.

### Port Authority (PANYNJ)
From published traffic rules / trucker pages (HTML flaky; treat as curated):

| Facility | Height | Width | Notes |
|---|---|---|---|
| Holland Tunnel | **12′6″** | **8′0″** | Tightest PA width |
| Lincoln Tunnel | **13′0″** | **8′6″** | |
| GWB / Bayonne / Goethals / Outerbridge | **13′6″** | **8′6″** | |

Weight: axle/tandem + GVW tables in PA PDF (curate summary, link out).

### City / other
| Facility | Note |
|---|---|
| **Brooklyn Bridge** | NYSDOT posted load **3t** on bridge/approaches; commercial trucks generally banned — show as ban + load |
| Park Ave Viaduct family | several **15t** postings |

---

## F. Horizontal clearance on height layer — DO NOT unlock as width (yet)

`TOTAL_HZ_CLEARANCE_*` on posted-height bridges: hundreds of values, mostly **≥20 ft** (roadway/structure width). Only ~30 under 20 ft. Sentinels `0` / `99.99`.  
**Not** the same as posted max vehicle width. Keep out of product until dictionary-confirmed.

---

## G. Already-available awareness (unchanged)

| Layer | Role |
|---|---|
| Truck routes network | where trucks *should* be |
| Street closures | temporary |
| Loading zones | curb |

---

## Suggested UI mapping (for your display pass)

| User input | Unlocks / filters |
|---|---|
| **Height** (have) | Clearance pins |
| **Weight (tons)** | Posted-load pins (75) + parsed Wt on crossing notes |
| **Width** | Parsed W on tunnels/bridges + curated MTA/PA width |
| **Commercial / truck class** | Parkway ban lines + Henry Hudson ban + “no trucks on lower level” flags |
| Optional hazmat | Holland / Lincoln / QMT / Carey flags |

Empty optional fields = those layers stay off (or dimmed “enter weight to see load postings”).
