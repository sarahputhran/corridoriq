import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["engine/**/*.test.ts", "lib/**/*.test.ts"], environment: "node", exclude: ["tests/e2e/**", "node_modules/**"] },
});
