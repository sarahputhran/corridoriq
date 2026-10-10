import { defineConfig } from "@playwright/test";

// Three smoke flows against the local dev server and the real demo database.
// They change demo data, so the demo is reset before and after the run (tests/e2e/reset.ts).
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  globalSetup: "./tests/e2e/reset.ts",
  globalTeardown: "./tests/e2e/reset.ts",
  // Uses the Chrome already installed on this machine. Set PW_CHANNEL= (empty) to use Playwright's own Chromium instead.
  use: { channel: process.env.PW_CHANNEL ?? "chrome", baseURL: "http://localhost:3000", viewport: { width: 1280, height: 900 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  reporter: [["list"]],
});
