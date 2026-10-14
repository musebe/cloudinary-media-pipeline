import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3003";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testMatch: /(preview|execution)\.spec\.ts/,
      use: { viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /(preview|execution)\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },
    { name: "local-api", testMatch: "api.spec.ts" },
  ],
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3003",
    env: {
      MEDIA_PIPELINE_TEST_BUILD: "true",
      ENABLE_LIVE_PIPELINE: "false",
      DEMO_SESSION_SECRET:
        "synthetic-browser-test-session-secret-at-least-32-characters",
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
    },
    url: baseURL + "/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
