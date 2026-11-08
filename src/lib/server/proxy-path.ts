import "server-only";

/**
 * Rutas de bk-crm que no se exponen por el proxy del BFF: tienen manejador propio o son de servidor a
 * servidor. Sin distinguir mayúsculas, porque Express (NestJS) enruta así: "/Auth/Refresh" llega a
 * "/auth/refresh".
 */
const BLOCKED = [/^\/auth\/(login|refresh|logout|forgot-password|reset-password|test-admin)$/i, /^\/webhooks(\/|$)/i];

/**
 * Convierte los segmentos del catch-all de /api/backend en la ruta de bk-crm, o null si no se puede
 * reenviar. Se rechazan los segmentos vacíos, "." y "..": `fetch` normaliza la URL antes de enviarla, así
 * que "/conversations/../auth/refresh" llegaría como "/auth/refresh" y esquivaría el bloqueo.
 */
export function toBackendPath(segments: readonly string[]): string | null {
  if (segments.length === 0) return null;
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  const path = `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  return BLOCKED.some((re) => re.test(path)) ? null : path;
}
