import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de punta a punta contra el frontend en modo mock (backend simulado + simulador de canales).
 * Si ya hay un servidor en E2E_BASE_URL se reutiliza; si no, se levanta `next dev` en modo mock.
 * Comparten el estado en memoria del servidor: cada prueba crea sus propios clientes y no reinicia datos.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "es-PE",
    timezoneId: "America/Lima",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { CRM_BACKEND_MODE: "mock", CRM_ENABLE_SIMULATOR: "true" },
  },
});
