import type { ApiErrorBody, Paginated } from "./types";
import { MAX_PAGE_SIZE } from "./types";

/** Evento global para que la app lleve al login cuando la sesión terminó. */
export const SESSION_EXPIRED_EVENT = "crm:session-expired";

/**
 * Error de una llamada al backend.
 * - status 0 / 503 / 504: no se pudo consultar (red, servidor caído o lento). No es "no hay datos".
 * - status 401 con code SESSION_EXPIRED: hay que volver a iniciar sesión.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(messages[0] ?? `Error ${status}`);
    this.name = "ApiError";
  }

  /** El problema fue de conexión o disponibilidad, no una respuesta de negocio. */
  get isUnavailable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isSessionExpired(): boolean {
    return this.status === 401;
  }
}

const GENERIC: Record<number, string> = {
  0: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
  400: "Los datos enviados no son válidos.",
  401: "Tu sesión terminó. Vuelve a iniciar sesión.",
  403: "Tu rol no tiene permiso para esta acción.",
  404: "No se encontró el recurso solicitado.",
  409: "La acción no es posible en el estado actual. Actualiza e inténtalo de nuevo.",
  429: "Demasiados intentos. Espera un momento.",
  500: "El servidor tuvo un error interno.",
  502: "El servidor del CRM no respondió correctamente.",
  503: "El servidor del CRM no está disponible en este momento.",
  504: "El servidor del CRM tardó demasiado en responder.",
};

function toMessages(status: number, body: unknown): string[] {
  const raw = (body as ApiErrorBody | null)?.message;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const cleaned = list.map((m) => String(m)).filter((m) => m && m !== "Unauthorized");
  return cleaned.length ? cleaned : [GENERIC[status] ?? `Error ${status}`];
}

export type QueryValue = string | number | boolean | null | undefined;

/**
 * Serializa la query como la exige el backend: omite vacíos/undefined (un parámetro vacío es 400),
 * booleanos como "true"/"false".
 */
export function toSearch(query?: object): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    params.set(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: object;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Base del proxy del BFF. En tests se puede sobrescribir. */
export const API_BASE = "/api/backend";

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, headers, signal } = options;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${toSearch(query)}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, [GENERIC[0]!]);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const code = (parsed as ApiErrorBody | null)?.code;
    const error = new ApiError(res.status, toMessages(res.status, parsed), code, parsed);
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw error;
  }
  return parsed as T;
}

export interface CollectedPages<T> {
  rows: T[];
  total: number;
  /** true si se cortó la lectura al llegar a `maxPages` (no se leyeron todos los registros). */
  truncated: boolean;
}

/**
 * Lee todas las páginas de un listado (límite 100 por página) hasta `maxPages`.
 * Se usa para calendario y estadísticas, donde el backend no tiene agregados.
 */
export async function collectPages<T>(
  fetchPage: (page: number, limit: number) => Promise<Paginated<T>>,
  maxPages = 20,
): Promise<CollectedPages<T>> {
  const first = await fetchPage(1, MAX_PAGE_SIZE);
  const rows = [...first.data];
  const totalPages = first.pagination.totalPages;
  const lastPage = Math.min(totalPages, maxPages);
  if (lastPage > 1) {
    const rest = await Promise.all(Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2, MAX_PAGE_SIZE)));
    for (const page of rest) rows.push(...page.data);
  }
  return { rows, total: first.pagination.total, truncated: totalPages > maxPages };
}

/** Clave de idempotencia válida para el backend (16–80 caracteres [A-Za-z0-9_-]). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(20, "0");
}
