import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-receipt",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm.cmd run dev -- --port 3001",
    url: "http://localhost:3001",
    env: {
      NEXT_PUBLIC_BASE_SEPOLIA_REPORT_RECEIPT_ADDRESS:
        "0x1111111111111111111111111111111111111111",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
