import {
  CUSTOMER_STATUSES,
  type Customer,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerStatus,
  type ReservationListQuery,
} from "@/lib/api/types";
import { customerName, itemName } from "@/lib/domain/conversation";
import { initials, personName } from "@/lib/format/text";

export const CUSTOMERS_PAGE_SIZE = 20;
/** El backend acepta `search` de 1 a 200 caracteres tras recortar espacios. */
export const SEARCH_MAX_LENGTH = 200;

// ---------------------------------------------------------------- URL (`q`, `estado`, `pagina`)

/** Filtros de la vista tal como viven en la URL. */
export interface CustomerFilters {
  q: string;
  status: CustomerStatus | null;
  page: number;
}

/** Página válida para el backend (entero 1..1 000 000); cualquier otro valor vuelve a la 1. */
export function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
}

export function parseCustomerStatus(raw: string | null): CustomerStatus | null {
  return raw !== null && (CUSTOMER_STATUSES as readonly string[]).includes(raw) ? (raw as CustomerStatus) : null;
}

export function parseCustomerFilters(get: (key: string) => string | null): CustomerFilters {
  return {
    q: (get("q") ?? "").trim().slice(0, SEARCH_MAX_LENGTH).trim(),
    status: parseCustomerStatus(get("estado")),
    page: parsePage(get("pagina")),
  };
}

type UrlUpdate = Record<string, string | null>;

/** Una búsqueda nueva vuelve a la primera página; la búsqueda vacía no se escribe en la URL. */
export const searchUpdate = (q: string): UrlUpdate => ({ q: q || null, pagina: null });

/** Cambiar de estado vuelve a la primera página; "Todos" no se escribe en la URL. */
export const statusUpdate = (status: CustomerStatus | null): UrlUpdate => ({ estado: status, pagina: null });

/** La página 1 es el valor por defecto: no se escribe en la URL. */
export const pageUpdate = (page: number): UrlUpdate => ({ pagina: page > 1 ? String(page) : null });

// ---------------------------------------------------------------- peticiones

/** GET /customers: solo lo tipado y sin parámetros vacíos (el backend responde 400 a ambos). */
export function buildCustomerQuery(filters: CustomerFilters): CustomerListQuery {
  const query: CustomerListQuery = { page: filters.page, limit: CUSTOMERS_PAGE_SIZE };
  if (filters.q) query.search = filters.q;
  if (filters.status) query.status = filters.status;
  return query;
}

/**
 * GET /reservations para la columna RESERVAS: el listado de clientes no trae el conteo, así que se pide
 * una sola fila del cliente y se usa `pagination.total` (sin las canceladas).
 */
export function reservationCountQuery(customerId: string): ReservationListQuery {
  return { customerId, excludeCancelled: true, limit: 1 };
}

// ---------------------------------------------------------------- celdas

export interface CustomerIdentity {
  /** Título de la fila. */
  name: string;
  /** Segunda línea: teléfono, o correo si no hay teléfono. */
  contact: string | null;
  initials: string;
}

/**
 * Nombre y contacto de la fila. Los clientes creados por WhatsApp no tienen nombre: el título pasa a ser
 * el teléfono (como en `customerName`) y la segunda línea lo aclara en vez de repetir el número.
 */
export function customerIdentity(c: Pick<Customer, "firstName" | "lastName" | "phone" | "email">): CustomerIdentity {
  const fullName = personName(c.firstName, c.lastName, "");
  if (fullName) return { name: fullName, contact: c.phone ?? c.email ?? null, initials: initials(fullName) };
  const name = customerName(c);
  const contact = c.phone && c.email ? c.email : c.phone || c.email ? "Sin nombre registrado" : null;
  return { name, contact, initials: "?" };
}

/** Servicio del interés más reciente ("Consultó"): el backend ordena `interests` por lastInterestedAt desc. */
export function latestInterestName(detail: Pick<CustomerDetail, "interests">): string | null {
  const latest = detail.interests[0];
  return latest ? itemName(latest.commercialItem) : null;
}

/** Texto de una celda que se completa con una consulta propia por fila. */
export interface CellText {
  text: string;
  title?: string;
  /** Aún cargando ("…"). */
  pending?: boolean;
}

/** Lo mínimo de una consulta de TanStack Query para pintar la celda. */
interface CellSource<T> {
  data: T | undefined;
  isError: boolean;
}

const LOADING: CellText = { text: "…", pending: true };
const FAILED: CellText = { text: "—", title: "No se pudo cargar" };

/**
 * RESERVAS: "…" mientras carga y "—" si falla (nunca un 0 inventado). Si una actualización en segundo
 * plano falla, se conserva el último valor leído.
 */
export function reservationsCell(source: CellSource<number>): CellText {
  if (source.data !== undefined) return { text: String(source.data) };
  return source.isError ? FAILED : LOADING;
}

/** CONSULTÓ: nombre del servicio, "—" si el cliente no tiene intereses, con las mismas reglas de carga y error. */
export function interestCell(source: CellSource<string | null>): CellText {
  if (source.data === null) return { text: "—", title: "Sin intereses registrados" };
  if (source.data !== undefined) return { text: source.data, title: source.data };
  return source.isError ? FAILED : LOADING;
}

// ---------------------------------------------------------------- abrir la conversación

/** Estado de `useOpenChat` que importa a la fila. */
export interface ChatLookup {
  pendingId: string | null;
  notFound: string | null;
  failed: string | null;
}

export type ChatNotice = { kind: "opening" | "missing" | "failed"; text: string };

/** Aviso breve en la fila del cliente cuya conversación se está buscando o no se pudo abrir. */
export function chatNotice(chat: ChatLookup, customerId: string): ChatNotice | null {
  if (chat.pendingId === customerId) return { kind: "opening", text: "Abriendo…" };
  if (chat.notFound === customerId) return { kind: "missing", text: "Sin conversación" };
  if (chat.failed === customerId) return { kind: "failed", text: "No se pudo abrir" };
  return null;
}
