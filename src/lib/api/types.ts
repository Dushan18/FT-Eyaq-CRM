/**
 * Contrato HTTP de bk-crm tal como se serializa (verificado leyendo el código del backend).
 * Detalle completo, errores y reglas por módulo: docs/backend/*.md
 *
 * Convenciones:
 * - Fechas de respuesta: ISO UTC con milisegundos ("2026-10-16T01:00:00.000Z").
 * - Fechas de entrada: ISO con segundos y zona explícita (usar Date#toISOString()).
 * - Dinero: string con 2 decimales ("38.00"); también se envía como string.
 * - `campo?:` puede faltar; `campo: T | null` siempre viene.
 * - El backend rechaza (400) cualquier propiedad no declarada: enviar solo lo tipado aquí.
 */

// ---------------------------------------------------------------------------
// Comunes
// ---------------------------------------------------------------------------

export type Uuid = string;
export type IsoDateTime = string;
/** "HH:mm" 00:00–23:59 */
export type HhMm = string;
export type MoneyString = string;

export type RoleCode = "ADMIN" | "OWNER" | "OPERATOR" | "SUPPORT";

export const CONTACT_CHANNELS = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE", "PHONE", "EMAIL", "OTHER"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export type CurrencyCode = "PEN" | "USD";
export const LANGUAGE_CODES = ["ES", "EN", "PT"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];
export const DAYS_OF_WEEK = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  /** 0 cuando total = 0 */
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

/** Límite máximo de `limit` en todos los listados paginados. */
export const MAX_PAGE_SIZE = 100;

/** `code` que añade el BFF de este frontend; bk-crm nunca lo envía. */
export type BffErrorCode = "NO_SESSION" | "SESSION_EXPIRED" | "BACKEND_UNAVAILABLE";

/**
 * Cuerpo de error de bk-crm o de un handler del BFF.
 * `message` es string[] solo en el 400 de validación de DTO; en el resto, string.
 */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  /** "Bad Request", "Forbidden"… No viene en el 401 genérico de bk-crm, en los 429, en el 500 ni en los errores del BFF. */
  error?: string;
  /** Solo lo añade el BFF. */
  code?: BffErrorCode;
  /** Solo en el 500 de bk-crm: ruta sin query string. */
  path?: string;
  /** Solo en el 500 de bk-crm. */
  method?: string;
  /** Solo en el 500 de bk-crm. */
  timestamp?: IsoDateTime;
}

export interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Autenticación y usuarios
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  /** Mínimo 8 caracteres. */
  password: string;
}

export interface LoginUser {
  id: Uuid;
  firstName: string;
  lastName: string;
  email: string;
  roles: RoleCode[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: LoginUser;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** GET /auth/me — roles leídos de la base en cada petición (fuente de verdad para la UI). */
export interface MeResponse {
  id: Uuid;
  sessionId: Uuid;
  firstName: string;
  lastName: string;
  email: string;
  roles: RoleCode[];
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  /** 64 caracteres hexadecimales (llega como ?token= en el enlace del correo). */
  token: string;
  /** 8–72 caracteres. */
  newPassword: string;
}

export interface User {
  id: Uuid;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  /** null hasta el primer inicio de sesión. */
  lastLoginAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  roles: RoleCode[];
}

export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  /** 8–72 caracteres. */
  password: string;
  roles: RoleCode[];
}

export interface UpdateUserStatusRequest {
  isActive: boolean;
}

export interface UpdateUserRolesRequest {
  roles: RoleCode[];
}

// ---------------------------------------------------------------------------
// Configuración del restaurante (singleton)
// ---------------------------------------------------------------------------

export interface ApprovalResponsible {
  id: Uuid;
  firstName: string;
  lastName: string;
  email: string;
}

export interface RestaurantSchedule {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  openTime: HhMm | null;
  closeTime: HhMm | null;
}

export interface RestaurantConfig {
  id: Uuid;
  businessName: string;
  logoUrl: string | null;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** E.164: "+51987654321" */
  whatsappNumber: string;
  email: string;
  website: string | null;
  currency: CurrencyCode;
  /** IANA, p. ej. "America/Lima". Zona en la que se muestran todas las fechas. */
  timeZone: string;
  reservationPolicy: string;
  cancellationPolicy: string;
  /** 1–1440 minutos. */
  responseTimeoutMinutes: number;
  approvalResponsibleId: Uuid | null;
  approvalResponsible: ApprovalResponsible | null;
  languages: LanguageCode[];
  /** Siempre 7, de lunes a domingo. */
  schedules: RestaurantSchedule[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type RestaurantScheduleInput =
  | { dayOfWeek: DayOfWeek; isOpen: true; openTime: HhMm; closeTime: HhMm }
  | { dayOfWeek: DayOfWeek; isOpen: false; openTime: null; closeTime: null };

/** PUT /restaurant-config: reemplazo completo (los opcionales omitidos quedan en null). */
export interface PutRestaurantConfigRequest {
  businessName: string;
  logoUrl: string | null;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  whatsappNumber: string;
  email: string;
  website: string | null;
  currency: CurrencyCode;
  timeZone: string;
  reservationPolicy: string;
  cancellationPolicy: string;
  responseTimeoutMinutes: number;
  approvalResponsibleId: Uuid | null;
  languages: LanguageCode[];
  schedules: RestaurantScheduleInput[];
}

// ---------------------------------------------------------------------------
// Catálogo comercial ("servicios")
// ---------------------------------------------------------------------------

export const COMMERCIAL_ITEM_TYPES = ["DISH", "BEVERAGE", "SERVICE", "PROMOTION", "EVENT"] as const;
export type CommercialItemType = (typeof COMMERCIAL_ITEM_TYPES)[number];
export type CommercialApprovalStatus = "DRAFT" | "APPROVED" | "REJECTED";

export interface CommercialCategory {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CommercialItemVariant {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  price: MoneyString;
  isActive: boolean;
  displayOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Elemento comercial completo: lo devuelven POST, GET, GET /:id y los tres PATCH. */
export interface CommercialItem {
  id: Uuid;
  type: CommercialItemType;
  categoryId: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  /** 2 decimales o null. */
  basePrice: MoneyString | null;
  displayOrder: number;
  isActive: boolean;
  approvalStatus: CommercialApprovalStatus;
  conditions: string | null;
  /** Nota interna: la ven los roles del CRM, pero no Samanta. */
  internalNotes: string | null;
  availabilityNote: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  category: CommercialItemCategorySummary;
  /** Todas, también las inactivas; por displayOrder y createdAt. */
  variants: CommercialItemVariant[];
  /** Por displayOrder y createdAt. */
  images: CommercialItemImage[];
  /** Por displayOrder y createdAt. */
  faqs: CommercialItemFaq[];
  /** Solo los días configurados, de MONDAY a SUNDAY. */
  schedules: CommercialItemSchedule[];
  promotionDetail: CommercialPromotionDetail | null;
  eventDetail: CommercialEventDetail | null;
}

export interface CommercialItemListQuery {
  page?: number;
  limit?: number;
  type?: CommercialItemType;
  approvalStatus?: CommercialApprovalStatus;
  isActive?: boolean;
  categoryId?: Uuid;
  search?: string;
  sort?: "category" | "name" | "createdAt";
  order?: "asc" | "desc";
}

/** Body de POST /commercial-items. Nace activo y en DRAFT. Hay que enviar nameEs o nameEn con texto. */
export interface CreateCommercialItemRequest extends CommercialItemWritableFields {
  type: CommercialItemType;
  /** Categoría existente y activa. */
  categoryId: Uuid;
}

/** Embebido compacto en solicitudes, reservas e intereses (sin precio). */
export interface CommercialItemSummary {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  type: CommercialItemType;
  isActive: boolean;
  approvalStatus: CommercialApprovalStatus;
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export const CUSTOMER_STATUSES = [
  "NEW",
  "INTERESTED",
  "IN_CONVERSATION",
  "REQUESTED_RESERVATION",
  "CONFIRMED",
  "REJECTED",
  "LOST",
  "RECURRENT",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface Customer {
  id: Uuid;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  phoneCountry: string | null;
  email: string | null;
  sourceChannel: ContactChannel;
  status: CustomerStatus;
  firstContactAt: IsoDateTime;
  lastContactAt: IsoDateTime;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CustomerInterest {
  id: Uuid;
  firstInterestedAt: IsoDateTime;
  lastInterestedAt: IsoDateTime;
  notes: string | null;
  commercialItem: CommercialItemSummary;
}

export interface CustomerDetail extends Customer {
  /** Ordenados por lastInterestedAt descendente. */
  interests: CustomerInterest[];
}

export interface CustomerListQuery {
  page?: number;
  limit?: number;
  /** Coincide por nombre, apellido, teléfono o correo por separado (no nombre completo). */
  search?: string;
  status?: CustomerStatus;
  /** Filtra sourceChannel (el parámetro se llama `channel`). */
  channel?: ContactChannel;
  commercialItemId?: Uuid;
}

export interface UpdateCustomerStatusRequest {
  status: CustomerStatus;
}

/** Cliente embebido en solicitudes, reservas y conversaciones. */
export interface CustomerSummary {
  id: Uuid;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Solicitudes de reserva
// ---------------------------------------------------------------------------

export const RESERVATION_REQUEST_STATUSES = [
  "INCOMPLETE_DATA",
  "READY_TO_SEND",
  "SENT_TO_OWNER",
  "WAITING_RESPONSE",
  "ACCEPTED",
  "REJECTED",
  "MODIFICATION_REQUESTED",
  "RENEGOTIATING",
  "CANCELLED",
] as const;
export type ReservationRequestStatus = (typeof RESERVATION_REQUEST_STATUSES)[number];

export interface ReservationRequest {
  id: Uuid;
  /** "RES-2026-000042" */
  code: string;
  customerId: Uuid;
  commercialItemId: Uuid | null;
  sourceChannel: ContactChannel;
  /** null mientras faltan datos. */
  reservationAt: IsoDateTime | null;
  numberOfPeople: number | null;
  quotedPrice: MoneyString | null;
  currency: CurrencyCode | null;
  comments: string | null;
  specialRequirements: string | null;
  status: ReservationRequestStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  customer: CustomerSummary;
  commercialItem: CommercialItemSummary | null;
}

export interface ReservationRequestListQuery {
  page?: number;
  limit?: number;
  customerId?: Uuid;
  /** Filtra reservationAt >= dateFrom. */
  dateFrom?: IsoDateTime;
  /** Filtra reservationAt < dateTo. */
  dateTo?: IsoDateTime;
  /** Un solo estado. */
  status?: ReservationRequestStatus;
  channel?: ContactChannel;
  commercialItemId?: Uuid;
  search?: string;
}

export interface CancelReservationRequestBody {
  status: "CANCELLED";
}

// ---------------------------------------------------------------------------
// Reservas (calendario)
// ---------------------------------------------------------------------------

export const RESERVATION_STATUSES = [
  "CONFIRMED",
  "UPCOMING",
  "IN_SERVICE",
  "COMPLETED",
  "RESCHEDULED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type ReservationStatusTarget = Exclude<ReservationStatus, "RESCHEDULED">;

export interface AssignedUser {
  id: Uuid;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isEligible: boolean;
}

export interface Reservation {
  assignedUserId: Uuid | null;
  assignedUser: AssignedUser | null;
  id: Uuid;
  /** "R-2026-000007" */
  code: string;
  /** Solicitud de origen; null si se registró manualmente. */
  reservationRequestId: Uuid | null;
  customerId: Uuid;
  commercialItemId: Uuid | null;
  reservationAt: IsoDateTime;
  numberOfPeople: number;
  status: ReservationStatus;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  customer: CustomerSummary;
  commercialItem: CommercialItemSummary | null;
}

export interface PublicUser {
  id: Uuid;
  firstName: string;
  lastName: string;
}

export interface ReservationNote {
  id: Uuid;
  reservationId: Uuid;
  authorUserId: Uuid;
  content: string;
  createdAt: IsoDateTime;
  author: PublicUser;
}

export interface ReservationRescheduleEntry {
  id: Uuid;
  previousReservationAt: IsoDateTime;
  newReservationAt: IsoDateTime;
  reason: string | null;
  changedByUserId: Uuid;
  createdAt: IsoDateTime;
  changedBy: PublicUser;
}

export interface ReservationDetail extends Reservation {
  noteHistory: ReservationNote[];
  rescheduleHistory: ReservationRescheduleEntry[];
}

export interface ReservationListQuery {
  page?: number;
  limit?: number;
  customerId?: Uuid;
  /** Incluido: reservationAt >= dateFrom. */
  dateFrom?: IsoDateTime;
  /** Excluido: reservationAt < dateTo. */
  dateTo?: IsoDateTime;
  commercialItemId?: Uuid;
  assignedUserId?: Uuid;
  search?: string;
  excludeCancelled?: boolean;
  status?: ReservationStatus;
}

export interface UpdateReservationStatusBody {
  status: ReservationStatusTarget;
}

/** Transiciones permitidas por PATCH /reservations/:id/status (reservation-rules.ts). */
export const RESERVATION_STATUS_TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatusTarget[]>> = {
  CONFIRMED: ["UPCOMING", "IN_SERVICE", "CANCELLED", "NO_SHOW"],
  UPCOMING: ["IN_SERVICE", "CANCELLED", "NO_SHOW"],
  RESCHEDULED: ["CONFIRMED", "UPCOMING", "IN_SERVICE", "CANCELLED", "NO_SHOW"],
  IN_SERVICE: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// ---------------------------------------------------------------------------
// Mensajería (bandeja)
// ---------------------------------------------------------------------------

export type MessageDirection = "INBOUND" | "OUTBOUND";
export type InboundMessageStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED";
export type OutboundMessageStatus = "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "UNKNOWN" | "FAILED";
export type MessageStatus = InboundMessageStatus | OutboundMessageStatus;
export type MessageType = "TEXT" | "IMAGE" | "FILE" | "OTHER";

export type ConversationCustomer = CustomerSummary;

export interface ConversationAssignedUser {
  id: Uuid;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isEligible: boolean;
}

/** Misma forma en listado, detalle y respuestas de PATCH. No incluye el último mensaje. */
export interface Conversation {
  id: Uuid;
  customerId: Uuid;
  channel: ContactChannel;
  isAssistantPaused: boolean;
  assignedUserId: Uuid | null;
  lastMessageAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  customer: ConversationCustomer;
  assignedUser: ConversationAssignedUser | null;
  /** Mensajes del cliente sin leer (lectura compartida del equipo). */
  unreadCount: number;
}

export interface MessageAttachment {
  id: Uuid;
  type: "IMAGE" | "FILE" | "OTHER";
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  externalMediaId: string | null;
  url: string | null;
  createdAt: IsoDateTime;
}

/** Mensaje del historial; también la respuesta 202 de POST /conversations/:id/messages. */
export interface Message {
  id: Uuid;
  conversationId: Uuid;
  channel: ContactChannel;
  /** Orden total dentro de la conversación: ordenar siempre por sequence. */
  sequence: number;
  /** wamid (WhatsApp) o mid (Messenger). En OUTBOUND es null hasta SENT. */
  externalMessageId: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  type: MessageType;
  /** null en IMAGE o FILE sin pie de foto. */
  content: string | null;
  /**
   * INBOUND: null. OUTBOUND: usuario que lo envió o que aprobó el borrador de Samanta.
   * Un OUTBOUND creado por la API nunca tiene autor null: null no significa «Samanta».
   */
  authorUserId: Uuid | null;
  /** INBOUND: hora del proveedor. OUTBOUND: null. */
  occurredAt: IsoDateTime | null;
  receivedAt: IsoDateTime | null;
  processedAt: IsoDateTime | null;
  sentAt: IsoDateTime | null;
  deliveredAt: IsoDateTime | null;
  /** Solo WhatsApp: Messenger no informa lecturas. */
  providerReadAt: IsoDateTime | null;
  failedAt: IsoDateTime | null;
  /** INBOUND: leído por el equipo en el CRM. OUTBOUND: siempre null. */
  readAt: IsoDateTime | null;
  errorCode: MessageErrorCode | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  attachments: MessageAttachment[];
}

export interface ListConversationsQuery {
  page?: number;
  /** Máx. 100, por defecto 50. */
  limit?: number;
  channel?: ContactChannel;
  customerId?: Uuid;
  assignedUserId?: Uuid;
  unreadOnly?: boolean;
  isAssistantPaused?: boolean;
  /** Solo campos del cliente (nombre, apellido, correo, teléfono). */
  search?: string;
}

export interface ListMessagesQuery {
  page?: number;
  limit?: number;
}

export interface MarkConversationReadRequest {
  throughMessageId: Uuid;
}

export interface MarkConversationReadResponse {
  updated: number;
  throughMessageId: Uuid;
}

export interface UpdateAssistantPauseRequest {
  paused: boolean;
}

export interface AssignConversationRequest {
  assignedUserId: Uuid | null;
}

export interface SendMessageRequest {
  type: "TEXT";
  /** Al menos un carácter no blanco. content.length ≤ OUTBOUND_TEXT_MAX_LENGTH del canal (4096 WhatsApp, 2000 Messenger). */
  content: string;
}

/** Tope del DTO de envío (cuenta cada emoji como 1). Para el textarea y el contador usa OUTBOUND_TEXT_MAX_LENGTH. */
export const OUTBOUND_CONTENT_MAX_LENGTH = 4096;
export const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

// ===========================================================================
// Contrato completo de bk-crm (docs/frontend-api-completo.md, Parte 05 §2.2)
// ===========================================================================

// ---------------------------------------------------------------------------
// Autenticación, usuarios y salud
// ---------------------------------------------------------------------------

/** Body de POST /auth/refresh. Solo lo envía el BFF (src/lib/server/session.ts). */
export interface RefreshRequest {
  /** Último refresh token emitido para la sesión. */
  refreshToken: string;
}

/** Body de PATCH /users/:id (200 · User). Envía al menos un campo; los que no cambian se omiten: nunca null ni "". */
export interface UpdateUserRequest {
  /** Máximo 100 caracteres, al menos uno no blanco; se guarda con trim. */
  firstName?: string;
  /** Máximo 100 caracteres, al menos uno no blanco; se guarda con trim. */
  lastName?: string;
  /** Email válido sin espacios alrededor; único; se guarda en minúsculas. */
  email?: string;
}

export type HealthStatus = "ok" | "error";
export type HealthServiceStatus = "up" | "down";

/** GET /health de bk-crm: 200 con status "ok" o 503 con status "error" (sin message). El navegador usa /api/listo. */
export interface HealthResponse {
  status: HealthStatus;
  services: {
    api: "up";
    database: HealthServiceStatus;
  };
  timestamp: IsoDateTime;
  /** Segundos enteros desde que arrancó el proceso. */
  uptimeSeconds: number;
}

/** GET /api/listo (handler del BFF): 200 si bk-crm responde GET /health con 2xx (o en modo mock); 503 si no. */
export type ReadyResponse =
  | { estado: "ok"; backend: "disponible" | "simulado" }
  | { estado: "error"; backend: string; motivo?: "timeout" | "network" | "error" };

/** 200 de POST /api/auth/login (además fija las cookies httpOnly crm_at y crm_rt). */
export interface BffLoginResponse {
  user: LoginUser;
}

/** 200 de POST /api/auth/logout: siempre, aunque bk-crm no responda; borra las cookies. */
export interface BffLogoutResponse {
  ok: true;
}

// ---------------------------------------------------------------------------
// Configuración y catálogo
// ---------------------------------------------------------------------------

/** Importe: de "0" a "99999999.99", punto decimal, hasta 2 decimales, sin signo ni ceros a la izquierda. */
export const MONEY_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
/** Hora "HH:mm" de 24 h. */
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** WhatsApp del negocio en E.164. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
/** Instantes de entrada (body y query): segundos y zona obligatorios, hasta 3 decimales. */
export const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Criterio de orden de GET /commercial-items. */
export type CommercialItemSortField = "category" | "name" | "createdAt";
/** Dirección del orden. */
export type SortOrder = "asc" | "desc";

/** Body de POST /commercial-categories. Hay que enviar nameEs o nameEn con texto. */
export interface CreateCommercialCategoryRequest {
  /** 1–150. Único (normalizado y entre ambos idiomas). */
  nameEs?: string | null;
  /** 1–150. Único (normalizado y entre ambos idiomas). */
  nameEn?: string | null;
  /** 1–2000. */
  descriptionEs?: string | null;
  /** 1–2000. */
  descriptionEn?: string | null;
  /** Entero 0–1 000 000 (no admite null). Por defecto 0. */
  displayOrder?: number;
}

/**
 * Body de PATCH /commercial-categories/:id. Al menos un campo. Omitido = se conserva;
 * null = se borra (salvo displayOrder). Debe quedar al menos un nombre.
 */
export type UpdateCommercialCategoryRequest = Partial<CreateCommercialCategoryRequest>;

/** Body de PATCH /commercial-categories/:id/status. */
export interface UpdateCommercialCategoryStatusRequest {
  isActive: boolean;
}

/** Resumen de la categoría incluido en cada elemento. */
export interface CommercialItemCategorySummary {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  isActive: boolean;
  displayOrder: number;
}

/** Imagen (sin updatedAt). */
export interface CommercialItemImage {
  id: Uuid;
  url: string;
  altTextEs: string | null;
  altTextEn: string | null;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: IsoDateTime;
}

/** Pregunta frecuente. */
export interface CommercialItemFaq {
  id: Uuid;
  questionEs: string;
  questionEn: string | null;
  answerEs: string;
  answerEn: string | null;
  displayOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Disponibilidad de un día. endTime < startTime = cruza la medianoche. */
export interface CommercialItemSchedule {
  id: Uuid;
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime: HhMm | null;
  endTime: HhMm | null;
}

/** Detalle de promoción (solo en PROMOTION). */
export interface CommercialPromotionDetail {
  id: Uuid;
  validFrom: IsoDateTime | null;
  validUntil: IsoDateTime | null;
  promotionalPrice: MoneyString | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Detalle de evento (solo en EVENT). */
export interface CommercialEventDetail {
  id: Uuid;
  startAt: IsoDateTime | null;
  endAt: IsoDateTime | null;
  capacity: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// Las entradas no aceptan id, createdAt ni updatedAt: quítalos de los hijos del GET
// (si no, 400 "variants.0.property id should not exist").

/** Variante. Hay que enviar nameEs o nameEn; el nombre normalizado no se repite en el elemento. */
export interface CommercialItemVariantInput {
  /** 1–150. */
  nameEs?: string | null;
  /** 1–150. */
  nameEn?: string | null;
  /** 1–2000. */
  descriptionEs?: string | null;
  /** 1–2000. */
  descriptionEn?: string | null;
  /** MONEY_PATTERN, p. ej. "25" o "25.00". */
  price: MoneyString;
  /** Por defecto true. Solo las activas cuentan para la regla de precio. */
  isActive?: boolean;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Imagen: solo URL (no hay subida de archivos). */
export interface CommercialItemImageInput {
  /** URL http(s) con dominio o IP, máx. 2048, sin repetir en el elemento. */
  url: string;
  /** 1–300. */
  altTextEs?: string | null;
  /** 1–300. */
  altTextEn?: string | null;
  /** Por defecto false. Como máximo una principal. */
  isPrimary?: boolean;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Pregunta frecuente. */
export interface CommercialItemFaqInput {
  /** 1–500. */
  questionEs: string;
  /** 1–500. */
  questionEn?: string | null;
  /** 1–5000. */
  answerEs: string;
  /** 1–5000. */
  answerEn?: string | null;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Disponibilidad de un día: horas distintas (pueden cruzar la medianoche) o no disponible sin horas. */
export type CommercialItemScheduleInput =
  | { dayOfWeek: DayOfWeek; isAvailable: true; startTime: HhMm; endTime: HhMm }
  | { dayOfWeek: DayOfWeek; isAvailable: false; startTime?: null; endTime?: null };

/** Detalle de promoción (solo type PROMOTION). Un objeto sustituye los 3 campos. */
export interface CommercialPromotionDetailInput {
  /** ISO_INSTANT_PATTERN y fecha existente. No posterior a validUntil. */
  validFrom?: IsoDateTime | null;
  validUntil?: IsoDateTime | null;
  promotionalPrice?: MoneyString | null;
}

/** Detalle de evento (solo type EVENT). Un objeto sustituye los 3 campos. */
export interface CommercialEventDetailInput {
  /** ISO_INSTANT_PATTERN y fecha existente. No posterior a endAt. */
  startAt?: IsoDateTime | null;
  endAt?: IsoDateTime | null;
  /** Entero 1–1 000 000. */
  capacity?: number | null;
}

/** Campos editables comunes a la creación y la edición de un elemento. */
export interface CommercialItemWritableFields {
  /** 1–200. Al crear, nameEs o nameEn; al editar debe quedar al menos uno. nameEs es obligatorio para aprobar. */
  nameEs?: string | null;
  /** 1–200. */
  nameEn?: string | null;
  /** 1–5000. */
  descriptionEs?: string | null;
  /** 1–5000. */
  descriptionEn?: string | null;
  /** DISH y BEVERAGE: basePrice o variantes activas, nunca los dos ni ninguno. */
  basePrice?: MoneyString | null;
  /** Entero 0–1 000 000 (no admite null). */
  displayOrder?: number;
  /** 1–5000. Samanta lo recibe. */
  conditions?: string | null;
  /** 1–5000. Samanta no lo recibe. */
  internalNotes?: string | null;
  /** 1–2000. Samanta lo recibe. */
  availabilityNote?: string | null;
  /** Máx. 50. En PATCH reemplaza la lista completa ([] = vaciar; no admite null). */
  variants?: CommercialItemVariantInput[];
  /** Máx. 20. En PATCH reemplaza la lista completa. */
  images?: CommercialItemImageInput[];
  /** Máx. 50. En PATCH reemplaza la lista completa. */
  faqs?: CommercialItemFaqInput[];
  /** Máx. 7, sin repetir días. En PATCH reemplaza la lista completa. */
  schedules?: CommercialItemScheduleInput[];
  /** Solo PROMOTION como objeto. null lo elimina (con cualquier type). */
  promotionDetail?: CommercialPromotionDetailInput | null;
  /** Solo EVENT como objeto. null lo elimina (con cualquier type). */
  eventDetail?: CommercialEventDetailInput | null;
}

/** Body de PATCH /commercial-items/:id. Al menos un campo; no admite type, isActive ni approvalStatus. */
export interface UpdateCommercialItemRequest extends CommercialItemWritableFields {
  /** No admite null. Si se envía, la categoría debe existir y estar activa. */
  categoryId?: Uuid;
}

/** Body de PATCH /commercial-items/:id/status. */
export interface UpdateCommercialItemStatusRequest {
  isActive: boolean;
}

/** Body de PATCH /commercial-items/:id/approval. */
export interface UpdateCommercialItemApprovalRequest {
  approvalStatus: CommercialApprovalStatus;
}

// ---------------------------------------------------------------------------
// Clientes, solicitudes y reservas
// ---------------------------------------------------------------------------

/** Body de POST /customers. Exige un email o un teléfono normalizable. */
export interface CreateCustomerRequest {
  sourceChannel: ContactChannel;
  /** 1–100 tras el trim. */
  firstName?: string | null;
  /** 1–100 tras el trim. */
  lastName?: string | null;
  /** Internacional con "+", o nacional junto con phoneCountry. 6–15 dígitos; máx. 80 caracteres. */
  phone?: string | null;
  /** ISO alfa-2 ("PE"); exige phone. */
  phoneCountry?: string | null;
  /** Máx. 320; se guarda en minúsculas. */
  email?: string | null;
  /** 1–5000 tras el trim. */
  notes?: string | null;
}

/** Body de PATCH /customers/:id. Omitir = conservar; null = borrar. Al menos un campo. */
export interface UpdateCustomerRequest {
  /** No admite null. En una identidad de Messenger solo se acepta "FACEBOOK". */
  sourceChannel?: ContactChannel;
  firstName?: string | null;
  lastName?: string | null;
  /** Con un número nacional, reenvía también phoneCountry (no se hereda). null borra también el país. */
  phone?: string | null;
  phoneCountry?: string | null;
  email?: string | null;
  notes?: string | null;
}

/** Body de POST /customers/:id/interests (crea o actualiza el interés). */
export interface CreateCustomerInterestRequest {
  /** Puede estar inactivo o sin aprobar. */
  commercialItemId: Uuid;
  /** 1–5000 tras el trim. Si el interés ya existe: omitir conserva la nota; null la borra. */
  notes?: string | null;
}

/** Estados en los que la solicitud admite edición y cancelación. */
export const RESERVATION_REQUEST_EDITABLE_STATUSES: readonly ReservationRequestStatus[] = [
  "INCOMPLETE_DATA",
  "READY_TO_SEND",
];

/** Body de POST /reservation-requests. */
export interface CreateReservationRequestBody {
  customerId: Uuid;
  sourceChannel: ContactChannel;
  /** Activo y APPROVED. */
  commercialItemId?: Uuid | null;
  /** Estrictamente futura. */
  reservationAt?: IsoDateTime | null;
  /** Entero >= 1 (número JSON, no texto). */
  numberOfPeople?: number | null;
  quotedPrice?: MoneyString | null;
  /** Solo junto con quotedPrice; si hay precio y se omite, se usa la moneda del restaurante. */
  currency?: CurrencyCode | null;
  comments?: string | null;
  specialRequirements?: string | null;
}

/** Body de PATCH /reservation-requests/:id. Omitir = conservar; null = borrar. Al menos un campo. */
export interface UpdateReservationRequestBody {
  /** No admite null. */
  customerId?: Uuid;
  /** No admite null. */
  sourceChannel?: ContactChannel;
  commercialItemId?: Uuid | null;
  /** Si llega, tiene que ser futura aunque no cambie. */
  reservationAt?: IsoDateTime | null;
  numberOfPeople?: number | null;
  /** null borra el precio y, si no se envía currency, también la moneda. */
  quotedPrice?: MoneyString | null;
  currency?: CurrencyCode | null;
  comments?: string | null;
  specialRequirements?: string | null;
}

/** Destinos que además exigen reservationAt <= ahora (reloj del servidor); si no, 409. */
export const RESERVATION_STATUSES_REQUIRING_ARRIVAL: readonly ReservationStatusTarget[] = ["IN_SERVICE", "NO_SHOW"];

/** Estados que admiten PATCH /reservations/:id y PATCH /reservations/:id/reschedule. */
export const RESERVATION_EDITABLE_STATUSES: readonly ReservationStatus[] = ["CONFIRMED", "UPCOMING", "RESCHEDULED"];

/** Estados que admiten PATCH /reservations/:id/assignee. */
export const RESERVATION_ASSIGNABLE_STATUSES: readonly ReservationStatus[] = [
  "CONFIRMED",
  "UPCOMING",
  "RESCHEDULED",
  "IN_SERVICE",
];

/** Estados finales: no admiten cambio de estado, edición, reprogramación ni responsable. Sí observaciones. */
export const RESERVATION_FINAL_STATUSES: readonly ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

/** true si PATCH /reservations/:id/status aceptaría `target` ahora (el mismo estado siempre responde 200). */
export function canSetReservationStatus(
  reservation: Pick<Reservation, "status" | "reservationAt">,
  target: ReservationStatusTarget,
  now: Date = new Date(),
): boolean {
  if (reservation.status === target) return true;
  if (!RESERVATION_STATUS_TRANSITIONS[reservation.status].includes(target)) return false;
  return !RESERVATION_STATUSES_REQUIRING_ARRIVAL.includes(target) || Date.parse(reservation.reservationAt) <= now.getTime();
}

/** Body de POST /reservations (solo ADMIN). Siempre crea la reserva en CONFIRMED. */
export interface CreateReservationBody {
  customerId: Uuid;
  /** Estrictamente futura. */
  reservationAt: IsoDateTime;
  /** Entero >= 1. */
  numberOfPeople: number;
  /** Activo y APPROVED. */
  commercialItemId?: Uuid | null;
  notes?: string | null;
}

/** Body de PATCH /reservations/:id. Cambiar reservationAt deja la reserva en RESCHEDULED y agrega historial. */
export interface UpdateReservationBody {
  /** No admite null. */
  customerId?: Uuid;
  /** No admite null; si llega, tiene que ser futura aunque no cambie. */
  reservationAt?: IsoDateTime;
  /** No admite null. */
  numberOfPeople?: number;
  commercialItemId?: Uuid | null;
  notes?: string | null;
}

/** Body de PATCH /reservations/:id/assignee. null libera; la clave es obligatoria. */
export interface AssignReservationBody {
  assignedUserId: Uuid | null;
}

/** Body de POST /reservations/:id/notes. */
export interface CreateReservationNoteBody {
  /** 1–5000 tras el trim. */
  content: string;
}

/** Body de PATCH /reservations/:id/reschedule. */
export interface RescheduleReservationBody {
  /** Estrictamente futura. Si es el mismo instante, no hay cambios. */
  reservationAt: IsoDateTime;
  /** 1–5000 tras el trim. */
  reason?: string | null;
}

// ---------------------------------------------------------------------------
// Bandeja y Samanta
// ---------------------------------------------------------------------------

/** Canales en los que bk-crm puede enviar (tienen transporte registrado). */
export type SendableChannel = Extract<ContactChannel, "WHATSAPP" | "FACEBOOK">;
export const SENDABLE_CHANNELS: readonly SendableChannel[] = ["WHATSAPP", "FACEBOOK"];

/** Acota un ContactChannel a los canales con envío. */
export function isSendableChannel(channel: ContactChannel): channel is SendableChannel {
  return (SENDABLE_CHANNELS as readonly ContactChannel[]).includes(channel);
}

/** Máximo de content.length (unidades UTF-16, igual que String.length) por canal. */
export const OUTBOUND_TEXT_MAX_LENGTH: Readonly<Record<SendableChannel, number>> = {
  WHATSAPP: 4096,
  FACEBOOK: 2000,
};

/** Prefijo reservado: el backend usa "samanta-<draftId>" al aprobar un borrador. */
export const RESERVED_IDEMPOTENCY_PREFIX = "samanta-";

/** Códigos de `Message.errorCode` en mensajes entrantes. */
export type InboundMessageErrorCode =
  /** RECEIVED: fallo temporal, el worker reintenta solo. */
  | "MESSAGE_PROCESSING_TEMPORARY"
  /** FAILED: el mensaje no pasó la validación interna. */
  | "MESSAGE_INVALID"
  /** FAILED: se agotaron los 5 intentos de procesamiento. */
  | "MESSAGE_ATTEMPTS_EXHAUSTED";

/** Códigos de `Message.errorCode` en mensajes salientes (prefijo WHATSAPP_ o MESSENGER_). */
export type OutboundMessageErrorCode =
  | "WHATSAPP_RATE_LIMITED"
  | "WHATSAPP_SEND_UNKNOWN"
  | "WHATSAPP_SEND_INVALID"
  | "WHATSAPP_WINDOW_CLOSED"
  | "WHATSAPP_SEND_REJECTED"
  | "WHATSAPP_DELIVERY_FAILED"
  | "MESSENGER_RATE_LIMITED"
  | "MESSENGER_SEND_UNKNOWN"
  | "MESSENGER_SEND_INVALID"
  | "MESSENGER_WINDOW_CLOSED"
  | "MESSENGER_SEND_REJECTED"
  | "MESSENGER_DELIVERY_FAILED";

export type MessageErrorCode = InboundMessageErrorCode | OutboundMessageErrorCode;

/** APPROVED, REJECTED, STALE y FAILED son finales. */
export type SamantaDraftStatus = "GENERATING" | "READY" | "APPROVED" | "REJECTED" | "STALE" | "FAILED";

export const SAMANTA_DRAFT_FINAL_STATUSES: readonly SamantaDraftStatus[] = ["APPROVED", "REJECTED", "STALE", "FAILED"];

/** Acciones que admite cada estado (todas exigen la `revision` actual). */
export const SAMANTA_DRAFT_ACTIONS: Readonly<Record<SamantaDraftStatus, readonly ("edit" | "approve" | "reject")[]>> = {
  GENERATING: [],
  READY: ["edit", "approve", "reject"],
  APPROVED: [],
  REJECTED: [],
  STALE: [],
  FAILED: [],
};

/** Intención que detecta la IA. */
export type SamantaIntent = "GENERAL" | "RESERVATION" | "CANCELLATION" | "HUMAN" | "OTHER";

/** Códigos de error de un borrador FAILED. */
export type SamantaErrorCode =
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_REQUEST_REJECTED"
  | "AI_INVALID_RESPONSE"
  | "AI_INCOMPLETE_RESPONSE"
  | "AI_REFUSED_RESPONSE"
  | "AI_RESPONSE_TOO_LARGE"
  | "AI_UNAVAILABLE"
  | "AI_GENERATION_EXPIRED";

/** Máximo de content.length de un borrador (texto de la IA y texto editado). */
export const SAMANTA_DRAFT_MAX_LENGTH = 4096;

/** Body de POST /conversations/:id/assistant-drafts (+ cabecera Idempotency-Key). */
export interface GenerateSamantaDraftRequest {
  /** Id del último mensaje de la conversación: INBOUND, TEXT, no vacío, content.length ≤ 4096. */
  sourceMessageId: Uuid;
}

/** Body de POST …/approve y POST …/reject. */
export interface ReviewSamantaDraftRequest {
  /** Revisión actual del borrador (entero 1–2 147 483 646). */
  revision: number;
}

/** Body de PATCH /conversations/:id/assistant-drafts/:draftId. */
export interface EditSamantaDraftRequest extends ReviewSamantaDraftRequest {
  /** Al menos un carácter no blanco; content.length ≤ 4096. Se guarda sin recortar. */
  content: string;
}

/** Borrador de Samanta: fila completa que devuelven todas sus rutas. */
export interface SamantaDraft {
  id: Uuid;
  conversationId: Uuid;
  /** Mensaje INBOUND al que responde. */
  sourceMessageId: Uuid;
  /** `sequence` del último mensaje al generar. Si llega otro mensaje, el borrador queda STALE. */
  baselineSequence: number;
  /** Clave Idempotency-Key usada al generar. */
  idempotencyKey: string;
  createdById: Uuid;
  /** Quien aprobó o rechazó. */
  reviewedById: Uuid | null;
  /** Último usuario que editó el texto. */
  editedById: Uuid | null;
  status: SamantaDraftStatus;
  /** Empieza en 1 y suma 1 con cada edición. Se envía en editar, aprobar y rechazar. */
  revision: number;
  /** Modelo de IA (SAMANTA_MODEL). */
  model: string;
  /** Versión del prompt ("samanta-drafts-v1"). */
  promptVersion: string;
  /** SHA-256 (hex) de la información comercial usada. */
  knowledgeHash: string;
  /** Texto original de la IA. null si la IA no llegó a dar un texto utilizable. */
  originalContent: string | null;
  /** Texto actual (el editado, si se editó). null mientras no haya texto de la IA. */
  content: string | null;
  /** null hasta que la IA responde. */
  intent: SamantaIntent | null;
  /** true por defecto; luego lo decide la IA. No se recalcula al editar. */
  requiresHuman: boolean;
  /** Datos que faltan, en texto libre (máx. 8 de hasta 80 caracteres). */
  missingFields: string[];
  /** null hasta que la IA responde. Pueden venir en STALE o FAILED si la IA respondió tarde. */
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: SamantaErrorCode | null;
  /** Límite de la generación (inicio + SAMANTA_TIMEOUT_MS + 10 s). Después pasa a FAILED. */
  generationExpiresAt: IsoDateTime;
  /** Inicio + 15 min. Después pasa a STALE. */
  expiresAt: IsoDateTime;
  reviewedAt: IsoDateTime | null;
  /** Mensaje OUTBOUND creado al aprobar. */
  outboundMessageId: Uuid | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Respuesta de GET /conversations/:id/assistant-drafts: hasta 50, los más recientes primero. */
export interface SamantaDraftListResponse {
  data: SamantaDraft[];
}
