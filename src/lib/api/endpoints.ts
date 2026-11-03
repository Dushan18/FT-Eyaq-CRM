/** Funciones tipadas por endpoint de bk-crm (vía el proxy /api/backend). */
import { apiFetch, newIdempotencyKey } from "./client";
import type {
  AssignConversationRequest,
  CommercialCategory,
  CommercialItem,
  CommercialItemListQuery,
  Conversation,
  CreateCommercialItemRequest,
  CreateUserRequest,
  Customer,
  CustomerDetail,
  CustomerListQuery,
  CustomerStatus,
  ListConversationsQuery,
  ListMessagesQuery,
  LoginUser,
  MarkConversationReadResponse,
  MeResponse,
  Message,
  Paginated,
  PutRestaurantConfigRequest,
  Reservation,
  ReservationDetail,
  ReservationListQuery,
  ReservationRequest,
  ReservationRequestListQuery,
  ReservationStatusTarget,
  RestaurantConfig,
  RoleCode,
  User,
  CommercialApprovalStatus,
} from "./types";

// ---------------------------------------------------------------- sesión (manejadores propios del BFF)

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  }).catch(() => null);
  if (!res) throw new Error("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
  const data = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new Error(typeof data?.message === "string" ? data.message : `Error ${res.status}`);
  return data as T;
}

export const sessionApi = {
  login: (email: string, password: string) => postJson<{ user: LoginUser }>("/api/auth/login", { email, password }),
  logout: () => postJson<{ ok: true }>("/api/auth/logout", {}),
  forgotPassword: (email: string) => postJson<{ message: string }>("/api/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) =>
    postJson<{ message: string }>("/api/auth/reset-password", { token, newPassword }),
  me: (signal?: AbortSignal) => apiFetch<MeResponse>("/auth/me", { signal }),
};

// ---------------------------------------------------------------- usuarios (solo ADMIN)

export const usersApi = {
  list: () => apiFetch<User[]>("/users"),
  create: (body: CreateUserRequest) => apiFetch<User>("/users", { method: "POST", body }),
  setActive: (id: string, isActive: boolean) =>
    apiFetch<User>(`/users/${id}/status`, { method: "PATCH", body: { isActive } }),
  setRoles: (id: string, roles: RoleCode[]) => apiFetch<User>(`/users/${id}/roles`, { method: "PATCH", body: { roles } }),
};

// ---------------------------------------------------------------- configuración

export const configApi = {
  get: () => apiFetch<RestaurantConfig>("/restaurant-config"),
  put: (body: PutRestaurantConfigRequest) => apiFetch<RestaurantConfig>("/restaurant-config", { method: "PUT", body }),
};

// ---------------------------------------------------------------- catálogo

export const catalogApi = {
  categories: () => apiFetch<CommercialCategory[]>("/commercial-categories"),
  items: (query: CommercialItemListQuery) => apiFetch<Paginated<CommercialItem>>("/commercial-items", { query }),
  create: (body: CreateCommercialItemRequest) => apiFetch<CommercialItem>("/commercial-items", { method: "POST", body }),
  setActive: (id: string, isActive: boolean) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}/status`, { method: "PATCH", body: { isActive } }),
  setApproval: (id: string, approvalStatus: CommercialApprovalStatus) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}/approval`, { method: "PATCH", body: { approvalStatus } }),
};

// ---------------------------------------------------------------- clientes

export const customersApi = {
  list: (query: CustomerListQuery) => apiFetch<Paginated<Customer>>("/customers", { query }),
  get: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}`),
  setStatus: (id: string, status: CustomerStatus) =>
    apiFetch<Customer>(`/customers/${id}/status`, { method: "PATCH", body: { status } }),
};

// ---------------------------------------------------------------- solicitudes

export const requestsApi = {
  list: (query: ReservationRequestListQuery) =>
    apiFetch<Paginated<ReservationRequest>>("/reservation-requests", { query }),
  get: (id: string) => apiFetch<ReservationRequest>(`/reservation-requests/${id}`),
  cancel: (id: string) =>
    apiFetch<ReservationRequest>(`/reservation-requests/${id}/status`, { method: "PATCH", body: { status: "CANCELLED" } }),
};

// ---------------------------------------------------------------- reservas

export const reservationsApi = {
  list: (query: ReservationListQuery) => apiFetch<Paginated<Reservation>>("/reservations", { query }),
  get: (id: string) => apiFetch<ReservationDetail>(`/reservations/${id}`),
  setStatus: (id: string, status: ReservationStatusTarget) =>
    apiFetch<Reservation>(`/reservations/${id}/status`, { method: "PATCH", body: { status } }),
};

// ---------------------------------------------------------------- conversaciones

export const conversationsApi = {
  list: (query: ListConversationsQuery) => apiFetch<Paginated<Conversation>>("/conversations", { query }),
  get: (id: string) => apiFetch<Conversation>(`/conversations/${id}`),
  messages: (id: string, query: ListMessagesQuery = {}) =>
    apiFetch<Paginated<Message>>(`/conversations/${id}/messages`, { query }),
  markRead: (id: string, throughMessageId: string) =>
    apiFetch<MarkConversationReadResponse>(`/conversations/${id}/read`, { method: "PATCH", body: { throughMessageId } }),
  setAssistantPaused: (id: string, paused: boolean) =>
    apiFetch<Conversation>(`/conversations/${id}/assistant`, { method: "PATCH", body: { paused } }),
  assign: (id: string, body: AssignConversationRequest) =>
    apiFetch<Conversation>(`/conversations/${id}/assignee`, { method: "PATCH", body }),
  /** La clave de idempotencia identifica un mismo mensaje en reintentos: genérala una vez por envío. */
  send: (id: string, content: string, idempotencyKey: string = newIdempotencyKey()) =>
    apiFetch<Message>(`/conversations/${id}/messages`, {
      method: "POST",
      body: { type: "TEXT", content },
      headers: { "idempotency-key": idempotencyKey },
    }),
};
