/**
 * Validación en el cliente del cuerpo de PUT /restaurant-config, replicando las reglas de bk-crm
 * (docs/backend/configuracion-restaurante.md). El backend sigue siendo la autoridad: esto solo evita
 * viajes inútiles y muestra el error junto a cada campo.
 */
import { z } from "zod";
import {
  DAYS_OF_WEEK,
  LANGUAGE_CODES,
  type CurrencyCode,
  type PutRestaurantConfigRequest,
  type RestaurantScheduleInput,
} from "@/lib/api/types";
import type { SettingsTab } from "@/lib/auth/permissions";

/** WhatsApp del negocio en formato E.164 (sin espacios ni guiones). */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
/** "HH:mm" de 00:00 a 23:59. */
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const CURRENCY_CODES = ["PEN", "USD"] as const satisfies readonly CurrencyCode[];

export const CONFIG_LIMITS = {
  businessName: 150,
  address: 300,
  description: 2000,
  policy: 5000,
  url: 2048,
  /** El DTO dice 320, pero validator.js corta en 254. */
  email: 254,
  timeZone: 64,
  minTimeout: 1,
  maxTimeout: 1440,
} as const;

export const SCHEDULE_MESSAGES = {
  openRequired: "Indica la hora de apertura.",
  closeRequired: "Indica la hora de cierre.",
  format: "Usa el formato HH:mm (00:00 a 23:59).",
  closeMidnight: "El cierre no puede ser 00:00: el más tardío es 23:59.",
  order: "La apertura debe ser anterior al cierre (no se admite cruzar la medianoche).",
  week: "Debe haber un horario para cada día de la semana.",
} as const;

/**
 * Error si el WhatsApp del propietario es el del negocio (el backend responde 400
 * «ownerWhatsappNumber debe ser distinto de whatsappNumber»: el negocio no puede escribirse a sí mismo).
 */
export function ownerNumberError(owner: string | null, business: string): string | undefined {
  return owner !== null && owner === compactPhone(business)
    ? "Debe ser distinto del WhatsApp del negocio: es el número personal del propietario."
    : undefined;
}

/** Quita separadores visuales: "+51 987 000 192" → "+51987000192". */
export function compactPhone(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

/** Zona IANA aceptada por Intl (mismo criterio que el backend). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const HOST_LABEL = /^[a-z0-9¡-￿](?:[a-z0-9¡-￿-]{0,61}[a-z0-9¡-￿])?$/i;
const TLD = /^(?:[a-z¡-￿]{2,63}|xn--[a-z0-9-]{2,59})$/i;

/**
 * Motivo por el que el backend rechazaría una URL (null si es válida): http/https con protocolo,
 * dominio con extensión o IP (localhost no), sin espacios ni guiones bajos en el host, ≤ 2048.
 */
export function urlProblem(value: string): string | null {
  if (value.length > CONFIG_LIMITS.url) return `Máximo ${CONFIG_LIMITS.url} caracteres.`;
  if (/\s/.test(value)) return "La URL no puede tener espacios.";
  const match = /^https?:\/\/([^/?#]*)/i.exec(value);
  if (!match) return "Escribe la URL completa, empezando con https:// o http://.";
  try {
    new URL(value);
  } catch {
    return "La URL no es válida.";
  }
  const authority = match[1] ?? "";
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  if (host.startsWith("[")) return /^\[[0-9a-f:.]+\](?::\d+)?$/i.test(host) ? null : "La URL no es válida.";
  const hostname = host.replace(/:\d*$/, "");
  if (IPV4.test(hostname)) return null;
  const labels = hostname.split(".");
  const tld = labels[labels.length - 1] ?? "";
  if (labels.length < 2 || !TLD.test(tld)) {
    return "Usa un dominio público con extensión (por ejemplo, https://mirestaurante.pe); localhost no es válido.";
  }
  return labels.every((label) => HOST_LABEL.test(label)) ? null : "La URL no es válida.";
}

const requiredText = (max: number, required: string) =>
  z.string({ error: required }).trim().min(1, required).max(max, `Máximo ${max} caracteres.`);

/** Texto opcional: la cadena vacía se envía como null (el backend rechaza ""). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullable()
    .transform((value) => (value === "" ? null : value));

/** URL opcional: la cadena vacía se envía como null. */
const optionalUrl = z
  .string()
  .trim()
  .nullable()
  .superRefine((value, ctx) => {
    const problem = value ? urlProblem(value) : null;
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((value) => (value === "" ? null : value));

const PHONE_REQUIRED = "Ingresa el WhatsApp del negocio.";
const EMAIL_REQUIRED = "Ingresa el correo.";
const TIME_ZONE_REQUIRED = "Elige la zona horaria.";
const TIMEOUT_MESSAGE = "Ingresa minutos enteros entre 1 y 1440.";
const LANGUAGES_REQUIRED = "Elige al menos un idioma.";

const scheduleSchema = z
  .strictObject({
    dayOfWeek: z.enum(DAYS_OF_WEEK),
    isOpen: z.boolean(),
    openTime: z.string().nullable(),
    closeTime: z.string().nullable(),
  })
  .superRefine((day, ctx) => {
    if (!day.isOpen) return;
    const open = day.openTime ?? "";
    const close = day.closeTime ?? "";
    let valid = true;
    if (!TIME_PATTERN.test(open)) {
      valid = false;
      ctx.addIssue({ code: "custom", path: ["openTime"], message: open ? SCHEDULE_MESSAGES.format : SCHEDULE_MESSAGES.openRequired });
    }
    if (!TIME_PATTERN.test(close)) {
      valid = false;
      ctx.addIssue({ code: "custom", path: ["closeTime"], message: close ? SCHEDULE_MESSAGES.format : SCHEDULE_MESSAGES.closeRequired });
    }
    if (!valid) return;
    if (close === "00:00") ctx.addIssue({ code: "custom", path: ["closeTime"], message: SCHEDULE_MESSAGES.closeMidnight });
    else if (open >= close) ctx.addIssue({ code: "custom", path: ["closeTime"], message: SCHEDULE_MESSAGES.order });
  })
  // Un día cerrado siempre viaja sin horas (el backend no admite horas en un día cerrado).
  .transform(
    (day): RestaurantScheduleInput =>
      day.isOpen && day.openTime && day.closeTime
        ? { dayOfWeek: day.dayOfWeek, isOpen: true, openTime: day.openTime, closeTime: day.closeTime }
        : { dayOfWeek: day.dayOfWeek, isOpen: false, openTime: null, closeTime: null },
  );

/** Un esquema por propiedad del cuerpo del PUT (cada pestaña valida solo lo que edita). */
export const configFieldSchemas = {
  businessName: requiredText(CONFIG_LIMITS.businessName, "Ingresa el nombre comercial."),
  logoUrl: optionalUrl,
  description: optionalText(CONFIG_LIMITS.description),
  address: requiredText(CONFIG_LIMITS.address, "Ingresa la dirección."),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  whatsappNumber: z
    .string({ error: PHONE_REQUIRED })
    .transform(compactPhone)
    .pipe(
      z
        .string()
        .min(1, PHONE_REQUIRED)
        .regex(E164_PATTERN, "Usa el formato internacional: + código de país y número (por ejemplo, +51987654321)."),
    ),
  email: z
    .string({ error: EMAIL_REQUIRED })
    .trim()
    .toLowerCase()
    .min(1, EMAIL_REQUIRED)
    .max(CONFIG_LIMITS.email, `Máximo ${CONFIG_LIMITS.email} caracteres.`)
    .pipe(z.email("Ingresa un correo válido (por ejemplo, reservas@mirestaurante.pe).")),
  /** "" o null → null (sin número). Omitido en el PUT, el backend conserva el guardado. */
  ownerWhatsappNumber: z
    .string()
    .nullable()
    .transform((value) => (value === null ? null : compactPhone(value)))
    .transform((value) => (value === "" ? null : value))
    .pipe(
      z
        .string()
        .regex(E164_PATTERN, "Usa el formato internacional: + código de país y número (por ejemplo, +51912345678).")
        .nullable(),
    )
    .optional(),
  website: optionalUrl,
  currency: z.enum(CURRENCY_CODES, { error: "Elige PEN o USD." }),
  timeZone: z
    .string({ error: TIME_ZONE_REQUIRED })
    .trim()
    .min(1, TIME_ZONE_REQUIRED)
    .max(CONFIG_LIMITS.timeZone, "Zona horaria no válida.")
    .refine(isValidTimeZone, "Zona horaria no válida."),
  reservationPolicy: requiredText(CONFIG_LIMITS.policy, "Escribe la política de reserva."),
  cancellationPolicy: requiredText(CONFIG_LIMITS.policy, "Escribe la política de cancelación."),
  responseTimeoutMinutes: z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === "number" ? value : value.trim() === "" ? Number.NaN : Number(value)))
    .pipe(
      z
        .number({ error: TIMEOUT_MESSAGE })
        .int(TIMEOUT_MESSAGE)
        .min(CONFIG_LIMITS.minTimeout, TIMEOUT_MESSAGE)
        .max(CONFIG_LIMITS.maxTimeout, TIMEOUT_MESSAGE),
    ),
  approvalResponsibleId: z
    .string()
    .trim()
    .nullable()
    .transform((value) => (value === "" ? null : value))
    .pipe(z.uuid("Elige un responsable válido.").nullable()),
  languages: z
    .array(z.enum(LANGUAGE_CODES), { error: LANGUAGES_REQUIRED })
    .min(1, LANGUAGES_REQUIRED)
    .max(LANGUAGE_CODES.length, "Elige como máximo tres idiomas.")
    .refine((list) => new Set(list).size === list.length, "No repitas idiomas.")
    .transform((list) => LANGUAGE_CODES.filter((code) => list.includes(code))),
  schedules: z
    .array(scheduleSchema, { error: SCHEDULE_MESSAGES.week })
    .length(DAYS_OF_WEEK.length, SCHEDULE_MESSAGES.week)
    .refine((list) => new Set(list.map((day) => day.dayOfWeek)).size === DAYS_OF_WEEK.length, SCHEDULE_MESSAGES.week),
};

/** Cuerpo completo de PUT /restaurant-config. Como el backend, rechaza propiedades no declaradas. */
export const configSchema = z.strictObject(configFieldSchemas);

export type ConfigField = keyof PutRestaurantConfigRequest;
/** Lo que aceptan los esquemas: valores de formulario (cadenas) o el cuerpo ya armado. */
export type ConfigInput = z.input<typeof configSchema>;
export type ScheduleInputDraft = z.input<typeof scheduleSchema>;

/** Errores por ruta: "businessName", "schedules.3.closeTime"… */
export type FieldErrors = Record<string, string>;
export type Validation<T> = { success: true; data: T } | { success: false; errors: FieldErrors };

export function issuesToErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Valida el cuerpo completo (configuración inicial). */
export function validateConfig(input: ConfigInput): Validation<PutRestaurantConfigRequest> {
  const result = configSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false, errors: issuesToErrors(result.error.issues) };
}

/** Valida solo las propiedades presentes (lo que cambió en una pestaña). */
export function validateFields(input: Partial<ConfigInput>): Validation<Partial<PutRestaurantConfigRequest>> {
  const mask: Partial<Record<ConfigField, true>> = {};
  for (const key of Object.keys(input) as ConfigField[]) mask[key] = true;
  const result = configSchema.pick(mask).safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false, errors: issuesToErrors(result.error.issues) };
}

/** Quita los errores de los campos editados (y de sus subrutas, p. ej. "schedules.3.*"). */
export function withoutErrors(errors: FieldErrors, ...keys: string[]): FieldErrors {
  const touched = (path: string) => keys.some((key) => path === key || path.startsWith(`${key}.`));
  const entries = Object.entries(errors).filter(([path]) => !touched(path));
  return entries.length === Object.keys(errors).length ? errors : Object.fromEntries(entries);
}

/** Pestaña de Ajustes donde se edita cada propiedad del PUT (latitud y longitud se conservan sin mostrarse). */
const FIELD_TABS: Record<ConfigField, SettingsTab> = {
  businessName: "empresa",
  logoUrl: "empresa",
  description: "empresa",
  address: "empresa",
  latitude: "empresa",
  longitude: "empresa",
  whatsappNumber: "empresa",
  ownerWhatsappNumber: "empresa",
  email: "empresa",
  website: "empresa",
  currency: "empresa",
  timeZone: "empresa",
  languages: "empresa",
  schedules: "horarios",
  reservationPolicy: "politicas",
  cancellationPolicy: "politicas",
  responseTimeoutMinutes: "samanta",
  approvalResponsibleId: "empresa",
};

const CONFIG_TAB_ORDER: readonly SettingsTab[] = ["empresa", "horarios", "politicas", "samanta"];

/**
 * Pestañas que mencionan los errores del backend. Como el PUT reenvía todo, una propiedad de otra
 * pestaña puede impedir el guardado (p. ej. un responsable que ya no es OWNER al guardar Horarios).
 * El backend antepone el nombre de la propiedad ("schedules.4.openTime …", "logoUrl must be …").
 */
export function backendMessageTabs(messages: readonly string[]): SettingsTab[] {
  const found = new Set<SettingsTab>();
  for (const message of messages) {
    if (/responsable de aprobaci[oó]n/i.test(message)) found.add("empresa");
    if (/horarios/i.test(message)) found.add("horarios");
    for (const [field, tab] of Object.entries(FIELD_TABS) as Array<[ConfigField, SettingsTab]>) {
      if (new RegExp(`\\b${field}\\b`).test(message)) found.add(tab);
    }
  }
  return CONFIG_TAB_ORDER.filter((tab) => found.has(tab));
}
