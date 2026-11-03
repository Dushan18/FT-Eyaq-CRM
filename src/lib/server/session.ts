import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { backendFetch, BackendUnavailableError, type BackendRequest } from "./backend";
import { getServerEnv } from "./env";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearedSessionCookies,
  isExpiringSoon,
  sessionCookies,
  type CookieSpec,
} from "./tokens";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export type RefreshOutcome =
  | { kind: "ok"; tokens: SessionTokens }
  /** El backend rechazó el refresh token: la sesión terminó y hay que volver a iniciar sesión. */
  | { kind: "invalid" }
  /** No se pudo consultar al backend: NO es un cierre de sesión. */
  | { kind: "unavailable" };

/**
 * El refresh token del backend es de un solo uso (rotación). Si varias peticiones del mismo usuario
 * intentan renovarlo a la vez, solo una puede ganar; por eso se comparte una única renovación por token
 * y se recuerda el resultado unos segundos para peticiones que todavía llegan con el token anterior.
 */
interface RefreshRegistry {
  inflight: Map<string, Promise<RefreshOutcome>>;
  recent: Map<string, { tokens: SessionTokens; until: number }>;
}

const REUSE_WINDOW_MS = 60_000;

const registry: RefreshRegistry = ((globalThis as { __crmRefreshRegistry?: RefreshRegistry }).__crmRefreshRegistry ??= {
  inflight: new Map(),
  recent: new Map(),
});

function pruneRecent(now: number) {
  for (const [key, entry] of registry.recent) {
    if (entry.until <= now) registry.recent.delete(key);
  }
}

async function doRefresh(refreshToken: string): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await backendFetch({
      method: "POST",
      path: "/auth/refresh",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (error) {
    if (error instanceof BackendUnavailableError) return { kind: "unavailable" };
    throw error;
  }
  if (res.status === 401 || res.status === 400) return { kind: "invalid" };
  if (!res.ok) return { kind: "unavailable" };
  const body = (await res.json()) as Partial<SessionTokens>;
  if (typeof body.accessToken !== "string" || typeof body.refreshToken !== "string") return { kind: "unavailable" };
  return { kind: "ok", tokens: { accessToken: body.accessToken, refreshToken: body.refreshToken } };
}

export async function refreshSession(refreshToken: string): Promise<RefreshOutcome> {
  const now = Date.now();
  pruneRecent(now);
  const reused = registry.recent.get(refreshToken);
  if (reused) return { kind: "ok", tokens: reused.tokens };

  const running = registry.inflight.get(refreshToken);
  if (running) return running;

  const promise = doRefresh(refreshToken)
    .then((outcome) => {
      if (outcome.kind === "ok") {
        registry.recent.set(refreshToken, { tokens: outcome.tokens, until: Date.now() + REUSE_WINDOW_MS });
      }
      return outcome;
    })
    .finally(() => registry.inflight.delete(refreshToken));
  registry.inflight.set(refreshToken, promise);
  return promise;
}

export function applyCookies(response: NextResponse, cookies: CookieSpec[]): NextResponse {
  for (const c of cookies) response.cookies.set(c);
  return response;
}

export function jsonError(status: number, message: string, code?: string): NextResponse {
  return NextResponse.json({ statusCode: status, message, ...(code ? { code } : {}) }, { status });
}

export function sessionExpired(): NextResponse {
  const env = getServerEnv();
  return applyCookies(
    jsonError(401, "Tu sesión terminó. Vuelve a iniciar sesión.", "SESSION_EXPIRED"),
    clearedSessionCookies(env.cookieSecure),
  );
}

export function backendUnavailable(reason: "timeout" | "network" = "network"): NextResponse {
  return jsonError(
    reason === "timeout" ? 504 : 503,
    reason === "timeout"
      ? "El servidor del CRM tardó demasiado en responder. Inténtalo de nuevo."
      : "No se pudo conectar con el servidor del CRM. Inténtalo de nuevo en unos segundos.",
    "BACKEND_UNAVAILABLE",
  );
}

/** Copia la respuesta del backend (estado, tipo y cuerpo) a una respuesta del BFF. */
async function relay(res: Response): Promise<NextResponse> {
  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
  headers.set("cache-control", "no-store");
  if (res.status === 204 || res.status === 304) return new NextResponse(null, { status: res.status, headers });
  const body = await res.arrayBuffer();
  return new NextResponse(body, { status: res.status, headers });
}

/**
 * Reenvía una petición autenticada al backend con el access token de la cookie, renovándolo antes de
 * que venza o tras un 401, y actualiza las cookies si hubo renovación.
 */
export async function proxyWithSession(request: NextRequest, req: Omit<BackendRequest, "accessToken">): Promise<NextResponse> {
  const env = getServerEnv();
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value ?? null;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null;

  if (!accessToken && !refreshToken) {
    return jsonError(401, "Inicia sesión para continuar.", "NO_SESSION");
  }

  const state: {
    accessToken: string | null;
    refreshToken: string | null;
    renewed: SessionTokens | null;
  } = { accessToken, refreshToken, renewed: null };

  const renew = async (): Promise<NextResponse | null> => {
    if (!state.refreshToken) return sessionExpired();
    const outcome = await refreshSession(state.refreshToken);
    if (outcome.kind === "invalid") return sessionExpired();
    if (outcome.kind === "unavailable") return backendUnavailable();
    state.renewed = outcome.tokens;
    state.accessToken = outcome.tokens.accessToken;
    state.refreshToken = outcome.tokens.refreshToken;
    return null;
  };

  if (!state.accessToken || isExpiringSoon(state.accessToken)) {
    const failure = await renew();
    if (failure) return failure;
  }

  let res: Response;
  try {
    res = await backendFetch({ ...req, accessToken: state.accessToken });
    if (res.status === 401 && !state.renewed) {
      const failure = await renew();
      if (failure) return failure;
      res = await backendFetch({ ...req, accessToken: state.accessToken });
    }
  } catch (error) {
    if (error instanceof BackendUnavailableError) return backendUnavailable(error.reason);
    throw error;
  }

  // Un 401 con un token recién renovado significa sesión revocada (cierre de sesión, usuario desactivado…).
  if (res.status === 401) return sessionExpired();

  const response = await relay(res);
  if (state.renewed) applyCookies(response, sessionCookies(state.renewed, env.cookieSecure));
  return response;
}
