/**
 * Armado del cuerpo de PUT /restaurant-config. El PUT es un REEMPLAZO COMPLETO: cada pestaña envía
 * la configuración vigente con sus cambios aplicados. Nunca se reenvía el GET tal cual: id, createdAt,
 * updatedAt y approvalResponsible provocan 400 ("property X should not exist").
 *
 * Dos campos opcionales se comportan distinto al omitirlos: approvalResponsibleId omitido se BORRA (como
 * los demás opcionales) y ownerWhatsappNumber omitido se CONSERVA. Para no depender de esa diferencia,
 * toPutRequest envía siempre los dos con el valor vigente.
 */
import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type PutRestaurantConfigRequest,
  type RestaurantConfig,
  type RestaurantSchedule,
  type RestaurantScheduleInput,
} from "@/lib/api/types";

/**
 * El backend admite hasta 7 decimales y responde 500 si JS imprime la coordenada en notación
 * exponencial (|v| < 1e-6): se redondea y esos valores pasan a 0.
 */
export function normalizeCoordinate(value: number): number {
  const rounded = Number(value.toFixed(7));
  return Math.abs(rounded) < 1e-6 ? 0 : rounded;
}

/** Horario de un día en la unión de entrada (abierto con horas, cerrado con null). Si falta, cerrado. */
export function scheduleToInput(dayOfWeek: DayOfWeek, schedule: RestaurantSchedule | undefined): RestaurantScheduleInput {
  if (schedule?.isOpen && schedule.openTime && schedule.closeTime) {
    return { dayOfWeek, isOpen: true, openTime: schedule.openTime, closeTime: schedule.closeTime };
  }
  return { dayOfWeek, isOpen: false, openTime: null, closeTime: null };
}

/** Los 7 días cerrados (configuración inicial; se ajustan luego en Horarios). */
export function closedWeek(): RestaurantScheduleInput[] {
  return DAYS_OF_WEEK.map((dayOfWeek) => scheduleToInput(dayOfWeek, undefined));
}

/** Cuerpo del PUT a partir de la respuesta del GET, con exactamente las propiedades declaradas. */
export function toPutRequest(config: RestaurantConfig): PutRestaurantConfigRequest {
  const { latitude, longitude } = config;
  // Latitud y longitud viajan juntas o ninguna (regla del backend).
  const hasCoordinates = latitude !== null && longitude !== null;
  return {
    businessName: config.businessName,
    logoUrl: config.logoUrl,
    description: config.description,
    address: config.address,
    latitude: hasCoordinates ? normalizeCoordinate(latitude) : null,
    longitude: hasCoordinates ? normalizeCoordinate(longitude) : null,
    whatsappNumber: config.whatsappNumber,
    ownerWhatsappNumber: config.ownerWhatsappNumber,
    email: config.email,
    website: config.website,
    currency: config.currency,
    timeZone: config.timeZone,
    reservationPolicy: config.reservationPolicy,
    cancellationPolicy: config.cancellationPolicy,
    responseTimeoutMinutes: config.responseTimeoutMinutes,
    // Omitirlo lo borraría: se reenvía siempre el responsable vigente.
    approvalResponsibleId: config.approvalResponsibleId,
    languages: [...config.languages],
    schedules: DAYS_OF_WEEK.map((day) => scheduleToInput(day, config.schedules.find((s) => s.dayOfWeek === day))),
  };
}

/** Reemplaza solo los días indicados; el resto de la semana queda como está en `request`. */
export function replaceSchedules(
  request: PutRestaurantConfigRequest,
  updates: readonly RestaurantScheduleInput[],
): PutRestaurantConfigRequest {
  return {
    ...request,
    schedules: request.schedules.map((day) => updates.find((u) => u.dayOfWeek === day.dayOfWeek) ?? day),
  };
}
