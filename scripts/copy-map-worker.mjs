// MapLibre runs its tile parsing in a web worker loaded from a URL. Turbopack does not bundle that file,
// so it is copied into public/ and the map is pointed at it (components/map/CorridorMap.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const from = join("node_modules", "maplibre-gl", "dist");
const to = join("public", "maplibre");
mkdirSync(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(from, file), join(to, file));
