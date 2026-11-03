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

export type MockCustomer = Customer & { interests: Array<Omit<CustomerInterest, "commercialItem"> & { commercialItemId: string }> };

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
  /** clave de idempotencia por conversación → id de mensaje */
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
