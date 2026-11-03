/**
 * Cálculos de Estadísticas. El backend no tiene endpoints de agregados: todo se deriva en el cliente
 * de los listados de reservas, solicitudes y conversaciones del periodo.
 * Todas las fechas se interpretan en la zona del restaurante, nunca en la del navegador.
 */
import { TZDate } from "@date-fns/tz";
import {
  MAX_PAGE_SIZE,
  type ContactChannel,
  type Conversation,
  type Paginated,
  type Reservation,
  type ReservationRequest,
} from "@/lib/api/types";
import { itemName } from "@/lib/domain/conversation";
import { DAYS_LONG, MONTHS_LONG, MONTHS_SHORT, WEEK_DAYS_SHORT, startOfZonedMonth, startOfZonedWeek, zonedParts } from "@/lib/format/dates";

export const STATS_PERIODS = ["semana", "mes"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/** Periodo actual en la zona del restaurante: [start, end). */
export interface PeriodRange {
  period: StatsPeriod;
  /** Inicio incluido (ms). */
  start: number;
  /** Fin excluido (ms). */
  end: number;
  /** `dateFrom` para el backend (UTC con segundos). */
  fromIso: string;
  /** `dateTo` para el backend (UTC con segundos). */
  toIso: string;
  /** Texto que sigue a "para": "la semana del 12 al 18 de octubre" u "octubre 2026". */
  label: string;
}

/** Semana (lunes 00:00 → lunes siguiente) o mes (día 1 00:00 → día 1 siguiente) que contiene `now`. */
export function periodRange(period: StatsPeriod, now: number, timeZone: string): PeriodRange {
  const first = period === "semana" ? startOfZonedWeek(now, timeZone) : startOfZonedMonth(now, timeZone);
  const next =
    period === "semana"
      ? new TZDate(first.getFullYear(), first.getMonth(), first.getDate() + 7, 0, 0, 0, 0, timeZone)
      : new TZDate(first.getFullYear(), first.getMonth() + 1, 1, 0, 0, 0, 0, timeZone);
  const start = first.getTime();
  const end = next.getTime();
  return {
    period,
    start,
    end,
    fromIso: new Date(start).toISOString(),
    toIso: new Date(end).toISOString(),
    label: period === "semana" ? weekLabel(start, end, timeZone) : monthLabel(start, timeZone),
  };
}

function weekLabel(start: number, end: number, timeZone: string): string {
  const a = zonedParts(start, timeZone);
  const b = zonedParts(end - 1, timeZone);
  if (a.year !== b.year) {
    return `la semana del ${a.day} de ${MONTHS_LONG[a.month]} de ${a.year} al ${b.day} de ${MONTHS_LONG[b.month]} de ${b.year}`;
  }
  if (a.month !== b.month) return `la semana del ${a.day} de ${MONTHS_LONG[a.month]} al ${b.day} de ${MONTHS_LONG[b.month]}`;
  return `la semana del ${a.day} al ${b.day} de ${MONTHS_LONG[a.month]}`;
}

/** "octubre 2026", como el subtítulo del calendario. */
function monthLabel(start: number, timeZone: string): string {
  const p = zonedParts(start, timeZone);
  return `${MONTHS_LONG[p.month]} ${p.year}`;
}

export function isWithin(iso: string | null | undefined, range: Pick<PeriodRange, "start" | "end">): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return at >= range.start && at < range.end;
}

// ---------------------------------------------------------------- barras de reservas

export interface Bucket {
  key: string;
  /** Etiqueta bajo la barra ("Lun", "Sem 1"). */
  label: string;
  /** Descripción completa para lectores de pantalla y tooltip ("Lunes 12 oct", "Semana 1, del 1 al 4 oct"). */
  detail: string;
  value: number;
}

/** 7 barras de lunes a domingo con las reservas de cada día (zona del restaurante). */
export function reservationsByDay(rows: ReadonlyArray<Pick<Reservation, "reservationAt">>, range: PeriodRange, timeZone: string): Bucket[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    if (!isWithin(r.reservationAt, range)) continue;
    const p = zonedParts(r.reservationAt, timeZone);
    counts[(p.weekday + 6) % 7] += 1;
  }
  const monday = zonedParts(range.start, timeZone);
  return WEEK_DAYS_SHORT.map((label, i) => {
    const day = zonedParts(new TZDate(monday.year, monday.month, monday.day + i, 12, 0, 0, 0, timeZone).getTime(), timeZone);
    return { key: label, label, detail: `${DAYS_LONG[day.weekday]} ${day.day} ${MONTHS_SHORT[day.month]}`, value: counts[i] };
  });
}

export interface MonthWeek {
  label: string;
  /** Primer y último día del mes que abarca la semana (semanas de lunes a domingo recortadas al mes). */
  fromDay: number;
  toDay: number;
}

/** Desplazamiento del día 1 respecto del lunes (0 = el mes empieza en lunes). */
function mondayOffset(range: PeriodRange, timeZone: string): number {
  return (zonedParts(range.start, timeZone).weekday + 6) % 7;
}

/** Semanas del mes (de lunes a domingo, como la vista Semana), recortadas a los días del mes: 4 a 6. */
export function monthWeeks(range: PeriodRange, timeZone: string): MonthWeek[] {
  const offset = mondayOffset(range, timeZone);
  const daysInMonth = zonedParts(range.end - 1, timeZone).day;
  const count = Math.floor((daysInMonth - 1 + offset) / 7) + 1;
  return Array.from({ length: count }, (_, i) => ({
    label: `Sem ${i + 1}`,
    fromDay: Math.max(1, i * 7 - offset + 1),
    toDay: Math.min(daysInMonth, (i + 1) * 7 - offset),
  }));
}

/** Una barra por semana del mes con las reservas de esos días. */
export function reservationsByMonthWeek(
  rows: ReadonlyArray<Pick<Reservation, "reservationAt">>,
  range: PeriodRange,
  timeZone: string,
): Bucket[] {
  const weeks = monthWeeks(range, timeZone);
  const offset = mondayOffset(range, timeZone);
  const month = MONTHS_SHORT[zonedParts(range.start, timeZone).month];
  const counts = weeks.map(() => 0);
  for (const r of rows) {
    if (!isWithin(r.reservationAt, range)) continue;
    const index = Math.floor((zonedParts(r.reservationAt, timeZone).day - 1 + offset) / 7);
    if (index >= 0 && index < counts.length) counts[index] += 1;
  }
  return weeks.map((w, i) => ({
    key: w.label,
    label: w.label,
    detail: `Semana ${i + 1}, ${w.fromDay === w.toDay ? `el ${w.fromDay}` : `del ${w.fromDay} al ${w.toDay}`} ${month}`,
    value: counts[i],
  }));
}

// ---------------------------------------------------------------- solicitudes

export interface RequestSummary {
  /** Solicitudes leídas del periodo. */
  count: number;
  accepted: number;
  rejected: number;
  /** MODIFICATION_REQUESTED + RENEGOTIATING. */
  renegotiating: number;
  /** ACCEPTED / (ACCEPTED + REJECTED); null si aún no hay respuestas. */
  acceptanceRate: number | null;
}

export function acceptanceRate(accepted: number, rejected: number): number | null {
  const answered = accepted + rejected;
  return answered > 0 ? accepted / answered : null;
}

export function summarizeRequests(rows: ReadonlyArray<Pick<ReservationRequest, "status">>): RequestSummary {
  let accepted = 0;
  let rejected = 0;
  let renegotiating = 0;
  for (const r of rows) {
    if (r.status === "ACCEPTED") accepted += 1;
    else if (r.status === "REJECTED") rejected += 1;
    else if (r.status === "MODIFICATION_REQUESTED" || r.status === "RENEGOTIATING") renegotiating += 1;
  }
  return { count: rows.length, accepted, rejected, renegotiating, acceptanceRate: acceptanceRate(accepted, rejected) };
}

/** "80%", o "—" cuando no hay respuestas. */
export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export interface ServiceCount {
  name: string;
  count: number;
}

/** Servicios más pedidos: agrupa por nombre del servicio, ignora solicitudes sin servicio. */
export function topServices(rows: ReadonlyArray<Pick<ReservationRequest, "commercialItem">>, limit = 5): ServiceCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.commercialItem) continue;
    const name = itemName(r.commercialItem);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);
}

// ---------------------------------------------------------------- canales

/** Canales de la tarjeta, en el orden del mockup. */
export const STATS_CHANNELS = ["WHATSAPP", "INSTAGRAM", "FACEBOOK", "WEBSITE"] as const satisfies readonly ContactChannel[];

export interface ChannelStat {
  channel: (typeof STATS_CHANNELS)[number];
  /** Conversaciones cuyo último mensaje cae en el periodo. */
  conversations: number;
  /** Solicitudes del periodo por `sourceChannel` (la reserva no tiene canal en el backend). */
  requests: number;
}

export function channelStats(
  conversations: ReadonlyArray<Pick<Conversation, "channel" | "lastMessageAt">>,
  requests: ReadonlyArray<Pick<ReservationRequest, "sourceChannel">>,
  range: Pick<PeriodRange, "start" | "end">,
): ChannelStat[] {
  return STATS_CHANNELS.map((channel) => ({
    channel,
    conversations: conversations.filter((c) => c.channel === channel && isWithin(c.lastMessageAt, range)).length,
    requests: requests.filter((r) => r.sourceChannel === channel).length,
  }));
}

// ---------------------------------------------------------------- geometría de barras

/** Ancho en % respecto del máximo de la serie, escalado (100 o 60 como en el mockup). 0 si el máximo es 0. */
export function barPercent(value: number, max: number, scale = 100): number {
  if (max <= 0 || value <= 0) return 0;
  return (Math.min(value, max) / max) * scale;
}

/** Alto en px: valor / máximo × 110 (0 si el máximo es 0). */
export function barHeight(value: number, max: number, maxPx = 110): number {
  return Math.round(barPercent(value, max, maxPx));
}

// ---------------------------------------------------------------- lectura de conversaciones

export interface CollectedSince<T> {
  rows: T[];
  /** true si se dejó de leer por el límite de páginas habiendo aún conversaciones del periodo. */
  truncated: boolean;
}

/**
 * Lee las conversaciones (orden fijo `lastMessageAt` descendente, nulos al final) página a página y
 * sigue solo mientras el último elemento de la página tenga `lastMessageAt >= since`: las siguientes
 * páginas ya serían anteriores al periodo.
 */
export async function collectConversationsSince<T extends Pick<Conversation, "id" | "lastMessageAt">>(
  fetchPage: (page: number, limit: number) => Promise<Paginated<T>>,
  since: number,
  maxPages = 20,
): Promise<CollectedSince<T>> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page, MAX_PAGE_SIZE);
    for (const row of result.data) {
      // Si llega un mensaje mientras se leen las páginas, el orden se desplaza y una fila puede repetirse.
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    const last = result.data.at(-1);
    const lastInPeriod = last !== undefined && last.lastMessageAt !== null && Date.parse(last.lastMessageAt) >= since;
    if (!lastInPeriod || page >= result.pagination.totalPages) return { rows, truncated: false };
    if (page >= maxPages) return { rows, truncated: true };
  }
}
