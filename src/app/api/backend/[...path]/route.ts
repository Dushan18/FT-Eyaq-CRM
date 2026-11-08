import type { NextRequest } from "next/server";
import { toBackendPath } from "@/lib/server/proxy-path";
import { jsonError, proxyWithSession } from "@/lib/server/session";

/**
 * Proxy autenticado hacia bk-crm (mismo origen para el navegador, sin CORS y sin exponer tokens).
 * /api/backend/conversations?channel=WHATSAPP → GET {CRM_BACKEND_URL}/conversations?channel=WHATSAPP
 * Las rutas de sesión y los webhooks no se exponen (ver toBackendPath).
 */

/** Cabeceras del navegador que se reenvían; el resto (cookies incluidas) se descarta. */
const FORWARDED_HEADERS = ["content-type", "idempotency-key", "accept-language"];

async function handle(request: NextRequest, ctx: RouteContext<"/api/backend/[...path]">) {
  const { path } = await ctx.params;
  const backendPath = toBackendPath(path);
  if (backendPath === null) {
    return jsonError(404, "Ruta no disponible.");
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? null : await request.arrayBuffer();

  return proxyWithSession(request, {
    method,
    path: backendPath,
    search: request.nextUrl.search,
    headers,
    body: body && body.byteLength > 0 ? body : null,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
