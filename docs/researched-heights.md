# Researched corridor / facility heights

State GIS feeds omitted corridor heights for several parkways and for Brooklyn Bridge.
These values come from operator postings and NYSDOT bridge inventory
(`PERMITTED_VC_UNDER` / `POSTED_VRT_CLRNC_UNDER` on structures **over** the corridor).
We do **not** invent heights — remaining gaps stay null and paint gray unknown.

| ID | Name | Height | Basis |
|---|---|---:|---|
| `brooklyn` | Brooklyn Bridge | **132″ (11′0″)** | NYCDOT posted roadway restriction (Gothamist / Wikipedia); trucks banned + 3 t posted load |
| `parkway-saw-mill-river-parkway` | Saw Mill River Parkway | **91″ (7′7″)** | NYSDOT inventory BIN 5500530 — Yonkers Ave over Saw Mill (`POSTED_VRT_CLRNC_UNDER` 7.58′) |
| `parkway-bronx-river-parkway-westchester` | Bronx River Parkway (Westchester) | **104″ (8′8″)** | NYSDOT inventory BIN 3348850 — Parkway Viaduct over 907G (8.67′) |
| `parkway-hutchinson-river-parkway-westchester` | Hutchinson River Parkway (Westchester) | **114″ (9′6″)** | NYSDOT inventory BIN 1037390 — NY 120A King St over Hutch (9.50′) |
| `parkway-cross-county-parkway` | Cross County Parkway | **132″ (11′0″)** | NYSDOT inventory BIN 5500529 — Saw Mill over Cross County / 907K (11.00′) |
| `parkway-taconic-state-parkway` | Taconic State Parkway | **120″ (10′0″)** | NYSDOT inventory BIN 1045300 — NY 301 over Taconic (10.00′) |
| `parkway-nj-palisades-interstate-parkway` | Palisades Interstate Parkway | **139″ (11′7″)** | NYSDOT inventory BIN 1040880 — CR 110 over PIP (11.58′); commercial ban remains primary |

## Still no trustworthy corridor height (left null → gray)

| ID | Why left blank |
|---|---|
| `parkway-cross-bay-parkway` | Commercial ban only; no overcrossing mins in inventory / NYC low-bridge KML |
| `parkway-ocean-parkway-n-y-c` | Same |
| `parkway-korean-war-vets-parkway-richmond` | Same |
| `parkway-sprain-brook-state-parkway` | No inventory overcrossings matched to corridor geometry |
| `parkway-lake-welch-parkway` | No overcrossing mins for corridor traffic |
| `parkway-long-mountain-parkway` | No overcrossing mins in inventory |
| `parkway-seven-lakes-parkway` | Only underpass *under* the parkway (not corridor traffic) |
| `parkway-nj-garden-state-parkway` | North of Exit 105 is a GVWR / class ban; no published corridor height |
| `parkway-nj-pulaski-skyway` | Trucks/buses banned by NJDOT order; no published passenger corridor height |

Applied by `npm run data:apply-researched-heights`.
