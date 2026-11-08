import type { NextConfig } from "next";

/**
 * Hosts extra que pueden usar el servidor de desarrollo (recarga en caliente), además de localhost:
 * p. ej. la IP de red para abrir la app desde el celular u otro equipo. Se definen en .env.local
 * (Next lo carga antes que este archivo): CRM_DEV_ORIGINS=192.168.100.8. Solo afecta a `next dev`.
 */
const devOrigins = (process.env.CRM_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
