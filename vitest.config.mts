import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resuelve el alias "@/..." de tsconfig.json.
    tsconfigPaths: true,
    alias: {
      // "server-only" lanza error fuera de React Server Components; en pruebas se reemplaza por un módulo vacío.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Las pruebas nunca llaman al backend real: el BFF usa el backend simulado y sin latencia artificial.
    env: { TZ: "America/Lima", CRM_BACKEND_MODE: "mock", CRM_MOCK_LATENCY_MS: "0" },
  },
});
