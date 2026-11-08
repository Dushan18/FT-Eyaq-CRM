/**
 * Backend simulado (modo mock): implementa el mismo contrato HTTP que bk-crm (rutas, roles, filtros,
 * paginación, validación de propiedades no declaradas y reglas de negocio) sobre el estado en memoria.
 * Contrato: docs/frontend-api-completo.md. No inventa endpoints que bk-crm no tenga.
 *
 * Las rutas viven por módulo en ./routes; aquí solo se despachan: guards (sesión y rol), UUID de la
 * ruta, body JSON y errores con el formato del GlobalExceptionFilter de bk-crm.
 */
import { buildSeed } from "./seed";
import { HttpError, UUID_RE, fail, hasRole, json, type Route } from "./http";
import { authRoutes, readToken } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { customerRoutes } from "./routes/customers";
import { inboxRoutes } from "./routes/inbox";
import { reservationRoutes } from "./routes/reservations";
import { getStore, iso, type MockStore, type MockUser } from "./store";

export interface MockRequestInput {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  body: string | null;
}

export function mockStore(): MockStore {
  return getStore(() => buildSeed());
}

const ROUTES: Route[] = [...authRoutes, ...catalogRoutes, ...customerRoutes, ...reservationRoutes, ...inboxRoutes];

function compile(pattern: string) {
  const names: string[] = [];
  const re = new RegExp(`^${pattern.replace(/:([a-zA-Z]+)/g, (_m, name: string) => {
    names.push(name);
    return "([^/]+)";
  })}$`);
  return { re, names };
}

const COMPILED = ROUTES.map((r) => ({ ...r, ...compile(r.pattern) }));

function authenticate(store: MockStore, headers: Record<string, string>): { user: MockUser; sessionId: string } | null {
  const auth = headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const payload = readToken(auth.slice(7));
  if (!payload || typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  const session = store.sessions.find((s) => s.id === payload.sessionId);
  if (!session || session.revoked || session.expiresAt < Date.now()) return null;
  const user = store.users.find((u) => u.id === payload.sub);
  if (!user || !user.isActive) return null;
  return { user, sessionId: session.id };
}

/** Pausa artificial para que los estados de carga sean visibles en la demo. */
const LATENCY_MS = Number(process.env.CRM_MOCK_LATENCY_MS ?? 120);

export async function handleMockRequest(input: MockRequestInput): Promise<Response> {
  if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));
  const store = mockStore();
  const path = decodeURI(input.path);
  const route = COMPILED.find((r) => r.method === input.method && r.re.test(path));
  if (!route) {
    return json(404, { message: `Cannot ${input.method} ${path}`, error: "Not Found", statusCode: 404 });
  }

  const match = route.re.exec(path)!;
  const params: Record<string, string> = {};
  route.names.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1]!)));
  // Las cabeceras se comparan en minúsculas, como en Express.
  const headers = Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v]));

  try {
    // El parser de JSON actúa antes que los guards.
    let body: Record<string, unknown> = {};
    if (input.body) {
      try {
        const parsed = JSON.parse(input.body);
        body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        fail(400, "Unexpected token in JSON");
      }
    }

    let user: MockUser | null = null;
    let sessionId: string | null = null;
    if (route.access !== "PUBLIC") {
      const auth = authenticate(store, headers);
      if (!auth) return json(401, { message: "Unauthorized", statusCode: 401 });
      user = auth.user;
      sessionId = auth.sessionId;
      if (route.access !== "AUTH" && !hasRole(user, route.access)) {
        fail(403, "No tienes permisos para realizar esta acción");
      }
    }
    // ParseUUIDPipe en cada parámetro de la ruta (:id, :draftId, :commercialItemId).
    if (Object.values(params).some((v) => !UUID_RE.test(v))) fail(400, "Validation failed (uuid is expected)");

    return route.handler({ store, user, sessionId, params, query: new URLSearchParams(input.search), body, headers });
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, error.body);
    console.error("[mock] error no controlado", error);
    return json(500, { statusCode: 500, message: "Ocurrió un error interno", path, method: input.method, timestamp: iso(Date.now()) });
  }
}
