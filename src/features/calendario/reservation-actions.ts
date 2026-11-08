/**
 * Lógica pura del detalle de reserva: qué acciones ve cada rol según el estado, validación de los
 * formularios (nueva reserva, editar, reprogramar, observación) y armado de los bodies que exige bk-crm.
 * Contrato: docs/frontend-api-completo.md, Parte 03 (reservas) y Parte 05 (Calendario).
 */
import { ApiError } from "@/lib/api/client";
import { isConnectionError, isValidationError } from "@/lib/api/errors";
import type {
  AssignReservationBody,
  CreateReservationBody,
  RescheduleReservationBody,
  Reservation,
  ReservationStatusTarget,
  UpdateReservationBody,
  User,
} from "@/lib/api/types";
import {
  RESERVATION_ASSIGNABLE_STATUSES,
  RESERVATION_EDITABLE_STATUSES,
  RESERVATION_STATUS_TRANSITIONS,
  RESERVATION_STATUSES_REQUIRING_ARRIVAL,
  canSetReservationStatus,
} from "@/lib/api/types";
import type { RoleCode } from "@/lib/auth/permissions";
import { isFutureIso, zonedInputsToIso, type ZonedInputs } from "@/lib/format/date-inputs";
import { personName } from "@/lib/format/text";
import { serverFormErrors, type ServerFormErrors } from "@/lib/forms/server-errors";

/** Límite de notas, motivos y observaciones (trim incluido). */
export const TEXT_MAX = 5000;
/** Máximo técnico de `numberOfPeople` (no es un aforo). */
export const MAX_PEOPLE = 2_147_483_647;
const MINUTE = 60_000;

/** 409 de bk-crm cuando aún no existe la configuración del restaurante. */
export const CONFIG_MISSING_MESSAGE = "Configura el restaurante antes de crear solicitudes o reservas";

export const FORM_MESSAGES = {
  customer: "Elige un cliente.",
  dateMissing: "Elige el día y la hora.",
  dateInvalid: "La fecha no es válida.",
  datePast: "Elige una fecha y hora futuras.",
  dateSame: "Elige una fecha u hora distinta de la actual.",
  people: "Escribe un número entero mayor o igual a 1.",
  textLong: `Escribe como máximo ${TEXT_MAX} caracteres.`,
  noteEmpty: "Escribe la observación.",
  noChanges: "No hay cambios para guardar.",
} as const;

// ---------------------------------------------------------------- estado

export type StatusActionTone = "primary" | "secondary" | "danger";

export interface StatusAction {
  target: ReservationStatusTarget;
  label: string;
  tone: StatusActionTone;
  /** Pregunta de la confirmación en línea; null si se aplica sin confirmar. */
  confirm: string | null;
  /** false mientras no llegue la hora de la reserva (Iniciar servicio, No asistió). */
  enabled: boolean;
}

const FINAL_WARNING = "Es un estado final: después ya no podrás cambiar el estado, editarla ni reprogramarla.";

const STATUS_ACTION_META: Record<ReservationStatusTarget, Omit<StatusAction, "target" | "enabled">> = {
  // Solo se ofrece desde RESCHEDULED: confirma la fecha nueva.
  CONFIRMED: { label: "Confirmar nueva fecha", tone: "primary", confirm: null },
  UPCOMING: {
    label: "Marcar como preparada",
    tone: "primary",
    confirm: "Una reserva preparada ya no vuelve a «Confirmada», salvo que la reprogrames. ¿Marcarla como preparada?",
  },
  IN_SERVICE: { label: "Iniciar servicio", tone: "secondary", confirm: null },
  COMPLETED: { label: "Marcar como completada", tone: "primary", confirm: `${FINAL_WARNING} ¿Marcarla como completada?` },
  CANCELLED: {
    label: "Cancelar reserva",
    tone: "danger",
    confirm: "Es un estado final: una reserva cancelada no se puede reactivar. ¿Cancelar la reserva?",
  },
  NO_SHOW: { label: "No asistió", tone: "secondary", confirm: `${FINAL_WARNING} ¿Marcar que el cliente no asistió?` },
};

/** Etiqueta del estado destino en el texto de éxito o error ("Cancelar reserva" → "cancelar la reserva"). */
export function statusActionLabel(target: ReservationStatusTarget): string {
  return STATUS_ACTION_META[target].label;
}

/**
 * Botones de cambio de estado, en el orden de `RESERVATION_STATUS_TRANSITIONS`. Iniciar servicio y No
 * asistió aparecen deshabilitados hasta la hora de la reserva (reloj del dispositivo; el del servidor manda).
 */
export function statusActions(
  reservation: Pick<Reservation, "status" | "reservationAt">,
  canWrite: boolean,
  now: number,
): StatusAction[] {
  if (!canWrite) return [];
  const at = new Date(now);
  return RESERVATION_STATUS_TRANSITIONS[reservation.status].map((target) => ({
    target,
    ...STATUS_ACTION_META[target],
    enabled: canSetReservationStatus(reservation, target, at),
  }));
}

/** true si hay acciones que esperan la hora de la reserva (para explicar por qué están deshabilitadas). */
export function waitsForArrival(actions: readonly StatusAction[]): boolean {
  return actions.some((a) => !a.enabled && RESERVATION_STATUSES_REQUIRING_ARRIVAL.includes(a.target));
}

/** Editar (personas, servicio, notas) y reprogramar: solo en CONFIRMED, UPCOMING y RESCHEDULED. */
export function canManageReservation(status: Reservation["status"], canEdit: boolean): boolean {
  return canEdit && RESERVATION_EDITABLE_STATUSES.includes(status);
}

// ---------------------------------------------------------------- responsable

export interface Viewer {
  roles: readonly RoleCode[];
  /** id de GET /auth/me. */
  userId: string | null;
  /** can("reservation.edit"). */
  canEdit: boolean;
}

/**
 * Control del responsable:
 * - "select": ADMIN elige a cualquier usuario activo con ADMIN u OPERATOR, o «Sin responsable».
 * - "take": OPERATOR sin ADMIN y la reserva está libre (se asigna a sí mismo).
 * - "release": OPERATOR sin ADMIN y la reserva es suya.
 * - "none": solo lectura (rol, estado final o reserva de otra persona).
 */
export type AssigneeAction = "select" | "take" | "release" | "none";

export function assigneeAction(reservation: Pick<Reservation, "status" | "assignedUserId">, viewer: Viewer): AssigneeAction {
  if (!viewer.canEdit || !RESERVATION_ASSIGNABLE_STATUSES.includes(reservation.status)) return "none";
  if (viewer.roles.includes("ADMIN")) return "select";
  if (!viewer.userId) return "none";
  if (reservation.assignedUserId === null) return "take";
  return reservation.assignedUserId === viewer.userId ? "release" : "none";
}

/** Candidatos del selector de ADMIN: activos con ADMIN u OPERATOR, ordenados por nombre. */
export function eligibleAssignees(users: readonly User[]): User[] {
  return users
    .filter((u) => u.isActive && u.roles.some((r) => r === "ADMIN" || r === "OPERATOR"))
    .sort((a, b) => personName(a.firstName, a.lastName).localeCompare(personName(b.firstName, b.lastName), "es"));
}

/** Valor del selector ("" = «Sin responsable») → body de PATCH /reservations/:id/assignee. */
export function assignBody(selected: string): AssignReservationBody {
  return { assignedUserId: selected === "" ? null : selected };
}

// ---------------------------------------------------------------- formularios

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

/** Personas: entero JSON de 1 a 2147483647; null si el texto no lo es. */
export function parsePeople(text: string): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= MAX_PEOPLE ? n : null;
}

/** Instante futuro a partir del día y la hora en la zona del restaurante, o el motivo del error. */
export function futureInstant(
  when: ZonedInputs,
  timeZone: string,
  now: number,
): { iso: string; error: null } | { iso: null; error: string } {
  if (!when.day || !when.time) return { iso: null, error: FORM_MESSAGES.dateMissing };
  const iso = zonedInputsToIso(when, timeZone);
  if (iso === null) return { iso: null, error: FORM_MESSAGES.dateInvalid };
  if (!isFutureIso(iso, now)) return { iso: null, error: FORM_MESSAGES.datePast };
  return { iso, error: null };
}

/** Texto opcional: recortado, o null si queda vacío. */
function optionalText(text: string): string | null {
  const value = text.trim();
  return value === "" ? null : value;
}

export type CreateField = "customerId" | "reservationAt" | "numberOfPeople" | "commercialItemId" | "notes";
export const CREATE_FIELDS: readonly CreateField[] = ["customerId", "reservationAt", "numberOfPeople", "commercialItemId", "notes"];

export interface CreateReservationForm {
  customerId: string | null;
  when: ZonedInputs;
  people: string;
  commercialItemId: string | null;
  notes: string;
}

/** Body de POST /reservations (los opcionales vacíos se omiten) o los errores por campo. */
export function validateCreate(
  form: CreateReservationForm,
  timeZone: string,
  now: number,
): { body: CreateReservationBody; errors: null } | { body: null; errors: FieldErrors<CreateField> } {
  const errors: FieldErrors<CreateField> = {};
  if (!form.customerId) errors.customerId = FORM_MESSAGES.customer;
  const when = futureInstant(form.when, timeZone, now);
  if (when.error) errors.reservationAt = when.error;
  const people = parsePeople(form.people);
  if (people === null) errors.numberOfPeople = FORM_MESSAGES.people;
  const notes = optionalText(form.notes);
  if (notes && notes.length > TEXT_MAX) errors.notes = FORM_MESSAGES.textLong;
  if (!form.customerId || when.iso === null || people === null || Object.keys(errors).length > 0) return { body: null, errors };

  const body: CreateReservationBody = { customerId: form.customerId, reservationAt: when.iso, numberOfPeople: people };
  if (form.commercialItemId) body.commercialItemId = form.commercialItemId;
  if (notes) body.notes = notes;
  return { body, errors: null };
}

export type EditField = "numberOfPeople" | "commercialItemId" | "notes";
export const EDIT_FIELDS: readonly EditField[] = ["numberOfPeople", "commercialItemId", "notes"];

export interface EditReservationForm {
  people: string;
  commercialItemId: string | null;
  notes: string;
}

export function editFormFrom(reservation: Pick<Reservation, "numberOfPeople" | "commercialItemId" | "notes">): EditReservationForm {
  return {
    people: String(reservation.numberOfPeople),
    commercialItemId: reservation.commercialItemId,
    notes: reservation.notes ?? "",
  };
}

/**
 * Body de PATCH /reservations/:id con solo lo que cambió (`null` quita el servicio o borra las notas).
 * Nunca envía `reservationAt`: la fecha se cambia con «Reprogramar» (y reenviarla ya pasada daría 400).
 */
export function updateBody(
  original: Pick<Reservation, "numberOfPeople" | "commercialItemId" | "notes">,
  form: EditReservationForm,
): { body: UpdateReservationBody; errors: FieldErrors<EditField> } {
  const errors: FieldErrors<EditField> = {};
  const body: UpdateReservationBody = {};
  const people = parsePeople(form.people);
  if (people === null) errors.numberOfPeople = FORM_MESSAGES.people;
  else if (people !== original.numberOfPeople) body.numberOfPeople = people;
  if (form.commercialItemId !== original.commercialItemId) body.commercialItemId = form.commercialItemId;
  const notes = optionalText(form.notes);
  if (notes && notes.length > TEXT_MAX) errors.notes = FORM_MESSAGES.textLong;
  else if (notes !== (original.notes ?? null)) body.notes = notes;
  return { body, errors };
}

export type RescheduleField = "reservationAt" | "reason";
export const RESCHEDULE_FIELDS: readonly RescheduleField[] = ["reservationAt", "reason"];

/** Body de PATCH /reservations/:id/reschedule (motivo opcional) o los errores por campo. */
export function validateReschedule(
  current: Pick<Reservation, "reservationAt">,
  form: { when: ZonedInputs; reason: string },
  timeZone: string,
  now: number,
): { body: RescheduleReservationBody; errors: null } | { body: null; errors: FieldErrors<RescheduleField> } {
  const errors: FieldErrors<RescheduleField> = {};
  const when = futureInstant(form.when, timeZone, now);
  if (when.iso === null) errors.reservationAt = when.error;
  // Se compara al minuto: es lo que muestran los campos de día y hora.
  else if (Math.floor(Date.parse(when.iso) / MINUTE) === Math.floor(Date.parse(current.reservationAt) / MINUTE)) {
    errors.reservationAt = FORM_MESSAGES.dateSame;
  }
  const reason = optionalText(form.reason);
  if (reason && reason.length > TEXT_MAX) errors.reason = FORM_MESSAGES.textLong;
  if (when.iso === null || Object.keys(errors).length > 0) return { body: null, errors };
  return { body: reason ? { reservationAt: when.iso, reason } : { reservationAt: when.iso }, errors: null };
}

/** Contenido de POST /reservations/:id/notes (1–5000 tras el trim) o el error. */
export function validateNote(text: string): { content: string; error: null } | { content: null; error: string } {
  const content = text.trim();
  if (content === "") return { content: null, error: FORM_MESSAGES.noteEmpty };
  if (content.length > TEXT_MAX) return { content: null, error: FORM_MESSAGES.textLong };
  return { content, error: null };
}

// ---------------------------------------------------------------- errores

/** Mensajes de negocio (en español) que corresponden a un campo del formulario. */
const BUSINESS_FIELDS: Readonly<Partial<Record<string, CreateField>>> = {
  "La fecha de reserva debe ser válida y futura": "reservationAt",
  "El elemento comercial debe estar activo y aprobado": "commercialItemId",
  "Elemento comercial no encontrado": "commercialItemId",
  "Cliente no encontrado": "customerId",
};

/**
 * Error de un guardado repartido entre los campos y el formulario. Además de la validación del DTO
 * (`serverFormErrors`), lleva al campo los mensajes de negocio que lo señalan (fecha pasada, servicio
 * inactivo, cliente inexistente). `uncertain` avisa de que un POST no idempotente pudo completarse.
 */
export function reservationFormErrors<F extends string>(
  error: unknown,
  fields: readonly F[],
  options: { uncertain?: string } = {},
): ServerFormErrors<F> {
  if (options.uncertain && isConnectionError(error)) return { fields: {}, form: options.uncertain };
  if (isValidationError(error)) return serverFormErrors(error, fields);
  if (error instanceof ApiError) {
    const field = error.messages
      .map((message) => BUSINESS_FIELDS[message])
      .find((name) => name !== undefined && (fields as readonly string[]).includes(name));
    if (field) return { fields: { [field]: error.messages.join(" ") } as Partial<Record<F, string>>, form: null };
  }
  return serverFormErrors(error, fields);
}

/** true si el error de un guardado pide refrescar la reserva: otra persona pudo cambiarla (403, 404, 409). */
export function shouldRefreshAfter(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409);
}

/** Texto de un error de acción (estado, responsable): el mensaje de bk-crm tal cual, tras un prefijo. */
export function actionErrorText(prefix: string, error: unknown): string {
  if (isConnectionError(error)) return `${prefix} No se pudo conectar con el servidor. Inténtalo de nuevo.`;
  const detail = error instanceof ApiError ? error.messages.join(" ") : error instanceof Error ? error.message : "";
  return detail ? `${prefix} ${detail}` : prefix;
}

/** true si el error es el 409 de configuración faltante (se enlaza a Ajustes › Empresa). */
export function isConfigMissing(error: unknown): boolean {
  return error instanceof ApiError && error.messages.includes(CONFIG_MISSING_MESSAGE);
}
