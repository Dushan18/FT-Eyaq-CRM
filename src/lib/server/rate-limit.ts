import "server-only";

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos hasta que se reinicia la ventana de esta clave. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult;
}

/** Tope de claves en memoria: ante muchas IPs distintas se descartan primero las más antiguas. */
const MAX_KEYS = 10_000;

/**
 * Límite de ventana fija por clave, en la memoria del proceso. Basta porque el BFF corre en una sola
 * instancia (ver README, «Despliegue»); con varias, cada una tendría su propio conteo.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  const makeRoom = (now: number) => {
    for (const [key, w] of windows) {
      if (w.resetAt <= now) windows.delete(key);
    }
    for (const key of windows.keys()) {
      if (windows.size < MAX_KEYS) break;
      windows.delete(key);
    }
  };

  return {
    hit(key, now = Date.now()) {
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        if (!w && windows.size >= MAX_KEYS) makeRoom(now);
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      return { allowed: w.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
    },
  };
}
