# AGENTS.md — headsuptrucker

"Heads Up": a free, map-first tool showing posted vehicle clearances around NYC, Long Island, the Hudson Valley, SW Connecticut, and NYC-facing NJ. The user enters a vehicle height; red markers are at or below it, orange are 1–12 in above. No accounts or routing service.

## Dev framework

This repo follows Jake's dev framework: [jakedcl/dev-framework](https://github.com/jakedcl/dev-framework) (start at its `AGENTS.md`). The framework is the source of truth; if anything in this file conflicts with it, the framework wins.

The framework repo is private. Cloud agents open it with `git clone --depth 1 https://x-access-token:${DEV_FRAMEWORK_READ_TOKEN}@github.com/jakedcl/dev-framework /tmp/dev-framework` (the token is a Cursor secret; never print or commit it).

## Stack
- Next.js 16.3, React 19.3, TypeScript, MapLibre GL 6.9. No CMS or database.
- Deployed on Vercel (headsuptrucker.vercel.app). Prototype, not field-verified.

## Layout
- `src/app/` pages: home, `map/`, `methodology/`, `api/`. `src/components/` map UI.
- `src/lib/` clearance math (`clearance.ts`), `vehicle-profile.ts`, `path.ts`, `geocode.ts`, `awareness-schema.ts`.
- `data/raw/` agency snapshots (hash-checked), `data/built/` GeoJSON the app reads, `data/audit/` reports.
- `scripts/` data pipeline; `scripts/sources/` has one adapter per agency.
- Read `docs/how-it-works.md` (data flow) and `data-audit.md` (source findings) before touching data.

## Commands
- Node 22.9+. `npm run dev` (binds 127.0.0.1:3000), `npm test` (tsx --test), `npm run typecheck`, `npm run build`.
- Data: `npm run data:fetch`, `data:build`, `data:build-unified`, plus the `data:*` merge scripts in package.json.
- `predev`/`prebuild`/`postinstall` run `scripts/prepare-maplibre.mjs`. Don't remove them.

## Gotchas
- Safety rules: never treat unknown height as unlimited. Never add NY's one-foot posting allowance. Never show NBI measured heights as posted signs.
- Unknown values stay null; never guess. Every feature keeps its `sources` list.
- `data:build` stops on a raw-file hash mismatch. Update the manifest on purpose; don't bypass it.
- OSM points within 40 m of an agency point are dropped so community tags never override a posted sign.
- NYC's 149 legacy locations are not posted warnings. Keep them for audit only.
