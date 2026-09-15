# Researched corridor / facility heights

State GIS feeds omitted corridor heights for several parkways and for some
crossings. Values below come from operator postings, NYSDOT bridge inventory
(`PERMITTED_VC_UNDER` / `POSTED_VRT_CLRNC_UNDER` on structures **over** the
corridor), or NJ administrative code. We do **not** invent heights — remaining
gaps stay null and paint gray unknown.

| ID | Name | Height | Basis |
|---|---|---:|---|
| `brooklyn` | Brooklyn Bridge | **132″ (11′0″)** | NYCDOT posted roadway restriction; trucks banned + 3 t posted load |
| `cross-bay` | Cross Bay Veterans Memorial Bridge | **166–182″ (13′10″–15′2″)** | MTA B&T six directional approach limits (page updated Mar 9, 2026); controlling **13′10″**; width 9′6″ |
| `parkway-saw-mill-river-parkway` | Saw Mill River Parkway | **91″ (7′7″)** | NYSDOT inventory BIN 5500530 — Yonkers Ave over Saw Mill |
| `parkway-bronx-river-parkway-westchester` | Bronx River Parkway (Westchester) | **104″ (8′8″)** | NYSDOT inventory BIN 3348850 |
| `parkway-hutchinson-river-parkway-westchester` | Hutchinson River Parkway (Westchester) | **114″ (9′6″)** | NYSDOT inventory BIN 1037390 |
| `parkway-cross-county-parkway` | Cross County Parkway | **132″ (11′0″)** | NYSDOT inventory BIN 5500529 |
| `parkway-taconic-state-parkway` | Taconic State Parkway | **120″ (10′0″)** | NYSDOT inventory BIN 1045300 |
| `parkway-nj-palisades-interstate-parkway` | Palisades Interstate Parkway | **139″ (11′7″)** | NYSDOT inventory BIN 1040880 (NY); commercial ban remains primary |
| `parkway-nj-garden-state-parkway` | Garden State Parkway (north of Exit 105) | **162″ (13′6″)** | N.J.A.C. 19:9-1.9 **legal vehicle-height ceiling** — roadway regulation, not a verified minimum bridge clearance; separate commercial restrictions also apply |

### Cross Bay — exact published approaches (MTA)

| Direction and connection | Height |
|---|---:|
| Northbound from 94th Street | 15′2″ |
| Northbound from Beach Channel Drive traveling west | 13′10″ |
| Northbound from Beach Channel Drive traveling east | 14′1″ |
| Southbound to 95th Street | 15′2″ |
| Southbound to Beach Channel Drive traveling west | 15′2″ |
| Southbound to Beach Channel Drive traveling east | 14′0″ |

Source: [MTA Bridges & Tunnels truck / commercial vehicle information](https://www.mta.info/agency/bridges-and-tunnels/trucks-commercial-vehicle-information) (updated Mar 9, 2026).

## Still no trustworthy corridor height (left null → gray)

| ID | Why left blank |
|---|---|
| `parkway-cross-bay-parkway` | Commercial ban only (the **parkway**, not the MTA Cross Bay bridge above) |
| `parkway-ocean-parkway-n-y-c` | Commercial ban only; no corridor height found |
| `parkway-korean-war-vets-parkway-richmond` | Same |
| `parkway-sprain-brook-state-parkway` | No inventory overcrossings matched to corridor geometry |
| `parkway-long-mountain-parkway` | No overcrossing mins in inventory |
| `parkway-farragut-parkway` | Commercial ban only; no corridor height found |
| `parkway-nj-pulaski-skyway` | Trucks/buses banned by NJDOT order; no published passenger corridor height |

Applied by `npm run data:apply-researched-heights`.
