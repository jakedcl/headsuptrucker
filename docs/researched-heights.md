# Researched corridor / facility heights

State GIS feeds omitted corridor heights for several parkways and crossings.
Values below come from operator postings, NYSDOT / bridge inventory underclearances
on structures **over** the corridor, or NJ admin code. We do **not** invent heights —
remaining gaps stay null and paint gray unknown.

Inventory underclearances are **location-specific physical evidence**, not signed
whole-road “maximum height” regulations. Commercial bans stay primary where they apply.

| ID | Name | Height | Basis |
|---|---|---:|---|
| `brooklyn` | Brooklyn Bridge | **132″ (11′0″)** | NYCDOT posted roadway restriction; trucks banned + 3 t posted load |
| `cross-bay` | Cross Bay Veterans Memorial Bridge | **166–182″ (13′10″–15′2″)** | MTA B&T six directional approach limits (page updated Mar 9, 2026); controlling **13′10″**; width 9′6″ |
| `rfk` | RFK Bridge (Triborough) | **155–182″ (12′11″–15′2″)** | MTA B&T six span/direction limits (page updated Mar 9, 2026); controlling **12′11″** Harlem River Lift from Manhattan; width 9′6″ |
| `parkway-saw-mill-river-parkway` | Saw Mill River Parkway | **91″ (7′7″)** | NYSDOT inventory — Yonkers Ave over Saw Mill |
| `parkway-bronx-river-parkway-westchester` | Bronx River Parkway (Westchester) | **104″ (8′8″)** | NYSDOT inventory |
| `parkway-hutchinson-river-parkway-westchester` | Hutchinson River Parkway (Westchester) | **114″ (9′6″)** | NYSDOT inventory |
| `parkway-cross-county-parkway` | Cross County Parkway | **132″ (11′0″)** | NYSDOT inventory |
| `parkway-taconic-state-parkway` | Taconic State Parkway | **120″ (10′0″)** | NYSDOT inventory |
| `parkway-nj-palisades-interstate-parkway` | Palisades Interstate Parkway | **139″ (11′7″)** | NYSDOT inventory (NY); commercial ban remains primary |
| `parkway-nj-garden-state-parkway` | Garden State Parkway (north of Exit 105) | **162″ (13′6″)** | N.J.A.C. 19:9-1.9 **legal vehicle-height ceiling** — roadway regulation, not a verified min bridge clearance |
| `parkway-sprain-brook-state-parkway` | Sprain Brook State Parkway | **168″ (14′0″)** | NYSDOT inventory ≈4.27 m under Kimball Ave / NY-100B |
| `parkway-korean-war-vets-parkway-richmond` | Korean War Vets Parkway (Richmond) | **172″ (14′4″)** | NYSDOT inventory ≈4.37 m under Huguenot Ave |
| `parkway-seven-lakes-parkway` | Seven Lakes Parkway | **182″ (15′2″)** | NYSDOT inventory ≈4.62 m under I-87 near Sloatsburg (corridor traffic under that overcrossing) |
| `parkway-nj-pulaski-skyway` | Pulaski Skyway | **163″ (13′7″)** | Bridge inventory overhead mins ≈4.15–4.27 m (full width; not confirmed signed); NJDOT truck/bus ban primary |
| `parkway-long-mountain-parkway` | Long Mountain Parkway | **168″ (14′0″)** | No posted corridor height — default 14′ because this corridor has no height restriction |

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

### RFK (Triborough) — exact published spans (MTA)

| Span and direction | Height |
|---|---:|
| Harlem River Lift Span from Manhattan | 12′11″ |
| Harlem River Lift Span to Manhattan | 14′0″ |
| Bronx Truss Spans from the Bronx | 13′3″ |
| Bronx Truss Spans to the Bronx | 14′0″ |
| Queens Suspended Span from Queens | 15′2″ |
| Queens Suspended Span to Queens | 14′9″ |

Same MTA source as Cross Bay. The old NYC truck-route string (“Frm MN Height 13′5″”) is not used.

## Still no trustworthy corridor height (left null → gray)

| ID | Why left blank |
|---|---|
| `parkway-cross-bay-parkway` | Commercial ban only (the **parkway**, not the MTA Cross Bay bridge) |
| `parkway-ocean-parkway-n-y-c` | Belt Parkway / Ocean reconstruction clearance notes are historical project specs, not verified current posted corridor height |
| `parkway-lake-welch-parkway` | No verified numeric posting. Geometry is in Harriman State Park (north of the default NYC view). Discarded a false/generic “6′11″” claim and a bad derived 12′ guess |
| `parkway-farragut-parkway` | Commercial ban only; no corridor height found |

## Discarded (not used)

- Generic Long Island parkway tables (Southern State 6′8″, etc.) — different corridors
- Coach-Net / trip-planner dumps — no Lake Welch; not corridor-authoritative for our gaps
- “Lake Welch / NY parkways as low as 6′11″” snippets — not a Lake Welch posting
- Treating unknown as unlimited clearance — never

Applied by `npm run data:apply-researched-heights`.
