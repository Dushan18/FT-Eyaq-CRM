/**
 * Estado en memoria del backend simulado (modo mock). Reproduce las entidades de bk-crm con sus
 * mismas formas de respuesta. Vive en el proceso del servidor Next.js y se reinicia al reiniciarlo.
 */
import type {
  CommercialCategory,
  CommercialItem,
  Conversation,
  Customer,
  CustomerInterest,
  Message,
  ReservationNote,
  ReservationRequest,
  ReservationRescheduleEntry,
  Reservation,
  RestaurantConfig,
  SamantaDraft,
  User,
} from "@/lib/api/types";

export interface MockUser extends User {
  password: string;
}

export interface MockSession {
  id: string;
  userId: string;
  /** jti del refresh token vigente (rotación de un solo uso). */
  refreshJti: string;
  revoked: boolean;
  /** Vencimiento absoluto: 7 días desde el inicio de sesión. */
  expiresAt: number;
}

export type MockCustomer = Customer & {
  interests: Array<Omit<CustomerInterest, "commercialItem"> & { commercialItemId: string }>;
  /**
   * PSID de Messenger (dato interno, nunca se expone). Solo lo tienen los clientes que creó el webhook de
   * Messenger: son la «identidad de Messenger» (canal fijo en FACEBOOK, contacto opcional, destinatario de envío).
   */
  messengerPsid?: string | null;
};

export type MockConversation = Omit<Conversation, "customer" | "assignedUser" | "unreadCount">;

export type MockRequest = Omit<ReservationRequest, "customer" | "commercialItem">;

export type MockReservation = Omit<Reservation, "customer" | "commercialItem" | "assignedUser"> & {
  noteHistory: Array<Omit<ReservationNote, "author">>;
  rescheduleHistory: Array<Omit<ReservationRescheduleEntry, "changedBy">>;
};

export interface MockStore {
  users: MockUser[];
  sessions: MockSession[];
  config: RestaurantConfig | null;
  categories: CommercialCategory[];
  items: CommercialItem[];
  customers: MockCustomer[];
  requests: MockRequest[];
  reservations: MockReservation[];
  conversations: MockConversation[];
  messages: Message[];
  /** Borradores de Samanta (todas las conversaciones). Los mensajes de Samanta salen de uno APPROVED. */
  drafts: SamantaDraft[];
  /** "<conversationId>:<Idempotency-Key>" → mensaje saliente (también "samanta-<draftId>" al aprobar). */
  idempotency: Map<string, { messageId: string; authorUserId: string; content: string }>;
  sequences: { request: number; reservation: number };
}

let counter = 0;

/** UUID v4 válido (el backend valida los :id con ParseUUIDPipe). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  counter += 1;
  const hex = (counter + Date.now()).toString(16).padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${hex}`;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** `sequence` del último mensaje de la conversación (0 si no tiene). */
export function lastSequence(store: Pick<MockStore, "messages">, conversationId: string): number {
  return store.messages.filter((m) => m.conversationId === conversationId).reduce((max, m) => Math.max(max, m.sequence), 0);
}

const globalKey = "__crmMockStore" as const;

type GlobalWithStore = typeof globalThis & { [globalKey]?: MockStore };

export function getStore(factory: () => MockStore): MockStore {
  const g = globalThis as GlobalWithStore;
  g[globalKey] ??= factory();
  return g[globalKey]!;
}

export function resetStore(factory: () => MockStore): MockStore {
  const g = globalThis as GlobalWithStore;
  g[globalKey] = factory();
  return g[globalKey]!;
}
