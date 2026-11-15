import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    channel: "chromium",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    // Launch Next directly so Playwright can stop its process on Windows too.
    command: "node node_modules/next/dist/bin/next start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
  },
});
