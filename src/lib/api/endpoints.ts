/**
 * Funciones tipadas por endpoint de bk-crm (vía el proxy /api/backend).
 * Contrato: docs/frontend-api-completo.md (Parte 05, §2.1). Cada función tiene su fila «ft-crm» en la parte
 * del módulo correspondiente (01 a 04), con la clave de caché que usa y qué invalidar.
 */
import { apiFetch, newIdempotencyKey } from "./client";
import type {
  AssignConversationRequest,
  AssignReservationBody,
  CommercialApprovalStatus,
  CommercialCategory,
  CommercialItem,
  CommercialItemListQuery,
  Conversation,
  CreateCommercialCategoryRequest,
  CreateCommercialItemRequest,
  CreateCustomerInterestRequest,
  CreateCustomerRequest,
  CreateReservationBody,
  CreateReservationNoteBody,
  CreateReservationRequestBody,
  CreateUserRequest,
  Customer,
  CustomerDetail,
  CustomerInterest,
  CustomerListQuery,
  CustomerStatus,
  EditSamantaDraftRequest,
  GenerateSamantaDraftRequest,
  ListConversationsQuery,
  ListMessagesQuery,
  LoginUser,
  MarkConversationReadResponse,
  MeResponse,
  Message,
  Paginated,
  PutRestaurantConfigRequest,
  RescheduleReservationBody,
  Reservation,
  ReservationDetail,
  ReservationListQuery,
  ReservationNote,
  ReservationRequest,
  ReservationRequestListQuery,
  ReservationStatusTarget,
  RestaurantConfig,
  ReviewSamantaDraftRequest,
  RoleCode,
  SamantaDraft,
  SamantaDraftListResponse,
  UpdateCommercialCategoryRequest,
  UpdateCommercialCategoryStatusRequest,
  UpdateCommercialItemRequest,
  UpdateCustomerRequest,
  UpdateReservationBody,
  UpdateReservationRequestBody,
  UpdateUserRequest,
  User,
  Uuid,
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

/** login, logout, forgotPassword y resetPassword van por /api/auth/*; me, por /api/backend. */
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
  /** GET /users/:id */
  get: (id: Uuid, signal?: AbortSignal) => apiFetch<User>(`/users/${id}`, { signal }),
  /** PATCH /users/:id. Solo los campos que cambian (al menos uno); nunca null ni "". */
  update: (id: Uuid, body: UpdateUserRequest) => apiFetch<User>(`/users/${id}`, { method: "PATCH", body }),
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
  /** CreateCommercialItemRequest admite todos los campos del DTO del backend. */
  create: (body: CreateCommercialItemRequest) => apiFetch<CommercialItem>("/commercial-items", { method: "POST", body }),
  setActive: (id: string, isActive: boolean) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}/status`, { method: "PATCH", body: { isActive } }),
  setApproval: (id: string, approvalStatus: CommercialApprovalStatus) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}/approval`, { method: "PATCH", body: { approvalStatus } }),
  /** GET /commercial-categories/:id */
  category: (id: string) => apiFetch<CommercialCategory>(`/commercial-categories/${id}`),
  /** POST /commercial-categories */
  createCategory: (body: CreateCommercialCategoryRequest) =>
    apiFetch<CommercialCategory>("/commercial-categories", { method: "POST", body }),
  /** PATCH /commercial-categories/:id (al menos un campo). */
  updateCategory: (id: string, body: UpdateCommercialCategoryRequest) =>
    apiFetch<CommercialCategory>(`/commercial-categories/${id}`, { method: "PATCH", body }),
  /** PATCH /commercial-categories/:id/status */
  setCategoryActive: (id: string, isActive: boolean) =>
    apiFetch<CommercialCategory>(`/commercial-categories/${id}/status`, {
      method: "PATCH",
      body: { isActive } satisfies UpdateCommercialCategoryStatusRequest,
    }),
  /** GET /commercial-items/:id */
  item: (id: string) => apiFetch<CommercialItem>(`/commercial-items/${id}`),
  /** PATCH /commercial-items/:id. variants, images, faqs y schedules reemplazan la lista completa. */
  update: (id: string, body: UpdateCommercialItemRequest) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}`, { method: "PATCH", body }),
};

// ---------------------------------------------------------------- clientes

export const customersApi = {
  list: (query: CustomerListQuery) => apiFetch<Paginated<Customer>>("/customers", { query }),
  get: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}`),
  setStatus: (id: string, status: CustomerStatus) =>
    apiFetch<Customer>(`/customers/${id}/status`, { method: "PATCH", body: { status } }),
  /** POST /customers */
  create: (body: CreateCustomerRequest) => apiFetch<Customer>("/customers", { method: "POST", body }),
  /** PATCH /customers/:id. La respuesta no trae interests: mézclala con el detalle en caché. */
  update: (id: string, body: UpdateCustomerRequest) =>
    apiFetch<Customer>(`/customers/${id}`, { method: "PATCH", body }),
  /** POST /customers/:id/interests. Responde 200 también al repetir (actualiza el interés). */
  addInterest: (id: string, body: CreateCustomerInterestRequest) =>
    apiFetch<CustomerInterest>(`/customers/${id}/interests`, { method: "POST", body }),
  /** DELETE /customers/:id/interests/:commercialItemId. Responde 204: apiFetch devuelve undefined. */
  removeInterest: (id: string, commercialItemId: string) =>
    apiFetch<void>(`/customers/${id}/interests/${commercialItemId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------- solicitudes

export const requestsApi = {
  list: (query: ReservationRequestListQuery) =>
    apiFetch<Paginated<ReservationRequest>>("/reservation-requests", { query }),
  get: (id: string) => apiFetch<ReservationRequest>(`/reservation-requests/${id}`),
  cancel: (id: string) =>
    apiFetch<ReservationRequest>(`/reservation-requests/${id}/status`, { method: "PATCH", body: { status: "CANCELLED" } }),
  /** POST /reservation-requests (no es idempotente: un reintento crea otra solicitud). */
  create: (body: CreateReservationRequestBody) =>
    apiFetch<ReservationRequest>("/reservation-requests", { method: "POST", body }),
  /** PATCH /reservation-requests/:id (solo en INCOMPLETE_DATA o READY_TO_SEND). */
  update: (id: string, body: UpdateReservationRequestBody) =>
    apiFetch<ReservationRequest>(`/reservation-requests/${id}`, { method: "PATCH", body }),
};

// ---------------------------------------------------------------- reservas

export const reservationsApi = {
  list: (query: ReservationListQuery) => apiFetch<Paginated<Reservation>>("/reservations", { query }),
  get: (id: string) => apiFetch<ReservationDetail>(`/reservations/${id}`),
  setStatus: (id: string, status: ReservationStatusTarget) =>
    apiFetch<Reservation>(`/reservations/${id}/status`, { method: "PATCH", body: { status } }),
  /** POST /reservations (solo ADMIN; no es idempotente). */
  create: (body: CreateReservationBody) => apiFetch<Reservation>("/reservations", { method: "POST", body }),
  /** PATCH /reservations/:id. La respuesta no trae historiales: mézclala con el detalle en caché. */
  update: (id: string, body: UpdateReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}`, { method: "PATCH", body }),
  /** PATCH /reservations/:id/assignee ({ assignedUserId: null } libera). */
  assign: (id: string, body: AssignReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}/assignee`, { method: "PATCH", body }),
  /** POST /reservations/:id/notes (no es idempotente). */
  addNote: (id: string, content: string) =>
    apiFetch<ReservationNote>(`/reservations/${id}/notes`, {
      method: "POST",
      body: { content } satisfies CreateReservationNoteBody,
    }),
  /** PATCH /reservations/:id/reschedule. Deja la reserva en RESCHEDULED (con el mismo instante, no cambia nada). */
  reschedule: (id: string, body: RescheduleReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}/reschedule`, { method: "PATCH", body }),
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
  /**
   * La clave de idempotencia identifica un mismo mensaje en reintentos: genérala una vez por envío y pásala
   * siempre. El valor por defecto crea una clave nueva en cada llamada.
   */
  send: (id: string, content: string, idempotencyKey: string = newIdempotencyKey()) =>
    apiFetch<Message>(`/conversations/${id}/messages`, {
      method: "POST",
      body: { type: "TEXT", content },
      headers: { "idempotency-key": idempotencyKey },
    }),
};

// ---------------------------------------------------------------- borradores de Samanta

export const assistantDraftsApi = {
  /**
   * POST /conversations/:id/assistant-drafts. Espera a la IA (el BFF da 65 s a esta ruta).
   * Sin clave por defecto a propósito: reutiliza la misma solo para reintentar esta generación.
   */
  generate: (conversationId: string, sourceMessageId: string, idempotencyKey: string) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts`, {
      method: "POST",
      body: { sourceMessageId } satisfies GenerateSamantaDraftRequest,
      headers: { "idempotency-key": idempotencyKey },
    }),
  /** GET /conversations/:id/assistant-drafts (hasta 50, los más recientes primero, sin paginar). */
  list: (conversationId: string) =>
    apiFetch<SamantaDraftListResponse>(`/conversations/${conversationId}/assistant-drafts`),
  /** GET /conversations/:id/assistant-drafts/:draftId */
  get: (conversationId: string, draftId: string) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}`),
  /** PATCH /conversations/:id/assistant-drafts/:draftId (suma 1 a revision). */
  edit: (conversationId: string, draftId: string, body: EditSamantaDraftRequest) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}`, { method: "PATCH", body }),
  /** POST …/approve (202): encola un OUTBOUND cuyo autor es quien aprueba. */
  approve: (conversationId: string, draftId: string, revision: number) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}/approve`, {
      method: "POST",
      body: { revision } satisfies ReviewSamantaDraftRequest,
    }),
  /** POST …/reject (200). */
  reject: (conversationId: string, draftId: string, revision: number) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}/reject`, {
      method: "POST",
      body: { revision } satisfies ReviewSamantaDraftRequest,
    }),
};
