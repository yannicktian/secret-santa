import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: "360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 640 } } },
    { name: "1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "node scripts/dev-server.js",
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(port), SECRET_SANTA_STORE: "memory", ADMIN_PASSWORD: "admin-fictif-e2e" },
  },
});
