/**
 * Lógica pura del Calendario: fechas civiles (sin hora) en la zona del restaurante, rangos de consulta,
 * grilla del mes, textos y agrupación de reservas por día.
 *
 * Las fechas de la URL (`fecha=2026-10-14`) son fechas civiles del restaurante: su aritmética (sumar días,
 * día de la semana) no depende de ninguna zona. Solo los límites que se envían al backend se convierten a
 * instantes, como medianoche local de la zona del restaurante.
 */
import type { ReservationListQuery, ReservationStatus, ReservationStatusTarget } from "@/lib/api/types";
import { RESERVATION_STATUS_TRANSITIONS } from "@/lib/api/types";
import { PREPARED_STATUS } from "@/lib/domain/statuses";
import { DAYS_LONG, MONTHS_LONG, dayKey, startOfZonedDay, zonedParts, type DateInput } from "@/lib/format/dates";

export const CALENDAR_VIEWS = ["dia", "semana", "mes"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const DEFAULT_CALENDAR_VIEW: CalendarView = "semana";

/** Fecha civil del restaurante. `month` va de 0 a 11, como en Date. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Lee "YYYY-MM-DD"; devuelve null si el texto no es una fecha real. */
export function parseDayKey(value: string | null | undefined): CivilDate | null {
  const match = value ? DAY_KEY_PATTERN.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (year < 1970 || month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Misma clave que `dayKey` de lib/format/dates: "2026-10-14". */
export function toDayKey(date: CivilDate): string {
  return `${date.year}-${pad(date.month + 1)}-${pad(date.day)}`;
}

/** Fecha civil de un instante en la zona del restaurante (por ejemplo, "hoy"). */
export function civilDateOf(instant: DateInput, timeZone: string): CivilDate {
  const p = zonedParts(instant, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

function civilFromUtc(ms: number): CivilDate {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

export function addCivilDays(date: CivilDate, days: number): CivilDate {
  return civilFromUtc(Date.UTC(date.year, date.month, date.day + days));
}

/** 0 = domingo … 6 = sábado. */
export function civilWeekday(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month, date.day)).getUTCDay();
}

/** Lunes de la semana que contiene la fecha (el calendario empieza en lunes). */
export function mondayOf(date: CivilDate): CivilDate {
  return addCivilDays(date, -((civilWeekday(date) + 6) % 7));
}

// ---------------------------------------------------------------- periodo y consulta

export interface PeriodRange {
  /** Primer día del periodo (incluido). */
  first: CivilDate;
  /** Día siguiente al último del periodo (excluido). */
  end: CivilDate;
  /** Límites para GET /reservations: [dateFrom, dateTo) como instantes UTC ("…Z"). */
  dateFrom: string;
  dateTo: string;
}

/** Días [first, end) del periodo visible: el día, la semana de lunes a domingo o el mes completo. */
export function periodBounds(view: CalendarView, anchor: CivilDate): { first: CivilDate; end: CivilDate } {
  if (view === "dia") return { first: anchor, end: addCivilDays(anchor, 1) };
  if (view === "semana") {
    const first = mondayOf(anchor);
    return { first, end: addCivilDays(first, 7) };
  }
  return {
    first: { year: anchor.year, month: anchor.month, day: 1 },
    end: civilFromUtc(Date.UTC(anchor.year, anchor.month + 1, 1)),
  };
}

/** Medianoche (00:00) de una fecha civil en la zona del restaurante, como ISO UTC con segundos. */
export function zonedMidnightIso(date: CivilDate, timeZone: string): string {
  const midnight = startOfZonedDay(date.year, date.month, date.day, timeZone);
  return new Date(midnight.getTime()).toISOString();
}

export function periodRange(view: CalendarView, anchor: CivilDate, timeZone: string): PeriodRange {
  const { first, end } = periodBounds(view, anchor);
  return { first, end, dateFrom: zonedMidnightIso(first, timeZone), dateTo: zonedMidnightIso(end, timeZone) };
}

/** Parámetros exactos de una página de GET /reservations para el periodo (sin claves de más). */
export function reservationsPageQuery(
  range: Pick<PeriodRange, "dateFrom" | "dateTo">,
  page: number,
  limit: number,
): ReservationListQuery {
  return { dateFrom: range.dateFrom, dateTo: range.dateTo, excludeCancelled: true, page, limit };
}

/** Fecha que se muestra al pasar al periodo anterior (delta -1) o siguiente (+1). */
export function shiftAnchor(anchor: CivilDate, view: CalendarView, delta: number): CivilDate {
  if (view === "dia") return addCivilDays(anchor, delta);
  if (view === "semana") return addCivilDays(anchor, 7 * delta);
  // Mes: se conserva el día, recortado al último día del mes de destino (31 ene → 28 feb).
  const target = civilFromUtc(Date.UTC(anchor.year, anchor.month + delta, 1));
  return { ...target, day: Math.min(anchor.day, daysInMonth(target.year, target.month)) };
}

// ---------------------------------------------------------------- grillas

/** Los 7 días (lunes a domingo) de la semana que contiene la fecha. */
export function weekDays(anchor: CivilDate): CivilDate[] {
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addCivilDays(monday, i));
}

export interface MonthCell {
  date: CivilDate;
  key: string;
  /** false para los días del mes anterior o siguiente que completan la primera y la última semana. */
  inMonth: boolean;
}

/** Semanas completas (lunes a domingo) necesarias para mostrar el mes de la fecha. */
export function monthGrid(anchor: CivilDate): MonthCell[] {
  const first: CivilDate = { year: anchor.year, month: anchor.month, day: 1 };
  const offset = (civilWeekday(first) + 6) % 7;
  const weeks = Math.ceil((offset + daysInMonth(anchor.year, anchor.month)) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addCivilDays(first, i - offset);
    return { date, key: toDayKey(date), inMonth: date.year === anchor.year && date.month === anchor.month };
  });
}

// ---------------------------------------------------------------- textos

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("es") + text.slice(1);

/**
 * Rango del subtítulo: "Semana del 12 al 18 de octubre.", "Semana del 28 de septiembre al 4 de octubre.",
 * "Octubre 2026." y vacío en la vista Día (el día ya aparece como título).
 */
export function periodSubtitle(view: CalendarView, anchor: CivilDate): string {
  if (view === "dia") return "";
  if (view === "mes") return `${capitalize(MONTHS_LONG[anchor.month])} ${anchor.year}.`;
  const start = mondayOf(anchor);
  const end = addCivilDays(start, 6);
  if (start.month === end.month) return `Semana del ${start.day} al ${end.day} de ${MONTHS_LONG[end.month]}.`;
  return `Semana del ${start.day} de ${MONTHS_LONG[start.month]} al ${end.day} de ${MONTHS_LONG[end.month]}.`;
}

/** "Miércoles 14 de octubre" */
export function dayTitle(date: CivilDate): string {
  return `${DAYS_LONG[civilWeekday(date)]} ${date.day} de ${MONTHS_LONG[date.month]}`;
}

// ---------------------------------------------------------------- reservas

/**
 * Agrupa por día local del restaurante (nunca por el día UTC: una cena a las 20:00 en Lima ya es el día
 * siguiente en UTC). Conserva el orden recibido (el backend ordena por reservationAt ascendente) y descarta
 * repetidos, que pueden aparecer si los datos cambian mientras se leen las páginas.
 */
export function groupByDay<T extends { id: string; reservationAt: string }>(
  rows: readonly T[],
  timeZone: string,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const key = dayKey(row.reservationAt, timeZone);
    const list = byDay.get(key);
    if (list) list.push(row);
    else byDay.set(key, [row]);
  }
  return byDay;
}

/** Estado destino de "Marcar como preparada" (PATCH /reservations/:id/status no acepta RESCHEDULED). */
export const PREPARED_TARGET: ReservationStatusTarget | null = PREPARED_STATUS === "RESCHEDULED" ? null : PREPARED_STATUS;

export type PrepareAction = "prepared" | "mark" | "none";

/**
 * Qué muestra el panel de detalle bajo los datos de la reserva:
 * - "prepared": ya está preparada (indicador fijo). No vuelve a Confirmada directamente: solo si se
 *   reprograma (pasa a Reprogramada y desde ahí se puede confirmar).
 * - "mark": el rol puede escribir y el backend permite la transición al estado de preparada.
 * - "none": nada (rol de solo lectura o estado que ya no admite la transición: en servicio, completada…).
 */
export function prepareAction(status: ReservationStatus, canWrite: boolean): PrepareAction {
  if (status === PREPARED_STATUS) return "prepared";
  if (!canWrite || PREPARED_TARGET === null) return "none";
  return RESERVATION_STATUS_TRANSITIONS[status].includes(PREPARED_TARGET) ? "mark" : "none";
}

/** El backend valida los :id con ParseUUIDPipe: un id mal formado en la URL se ignora en lugar de pedirlo. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
