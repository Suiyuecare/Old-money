import { defineConfig } from "@playwright/test";

const visualViewports = [
  { name: "390x844", viewport: { width: 390, height: 844 } },
  { name: "768x1024", viewport: { width: 768, height: 1024 } },
  { name: "1440x900", viewport: { width: 1440, height: 900 } },
] as const;

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/visual-qa",
  use: {
    baseURL: "http://127.0.0.1:3000",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
  },
  projects: visualViewports.map(({ name, viewport }) => ({
    name,
    use: { viewport, deviceScaleFactor: 1, reducedMotion: "reduce" },
  })),
});
