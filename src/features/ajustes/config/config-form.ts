/**
 * Modelos de formulario de cada pestaña (valores como cadenas, tal como los manejan los campos) y la
 * detección de cambios. Cada pestaña guarda solo las propiedades que el usuario cambió, aplicadas
 * sobre la configuración vigente.
 */
import {
  DAYS_OF_WEEK,
  LANGUAGE_CODES,
  type ApprovalResponsible,
  type CurrencyCode,
  type DayOfWeek,
  type LanguageCode,
  type RestaurantConfig,
  type User,
} from "@/lib/api/types";
import { DEFAULT_TIME_ZONE } from "@/lib/format/dates";
import { personName } from "@/lib/format/text";
import { closedWeek } from "./config-request";
import type { ConfigInput, ScheduleInputDraft } from "./config-schema";

// ---------------------------------------------------------------- opciones de los campos

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

export const CURRENCY_OPTIONS: ReadonlyArray<{ value: CurrencyCode; label: string }> = [
  { value: "PEN", label: "PEN · Sol peruano" },
  { value: "USD", label: "USD · Dólar estadounidense" },
];

export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: LanguageCode; label: string }> = [
  { value: "ES", label: "Español" },
  { value: "EN", label: "Inglés" },
  { value: "PT", label: "Portugués" },
];

export const TIME_ZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/Lima", label: "America/Lima · Perú" },
  { value: "America/Bogota", label: "America/Bogota · Colombia" },
  { value: "America/Mexico_City", label: "America/Mexico_City · México" },
  { value: "America/Santiago", label: "America/Santiago · Chile" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires · Argentina" },
  { value: "America/Guayaquil", label: "America/Guayaquil · Ecuador" },
  { value: "America/La_Paz", label: "America/La_Paz · Bolivia" },
  { value: "UTC", label: "UTC · Tiempo universal" },
];

/** Lista de zonas del selector; incluye la actual aunque no sea una de las habituales. */
export function timeZoneOptions(current: string): ReadonlyArray<{ value: string; label: string }> {
  if (!current || TIME_ZONE_OPTIONS.some((o) => o.value === current)) return TIME_ZONE_OPTIONS;
  return [{ value: current, label: current }, ...TIME_ZONE_OPTIONS];
}

/** Idiomas en el orden fijo ES, EN, PT y sin repetidos. */
export function sortLanguages(list: readonly LanguageCode[]): LanguageCode[] {
  return LANGUAGE_CODES.filter((code) => list.includes(code));
}

/** Marca o desmarca un idioma (chip) conservando el orden ES, EN, PT. */
export function toggleLanguage(list: readonly LanguageCode[], code: LanguageCode): LanguageCode[] {
  return list.includes(code) ? sortLanguages(list.filter((c) => c !== code)) : sortLanguages([...list, code]);
}

/** Candidatos a responsable de aprobación: usuarios activos con rol OWNER (regla del backend). */
export function approvalCandidates(users: readonly User[]): User[] {
  return users
    .filter((u) => u.isActive && u.roles.includes("OWNER"))
    .sort((a, b) => personName(a.firstName, a.lastName).localeCompare(personName(b.firstName, b.lastName), "es"));
}

type PersonLike = Pick<ApprovalResponsible, "firstName" | "lastName" | "email">;

export function responsibleLabel(person: PersonLike): string {
  return `${personName(person.firstName, person.lastName)} · ${person.email}`;
}

export const NO_RESPONSIBLE_LABEL = "Sin responsable";

/**
 * Opciones del selector de responsable: "Sin responsable" y los propietarios activos. El responsable
 * guardado se agrega aunque no esté en la lista: mientras la lista carga (para mostrar su nombre) o
 * porque ya no es válido (inactivo o sin OWNER; el backend rechazaría el próximo guardado).
 */
export function responsibleOptions(
  users: readonly User[] | undefined,
  current: ApprovalResponsible | null,
): { options: Array<{ value: string; label: string }>; currentInvalid: boolean } {
  const candidates = users ? approvalCandidates(users) : [];
  const options = [
    { value: "", label: NO_RESPONSIBLE_LABEL },
    ...candidates.map((u) => ({ value: u.id, label: responsibleLabel(u) })),
  ];
  const listed = current !== null && candidates.some((u) => u.id === current.id);
  if (current === null || listed) return { options, currentInvalid: false };
  const currentInvalid = users !== undefined;
  const label = responsibleLabel(current) + (currentInvalid ? " (ya no es válido)" : "");
  return { options: [options[0]!, { value: current.id, label }, ...options.slice(1)], currentInvalid };
}

// ---------------------------------------------------------------- modelos por pestaña

export interface EmpresaValues {
  businessName: string;
  logoUrl: string;
  description: string;
  address: string;
  whatsappNumber: string;
  email: string;
  website: string;
  currency: CurrencyCode;
  timeZone: string;
  languages: LanguageCode[];
}

export function empresaValues(config: RestaurantConfig): EmpresaValues {
  return {
    businessName: config.businessName,
    logoUrl: config.logoUrl ?? "",
    description: config.description ?? "",
    address: config.address,
    whatsappNumber: config.whatsappNumber,
    email: config.email,
    website: config.website ?? "",
    currency: config.currency,
    timeZone: config.timeZone,
    languages: sortLanguages(config.languages),
  };
}

export interface PoliticasValues {
  reservationPolicy: string;
  cancellationPolicy: string;
}

export function politicasValues(config: RestaurantConfig): PoliticasValues {
  return { reservationPolicy: config.reservationPolicy, cancellationPolicy: config.cancellationPolicy };
}

export interface SamantaValues {
  responseTimeoutMinutes: string;
}

export function samantaValues(config: RestaurantConfig): SamantaValues {
  return { responseTimeoutMinutes: String(config.responseTimeoutMinutes) };
}

/** Ajustes › Empresa › Aprobación del propietario (M9.1). */
export interface OwnerApprovalValues {
  /** "" = sin número. */
  ownerWhatsappNumber: string;
  /** "" = sin responsable. */
  approvalResponsibleId: string;
}

export function ownerApprovalValues(config: RestaurantConfig): OwnerApprovalValues {
  return {
    ownerWhatsappNumber: config.ownerWhatsappNumber ?? "",
    approvalResponsibleId: config.approvalResponsibleId ?? "",
  };
}

/** Configuración inicial (restaurante sin configurar): Empresa, políticas y tiempo de respuesta. */
export type SetupValues = EmpresaValues & PoliticasValues & Pick<SamantaValues, "responseTimeoutMinutes">;

export function emptySetupValues(): SetupValues {
  return {
    businessName: "",
    logoUrl: "",
    description: "",
    address: "",
    whatsappNumber: "",
    email: "",
    website: "",
    currency: "PEN",
    timeZone: DEFAULT_TIME_ZONE,
    languages: ["ES"],
    reservationPolicy: "",
    cancellationPolicy: "",
    responseTimeoutMinutes: "",
  };
}

/**
 * Cuerpo completo (sin validar) de la primera configuración: los 7 días cerrados (se ajustan luego
 * en Horarios), sin coordenadas y sin responsable de aprobación.
 */
export function setupRequestInput(values: SetupValues): ConfigInput {
  return {
    businessName: values.businessName,
    logoUrl: values.logoUrl,
    description: values.description,
    address: values.address,
    latitude: null,
    longitude: null,
    whatsappNumber: values.whatsappNumber,
    email: values.email,
    website: values.website,
    currency: values.currency,
    timeZone: values.timeZone,
    reservationPolicy: values.reservationPolicy,
    cancellationPolicy: values.cancellationPolicy,
    responseTimeoutMinutes: values.responseTimeoutMinutes,
    approvalResponsibleId: null,
    languages: values.languages,
    schedules: closedWeek(),
  };
}

export interface DayValues {
  isOpen: boolean;
  /** "HH:mm" o "" si aún no se indicó. Se conserva al cerrar el día para poder reabrirlo. */
  openTime: string;
  closeTime: string;
}

export type HorariosValues = Record<DayOfWeek, DayValues>;

export function horariosValues(config: RestaurantConfig): HorariosValues {
  const values = {} as HorariosValues;
  for (const day of DAYS_OF_WEEK) {
    const schedule = config.schedules.find((s) => s.dayOfWeek === day);
    // Un día que falta se trata como cerrado (puede pasar con filas creadas fuera de la API).
    const open = Boolean(schedule?.isOpen && schedule.openTime && schedule.closeTime);
    values[day] = {
      isOpen: open,
      openTime: open ? (schedule?.openTime ?? "") : "",
      closeTime: open ? (schedule?.closeTime ?? "") : "",
    };
  }
  return values;
}

/** Dos días son iguales si coinciden abierto/cerrado y, si abren, sus horas (las de un día cerrado no cuentan). */
export function sameDay(a: DayValues, b: DayValues): boolean {
  return a.isOpen === b.isOpen && (!a.isOpen || (a.openTime === b.openTime && a.closeTime === b.closeTime));
}

/** Día en la forma que valida el esquema: un día cerrado viaja sin horas. */
export function dayToInput(dayOfWeek: DayOfWeek, day: DayValues): ScheduleInputDraft {
  return day.isOpen
    ? { dayOfWeek, isOpen: true, openTime: day.openTime, closeTime: day.closeTime }
    : { dayOfWeek, isOpen: false, openTime: null, closeTime: null };
}

/** Semana completa de lunes a domingo (el índice coincide con los errores "schedules.<i>.*"). */
export function weekToInput(values: HorariosValues): ScheduleInputDraft[] {
  return DAYS_OF_WEEK.map((day) => dayToInput(day, values[day]));
}

// ---------------------------------------------------------------- detección de cambios

/** Igualdad de valores de formulario: primitivos y listas (en orden). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  return Object.is(a, b);
}

/**
 * Propiedades del borrador que difieren de la configuración vigente. Si el usuario vuelve a escribir
 * el valor original, deja de contar como cambio.
 */
export function changedKeys<T extends object>(
  base: T,
  draft: Partial<T>,
  equals: (a: T[keyof T], b: T[keyof T]) => boolean = sameValue,
): Array<keyof T> {
  return (Object.keys(draft) as Array<keyof T>).filter((key) => {
    const value = draft[key];
    return value !== undefined && !equals(base[key], value as T[keyof T]);
  });
}

export function pickValues<T extends object, K extends keyof T>(values: T, keys: readonly K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) picked[key] = values[key];
  return picked;
}
