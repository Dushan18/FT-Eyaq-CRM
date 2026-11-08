/** Datos de prueba del Calendario (solo los usan los archivos *.test.tsx de esta carpeta). */
import type {
  CommercialItem,
  CustomerDetail,
  Paginated,
  Reservation,
  ReservationDetail,
  ReservationNote,
  ReservationRescheduleEntry,
  User,
} from "@/lib/api/types";

export const ME_ID = "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35";
export const OTHER_ID = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
export const RESERVATION_ID = "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74";
export const CUSTOMER_ID = "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42";

const HOUR = 60 * 60 * 1000;

/** Instante relativo al reloj real (las pruebas no congelan la hora). */
export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

export function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    assignedUserId: null,
    assignedUser: null,
    id: RESERVATION_ID,
    code: "R-2026-000015",
    reservationRequestId: null,
    customerId: CUSTOMER_ID,
    commercialItemId: null,
    reservationAt: hoursFromNow(72),
    numberOfPeople: 4,
    status: "CONFIRMED",
    notes: "Cumpleaños",
    createdAt: "2026-11-02T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
    customer: { id: CUSTOMER_ID, firstName: "Carlos", lastName: "Quispe", phone: "987 654 321", email: null },
    commercialItem: null,
    ...overrides,
  };
}

export function makeNote(overrides: Partial<ReservationNote> = {}): ReservationNote {
  return {
    id: "a9c3e7b1-5d2f-4a86-8e14-6f0b2d9c3e57",
    reservationId: RESERVATION_ID,
    authorUserId: ME_ID,
    content: "Pidió mesa junto a la ventana",
    createdAt: "2026-11-02T11:00:00.000Z",
    author: { id: ME_ID, firstName: "María", lastName: "Huamán" },
    ...overrides,
  };
}

export function makeRescheduleEntry(overrides: Partial<ReservationRescheduleEntry> = {}): ReservationRescheduleEntry {
  return {
    id: "f4e8a2c6-1b9d-4f73-b2a5-7c3e0d8f1a96",
    previousReservationAt: "2026-11-08T01:00:00.000Z",
    newReservationAt: "2026-11-08T18:00:00.000Z",
    reason: "Cliente solicitó cambio de horario",
    changedByUserId: ME_ID,
    createdAt: "2026-11-03T03:01:19.664Z",
    changedBy: { id: ME_ID, firstName: "María", lastName: "Huamán" },
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<ReservationDetail> = {}): ReservationDetail {
  return { ...makeReservation(), noteHistory: [], rescheduleHistory: [], ...overrides };
}

export function makeCustomer(overrides: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: CUSTOMER_ID,
    firstName: "Carlos",
    lastName: "Quispe",
    phone: "987 654 321",
    phoneCountry: "PE",
    email: null,
    sourceChannel: "WHATSAPP",
    status: "NEW",
    firstContactAt: "2026-10-01T10:00:00.000Z",
    lastContactAt: "2026-10-01T10:00:00.000Z",
    notes: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    interests: [],
    ...overrides,
  };
}

export function makeUser(id: string, firstName: string, roles: User["roles"], isActive = true): User {
  return {
    id,
    firstName,
    lastName: "Prueba",
    email: `${firstName.toLowerCase()}@example.com`,
    isActive,
    lastLoginAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    roles,
  };
}

export function page<T>(data: T[]): Paginated<T> {
  return { data, pagination: { page: 1, limit: 100, total: data.length, totalPages: data.length > 0 ? 1 : 0 } };
}

export const EMPTY_ITEMS: Paginated<CommercialItem> = page<CommercialItem>([]);
