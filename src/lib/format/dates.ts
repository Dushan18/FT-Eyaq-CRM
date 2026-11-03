import { TZDate } from "@date-fns/tz";

/** Zona por defecto cuando aún no se cargó la configuración del restaurante. */
export const DEFAULT_TIME_ZONE = "America/Lima";

export const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
export const DAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
/** Lunes primero, como el calendario del mockup. */
export const WEEK_DAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
export const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export type DateInput = string | number | Date;

export interface ZonedParts {
  year: number;
  /** 0–11 */
  month: number;
  day: number;
  /** 0 = domingo */
  weekday: number;
  hour: number;
  minute: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toZoned(input: DateInput, timeZone: string): TZDate {
  const ms = input instanceof Date ? input.getTime() : new Date(input).getTime();
  return new TZDate(ms, timeZone);
}

export function zonedParts(input: DateInput, timeZone: string): ZonedParts {
  const d = toZoned(input, timeZone);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    weekday: d.getDay(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

export function isValidDate(input: DateInput | null | undefined): input is DateInput {
  if (input === null || input === undefined || input === "") return false;
  return !Number.isNaN(new Date(input).getTime());
}

/** "20:00" */
export function formatTime(input: DateInput, timeZone: string): string {
  const p = zonedParts(input, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Vie 16 oct · 20:00" */
export function formatDayTime(input: DateInput, timeZone: string): string {
  const p = zonedParts(input, timeZone);
  return `${DAYS_SHORT[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month]} · ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "12 oct 2026" */
export function formatDate(input: DateInput, timeZone: string): string {
  const p = zonedParts(input, timeZone);
  return `${pad(p.day)} ${MONTHS_SHORT[p.month]} ${p.year}`;
}

/** "Viernes 16 oct" */
export function formatWeekdayDate(input: DateInput, timeZone: string): string {
  const p = zonedParts(input, timeZone);
  return `${DAYS_LONG[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month]}`;
}

/** Clave estable de día en la zona del restaurante: "2026-10-16". */
export function dayKey(input: DateInput, timeZone: string): string {
  const p = zonedParts(input, timeZone);
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
}

/**
 * Hora de un mensaje: "19:02" si es de hoy, "Ayer 12:30" si es de ayer y "11 oct 09:10" en otro caso.
 */
export function formatMessageTime(input: DateInput, timeZone: string, now: DateInput = Date.now()): string {
  const time = formatTime(input, timeZone);
  const key = dayKey(input, timeZone);
  if (key === dayKey(now, timeZone)) return time;
  const yesterday = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000);
  if (key === dayKey(yesterday, timeZone)) return `Ayer ${time}`;
  const p = zonedParts(input, timeZone);
  return `${p.day} ${MONTHS_SHORT[p.month]} ${time}`;
}

function elapsedMs(input: DateInput, now: DateInput): number {
  return Math.max(0, new Date(now).getTime() - new Date(input).getTime());
}

/** Tiempo transcurrido compacto para listas: "ahora", "2 min", "1 h", "3 d", "12 oct". */
export function formatAgoShort(input: DateInput, now: DateInput = Date.now(), timeZone = DEFAULT_TIME_ZONE): string {
  const minutes = Math.floor(elapsedMs(input, now) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  const p = zonedParts(input, timeZone);
  return `${p.day} ${MONTHS_SHORT[p.month]}`;
}

/** Tiempo transcurrido en frase: "Hace 2 min", "Hace 1 h", "Ayer", "Hace 4 d", "12 oct 2026". */
export function formatAgoLong(input: DateInput, now: DateInput = Date.now(), timeZone = DEFAULT_TIME_ZONE): string {
  const minutes = Math.floor(elapsedMs(input, now) / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const yesterday = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000);
  // Pocas horas se expresan en horas aunque crucen la medianoche ("Hace 1 h", no "Ayer").
  if (hours < 12 || (hours < 24 && dayKey(input, timeZone) === dayKey(now, timeZone))) return `Hace ${hours} h`;
  if (dayKey(input, timeZone) === dayKey(yesterday, timeZone)) return "Ayer";
  const days = Math.max(1, Math.floor(hours / 24));
  if (days < 7) return `Hace ${days} d`;
  return formatDate(input, timeZone);
}

/** Duración entre dos instantes en texto corto: "13 min", "2 h 5 min", "1 d 3 h". */
export function formatDuration(fromInput: DateInput, toInput: DateInput): string {
  const minutes = Math.max(0, Math.round((new Date(toInput).getTime() - new Date(fromInput).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

/** Medianoche (00:00) del día indicado en la zona del restaurante, como ISO con desplazamiento. */
export function startOfZonedDay(year: number, month: number, day: number, timeZone: string): TZDate {
  return new TZDate(year, month, day, 0, 0, 0, 0, timeZone);
}

export function addDays(date: TZDate, days: number): TZDate {
  return new TZDate(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0, date.timeZone ?? DEFAULT_TIME_ZONE);
}

/** Lunes 00:00 de la semana que contiene la fecha (zona del restaurante). */
export function startOfZonedWeek(input: DateInput, timeZone: string): TZDate {
  const p = zonedParts(input, timeZone);
  const mondayOffset = (p.weekday + 6) % 7;
  return new TZDate(p.year, p.month, p.day - mondayOffset, 0, 0, 0, 0, timeZone);
}

/** Primer día del mes 00:00 (zona del restaurante). */
export function startOfZonedMonth(input: DateInput, timeZone: string): TZDate {
  const p = zonedParts(input, timeZone);
  return new TZDate(p.year, p.month, 1, 0, 0, 0, 0, timeZone);
}

/** ISO 8601 con desplazamiento explícito, como exige el backend: "2026-10-12T00:00:00.000-05:00". */
export function toIsoWithOffset(date: TZDate): string {
  return date.toISOString();
}

/** Combina un día (clave "YYYY-MM-DD") y una hora "HH:mm" en un instante de la zona del restaurante. */
export function zonedDateTime(day: string, time: string, timeZone: string): TZDate {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone);
}
