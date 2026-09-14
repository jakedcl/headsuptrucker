import { copyFile, mkdir } from "node:fs/promises";

// MapLibre 6 ships a separate module worker and shared module. Keep both
// same-origin and version-matched instead of relying on bundler import.meta URLs.
await mkdir("public/maplibre", { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(`node_modules/maplibre-gl/dist/${file}`, `public/maplibre/${file}`);
}
await copyFile("node_modules/maplibre-gl/LICENSE.txt", "public/maplibre/LICENSE.txt");
