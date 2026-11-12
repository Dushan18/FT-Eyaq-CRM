/** Datos de prueba de la configuración (solo los usan las pruebas de este módulo). */
import type { RestaurantConfig, RestaurantSchedule, User } from "@/lib/api/types";

export const OWNER_ID = "6f1c2a52-8a1e-4c55-9d0b-2b8f0e7d4a11";
export const OWNER_2_ID = "0b3f8d1e-5c2a-4e7b-8f9a-1d2c3b4a5e6f";

const day = (dayOfWeek: RestaurantSchedule["dayOfWeek"], open: string | null, close: string | null): RestaurantSchedule => ({
  dayOfWeek,
  isOpen: open !== null,
  openTime: open,
  closeTime: close,
});

/** Respuesta de GET /restaurant-config como la serializa el backend. */
export function makeConfig(overrides: Partial<RestaurantConfig> = {}): RestaurantConfig {
  return {
    id: "5ded68d7-41b0-4a3c-aef5-08de01b4b6a3",
    businessName: "Sabor Mágico Grill",
    logoUrl: null,
    description: "Restaurante de parrillas y cocina peruana.",
    address: "Av. José Larco 1234, Miraflores, Lima",
    latitude: -12.1216,
    longitude: -77.0298,
    whatsappNumber: "+51987000192",
    ownerWhatsappNumber: "+51912345678",
    email: "reservas@sabormagico.pe",
    website: "https://sabormagico.pe",
    currency: "PEN",
    timeZone: "America/Lima",
    reservationPolicy: "Las reservas se confirman cuando el restaurante las aprueba.",
    cancellationPolicy: "Puedes cancelar sin costo hasta 4 horas antes.",
    responseTimeoutMinutes: 30,
    approvalResponsibleId: OWNER_ID,
    approvalResponsible: { id: OWNER_ID, firstName: "Ricardo", lastName: "Mora", email: "ricardo@sabormagico.pe" },
    languages: ["ES", "EN"],
    schedules: [
      day("MONDAY", null, null),
      day("TUESDAY", "12:00", "22:00"),
      day("WEDNESDAY", "12:00", "22:00"),
      day("THURSDAY", "12:00", "23:00"),
      day("FRIDAY", "12:00", "23:59"),
      day("SATURDAY", "12:00", "23:59"),
      day("SUNDAY", "12:00", "18:00"),
    ],
    createdAt: "2026-08-15T15:00:00.000Z",
    updatedAt: "2026-10-11T15:00:00.000Z",
    ...overrides,
  };
}

export function makeUser(overrides: Partial<User> & Pick<User, "id" | "firstName">): User {
  return {
    lastName: "Prueba",
    email: `${overrides.firstName.toLowerCase()}@sabormagico.pe`,
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-06-01T15:00:00.000Z",
    updatedAt: "2026-06-01T15:00:00.000Z",
    roles: ["OWNER"],
    ...overrides,
  };
}
