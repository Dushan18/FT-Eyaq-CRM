import "server-only";

export const ACCESS_COOKIE = "crm_at";
export const REFRESH_COOKIE = "crm_rt";

/** Sesión absoluta del backend: 7 días desde el inicio de sesión. */
const REFRESH_FALLBACK_SECONDS = 7 * 24 * 60 * 60;
const ACCESS_FALLBACK_SECONDS = 15 * 60;

/** Lee `exp` (segundos epoch) de un JWT sin verificar la firma: solo se usa para programar la renovación. */
export function decodeJwtExp(token: string | undefined | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

/** true si el token vence en menos de `marginSeconds` (o no se puede leer). */
export function isExpiringSoon(token: string | undefined | null, marginSeconds = 30, nowMs = Date.now()): boolean {
  const exp = decodeJwtExp(token);
  if (exp === null) return true;
  return exp * 1000 - nowMs <= marginSeconds * 1000;
}

export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

function maxAgeFor(token: string, fallback: number, nowMs = Date.now()): number {
  const exp = decodeJwtExp(token);
  if (exp === null) return fallback;
  return Math.max(0, Math.floor(exp - nowMs / 1000));
}

export function sessionCookies(tokens: { accessToken: string; refreshToken: string }, secure: boolean): CookieSpec[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: tokens.accessToken,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: maxAgeFor(tokens.accessToken, ACCESS_FALLBACK_SECONDS),
    },
    {
      name: REFRESH_COOKIE,
      value: tokens.refreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: maxAgeFor(tokens.refreshToken, REFRESH_FALLBACK_SECONDS),
    },
  ];
}

export function clearedSessionCookies(secure: boolean): CookieSpec[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({
    name,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  }));
}
