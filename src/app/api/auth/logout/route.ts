import { NextResponse, type NextRequest } from "next/server";
import { backendFetch } from "@/lib/server/backend";
import { getServerEnv } from "@/lib/server/env";
import { applyCookies, refreshSession } from "@/lib/server/session";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedSessionCookies, isExpiringSoon } from "@/lib/server/tokens";

/**
 * Cierra la sesión en el backend (revoca la sesión actual) y borra las cookies.
 * Las cookies se borran siempre, aunque el backend no responda.
 */
export async function POST(request: NextRequest) {
  const env = getServerEnv();
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value ?? null;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null;

  try {
    // El backend exige un access token vigente para revocar la sesión.
    if ((!accessToken || isExpiringSoon(accessToken, 5)) && refreshToken) {
      const outcome = await refreshSession(refreshToken);
      accessToken = outcome.kind === "ok" ? outcome.tokens.accessToken : null;
    }
    if (accessToken) {
      await backendFetch({ method: "POST", path: "/auth/logout", accessToken });
    }
  } catch {
    // Sin conexión no se puede revocar en el servidor; la sesión vence sola (máximo 7 días).
  }

  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  return applyCookies(response, clearedSessionCookies(env.cookieSecure));
}
