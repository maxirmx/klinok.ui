import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.KLINOK_E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
  reporter: process.env.CI ? "github" : "list",
});
