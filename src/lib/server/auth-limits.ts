import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { clientIp } from "./client-ip";
import { getServerEnv } from "./env";
import { createRateLimiter } from "./rate-limit";
import { jsonError } from "./session";

const WINDOW_MS = 15 * 60_000;

/**
 * Intentos por IP del navegador cada 15 minutos. bk-crm ya limita por cuenta (5 logins por minuto);
 * esto cubre lo que el límite por cuenta no ve: probar contraseñas contra muchas cuentas a la vez.
 * Holgado para un equipo que comparte la conexión del restaurante.
 */
const LIMITERS = {
  login: createRateLimiter({ limit: 20, windowMs: WINDOW_MS }),
  "forgot-password": createRateLimiter({ limit: 10, windowMs: WINDOW_MS }),
  "reset-password": createRateLimiter({ limit: 10, windowMs: WINDOW_MS }),
};

export type AuthAttempt = keyof typeof LIMITERS;

export interface AuthAttemptCheck {
  /** Respuesta 429 si la IP superó el límite; null si se puede seguir. */
  blocked: NextResponse | null;
  /** Cabeceras para bk-crm: con `TRUST_PROXY=1` cuenta sus límites con la IP del navegador. */
  forwardHeaders: Record<string, string>;
}

/**
 * Límite por IP de las rutas públicas de sesión. Solo funciona con `CRM_TRUST_PROXY` (proxies inversos
 * delante de Next.js): sin él no se conoce la IP del navegador y no se limita ni se reenvía nada.
 */
export function checkAuthAttempt(request: NextRequest, attempt: AuthAttempt): AuthAttemptCheck {
  const ip = clientIp(request.headers, getServerEnv().trustProxyHops);
  if (!ip) return { blocked: null, forwardHeaders: {} };

  const result = LIMITERS[attempt].hit(ip);
  if (!result.allowed) {
    const minutes = Math.ceil(result.retryAfterSeconds / 60);
    const blocked = jsonError(
      429,
      `Hubo demasiados intentos desde tu conexión. Inténtalo de nuevo en ${minutes === 1 ? "1 minuto" : `${minutes} minutos`}.`,
      "TOO_MANY_ATTEMPTS",
    );
    blocked.headers.set("retry-after", String(result.retryAfterSeconds));
    return { blocked, forwardHeaders: {} };
  }
  // Se reemplaza (no se agrega) la cabecera: el navegador nunca escribe lo que bk-crm va a creer.
  return { blocked: null, forwardHeaders: { "x-forwarded-for": ip } };
}
