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

/** Cuerpo de error NestJS: `message` es string (negocio) o string[] (validación). */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** Solo lo agrega el BFF de este frontend (p. ej. "SESSION_EXPIRED"). */
  code?: string;
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

export interface CommercialItem {
  id: Uuid;
  type: CommercialItemType;
  categoryId: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  basePrice: MoneyString | null;
  displayOrder: number;
  isActive: boolean;
  approvalStatus: CommercialApprovalStatus;
  conditions: string | null;
  internalNotes: string | null;
  availabilityNote: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  category: { id: Uuid; nameEs: string | null; nameEn: string | null; isActive: boolean; displayOrder: number };
  variants: CommercialItemVariant[];
  images: Array<{ id: Uuid; url: string; isPrimary: boolean; displayOrder: number }>;
  faqs: unknown[];
  schedules: unknown[];
  promotionDetail: { promotionalPrice: MoneyString | null; validFrom: IsoDateTime | null; validUntil: IsoDateTime | null } | null;
  eventDetail: { startAt: IsoDateTime | null; endAt: IsoDateTime | null; capacity: number | null } | null;
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

/** Alta mínima desde Ajustes > Servicios. Siempre se crea activo y en borrador (DRAFT). */
export interface CreateCommercialItemRequest {
  type: CommercialItemType;
  categoryId: Uuid;
  nameEs: string;
  descriptionEs?: string | null;
  basePrice?: MoneyString | null;
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

export interface ConversationCustomer extends CustomerSummary {}

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

export interface Message {
  id: Uuid;
  conversationId: Uuid;
  channel: ContactChannel;
  /** Orden total dentro de la conversación: ordenar siempre por sequence. */
  sequence: number;
  externalMessageId: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  type: MessageType;
  content: string | null;
  /** INBOUND: null. OUTBOUND: usuario del CRM que lo envió; null = automático (Samanta). */
  authorUserId: Uuid | null;
  occurredAt: IsoDateTime | null;
  receivedAt: IsoDateTime | null;
  processedAt: IsoDateTime | null;
  sentAt: IsoDateTime | null;
  deliveredAt: IsoDateTime | null;
  providerReadAt: IsoDateTime | null;
  failedAt: IsoDateTime | null;
  readAt: IsoDateTime | null;
  errorCode: string | null;
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
  /** 1–4096 caracteres con al menos uno no blanco. */
  content: string;
}

export const OUTBOUND_CONTENT_MAX_LENGTH = 4096;
export const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
