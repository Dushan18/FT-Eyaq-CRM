/**
 * Conversión entre los campos de fecha y hora de un formulario (día "YYYY-MM-DD" y hora "HH:mm",
 * siempre en la zona del restaurante) y el instante ISO que exige el backend (con segundos y zona).
 */
import { isValidDate, toZoned, zonedDateTime } from "./dates";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface ZonedInputs {
  /** "YYYY-MM-DD" en la zona del restaurante. */
  day: string;
  /** "HH:mm" en la zona del restaurante. */
  time: string;
}

/** Instante ISO con desplazamiento ("2026-11-07T20:00:00.000-05:00"), o null si falta o no es válido. */
export function zonedInputsToIso(inputs: ZonedInputs, timeZone: string): string | null {
  if (!DAY_RE.test(inputs.day) || !TIME_RE.test(inputs.time)) return null;
  const date = zonedDateTime(inputs.day, inputs.time, timeZone);
  if (Number.isNaN(date.getTime())) return null;
  // Rechaza fechas que no existen (31 de febrero): el día resultante debe ser el pedido.
  const pad = (n: number) => String(n).padStart(2, "0");
  const roundTrip = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return roundTrip === inputs.day ? date.toISOString() : null;
}

/** Día y hora de un instante en la zona del restaurante; vacíos si no hay instante. */
export function isoToZonedInputs(iso: string | null | undefined, timeZone: string): ZonedInputs {
  if (!isValidDate(iso)) return { day: "", time: "" };
  const d = toZoned(iso, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** true si el instante es posterior a `now` (el backend exige fechas futuras según su reloj). */
export function isFutureIso(iso: string | null, now: number = Date.now()): boolean {
  return iso !== null && Date.parse(iso) > now;
}
