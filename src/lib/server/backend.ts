import "server-only";
import { getServerEnv } from "./env";
import { handleMockRequest } from "@/lib/mock/server";

export interface BackendRequest {
  method: string;
  /** Ruta del backend, con barra inicial: "/conversations/123/messages". */
  path: string;
  /** Query string con "?" inicial o cadena vacía. */
  search?: string;
  headers?: Record<string, string>;
  body?: ArrayBuffer | string | null;
  accessToken?: string | null;
}

/** El backend no respondió (caído, sin red o techo de tiempo superado). Distinto de un error HTTP. */
export class BackendUnavailableError extends Error {
  constructor(
    readonly reason: "timeout" | "network",
    cause?: unknown,
  ) {
    super(reason === "timeout" ? "El backend no respondió a tiempo" : "No se pudo conectar con el backend", { cause });
    this.name = "BackendUnavailableError";
  }
}

/** Llama a bk-crm (modo live) o al backend simulado (modo mock) y devuelve la respuesta tal cual. */
export async function backendFetch(req: BackendRequest): Promise<Response> {
  const env = getServerEnv();
  const headers: Record<string, string> = { accept: "application/json", ...req.headers };
  if (req.accessToken) headers.authorization = `Bearer ${req.accessToken}`;

  if (env.mode === "mock") {
    return handleMockRequest({
      method: req.method.toUpperCase(),
      path: req.path,
      search: req.search ?? "",
      headers,
      body: typeof req.body === "string" ? req.body : req.body ? new TextDecoder().decode(req.body) : null,
    });
  }

  try {
    return await fetch(`${env.backendUrl}${req.path}${req.search ?? ""}`, {
      method: req.method,
      headers,
      body: req.body ?? undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(env.backendTimeoutMs),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new BackendUnavailableError(isTimeout ? "timeout" : "network", error);
  }
}
