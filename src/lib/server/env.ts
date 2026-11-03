import "server-only";

/**
 * Configuración del servidor (BFF). Solo variables de servidor: nada de esto llega al navegador.
 * Ver .env.example para la descripción de cada variable.
 */

export type BackendMode = "live" | "mock";

export interface ServerEnv {
  /** "live" = bk-crm real; "mock" = backend simulado en memoria con datos de ejemplo. */
  mode: BackendMode;
  /** URL base de bk-crm, sin barra final. */
  backendUrl: string;
  /** Techo de tiempo para cada llamada al backend. */
  backendTimeoutMs: number;
  /** Cookies con atributo Secure (obligatorio en producción con HTTPS). */
  cookieSecure: boolean;
  /** Contraseña común de los usuarios simulados (solo modo mock). */
  mockPassword: string;
  /** Habilita el simulador de canales (solo modo mock). */
  simulatorEnabled: boolean;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(value.trim().toLowerCase());
}

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const isProduction = process.env.NODE_ENV === "production";
  const rawMode = (process.env.CRM_BACKEND_MODE ?? "live").trim().toLowerCase();
  if (rawMode !== "live" && rawMode !== "mock") {
    throw new Error(`CRM_BACKEND_MODE inválido: "${rawMode}". Usa "live" o "mock".`);
  }
  const mode = rawMode as BackendMode;

  // Regla de seguridad: el modo simulado acepta credenciales de prueba, así que no se permite en
  // producción salvo que se habilite explícitamente (por ejemplo, para una demo controlada).
  if (isProduction && mode === "mock" && !readBoolean(process.env.CRM_ALLOW_MOCK_IN_PRODUCTION, false)) {
    throw new Error(
      "CRM_BACKEND_MODE=mock no está permitido en producción. Usa live o define CRM_ALLOW_MOCK_IN_PRODUCTION=true para una demo.",
    );
  }

  const backendUrl = (process.env.CRM_BACKEND_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
  if (mode === "live" && !/^https?:\/\/[^\s]+$/.test(backendUrl)) {
    throw new Error(`CRM_BACKEND_URL inválida: "${backendUrl}".`);
  }

  cached = {
    mode,
    backendUrl,
    backendTimeoutMs: readInt(process.env.CRM_BACKEND_TIMEOUT_MS, 15000, 1000, 120000),
    cookieSecure: readBoolean(process.env.CRM_COOKIE_SECURE, isProduction),
    mockPassword: process.env.CRM_MOCK_PASSWORD?.trim() || "demo1234",
    simulatorEnabled: mode === "mock" && readBoolean(process.env.CRM_ENABLE_SIMULATOR, true),
  };
  return cached;
}
