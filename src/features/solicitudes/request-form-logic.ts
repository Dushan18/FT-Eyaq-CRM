/**
 * Lógica pura del alta y la edición de solicitudes de reserva (POST y PATCH /reservation-requests).
 * Contrato: docs/frontend-api-completo.md, Parte 03 («Crear solicitud de reserva», «Editar solicitud de reserva»).
 */
import { ApiError } from "@/lib/api/client";
import { isConnectionError, isValidationError } from "@/lib/api/errors";
import {
  CONTACT_CHANNELS,
  MONEY_PATTERN,
  RESERVATION_REQUEST_EDITABLE_STATUSES,
  type ContactChannel,
  type CreateReservationRequestBody,
  type CurrencyCode,
  type Customer,
  type CustomerSummary,
  type ReservationRequest,
  type ReservationRequestStatus,
  type UpdateReservationRequestBody,
} from "@/lib/api/types";
import { isFutureIso, isoToZonedInputs, zonedInputsToIso, type ZonedInputs } from "@/lib/format/date-inputs";
import { serverFormErrors } from "@/lib/forms/server-errors";

export const REQUEST_TEXT_MAX_LENGTH = 5000;
/** Máximo técnico del backend (int32), no un aforo. */
export const PEOPLE_MAX = 2_147_483_647;
/** Margen para no enviar una hora que el reloj del servidor ya considere pasada. */
export const FUTURE_MARGIN_MS = 60_000;

export const CURRENCY_OPTIONS: ReadonlyArray<{ value: CurrencyCode; label: string }> = [
  { value: "PEN", label: "PEN (S/)" },
  { value: "USD", label: "USD ($)" },
];

/** Editar y cancelar solo se admiten en INCOMPLETE_DATA y READY_TO_SEND (409 en otro estado). */
export function isEditableRequest(status: ReservationRequestStatus): boolean {
  return RESERVATION_REQUEST_EDITABLE_STATUSES.includes(status);
}

// ---------------------------------------------------------------- valores del formulario

export interface RequestFormValues {
  customer: CustomerSummary | null;
  /** "" mientras no se elige. */
  sourceChannel: ContactChannel | "";
  commercialItemId: string | null;
  /** Día y hora en la zona del restaurante; ambos vacíos = sin fecha. */
  when: ZonedInputs;
  people: string;
  price: string;
  /** null = no elegida: con precio, el backend usa la actual o la del restaurante. */
  currency: CurrencyCode | null;
  comments: string;
  specialRequirements: string;
}

/** Errores con el nombre del campo del backend, para cruzarlos con los 400 de validación. */
export type RequestField =
  | "customerId"
  | "sourceChannel"
  | "commercialItemId"
  | "reservationAt"
  | "numberOfPeople"
  | "quotedPrice"
  | "currency"
  | "comments"
  | "specialRequirements";

export type RequestFormErrors = Partial<Record<RequestField, string>>;

export const REQUEST_FIELDS: readonly RequestField[] = [
  "customerId",
  "sourceChannel",
  "commercialItemId",
  "reservationAt",
  "numberOfPeople",
  "quotedPrice",
  "currency",
  "comments",
  "specialRequirements",
];

const isCustomer = (c: Customer | CustomerSummary): c is Customer => "sourceChannel" in c;

/** Canal por defecto de una solicitud nueva: el indicado, o el de origen del cliente si se conoce. */
export function defaultRequestChannel(
  customer: Customer | CustomerSummary | null | undefined,
  channel?: ContactChannel,
): ContactChannel | "" {
  if (channel) return channel;
  return customer && isCustomer(customer) ? customer.sourceChannel : "";
}

export function emptyRequestForm(customer?: Customer | CustomerSummary | null, channel?: ContactChannel): RequestFormValues {
  return {
    customer: customer ?? null,
    sourceChannel: defaultRequestChannel(customer, channel),
    commercialItemId: null,
    when: { day: "", time: "" },
    people: "",
    price: "",
    currency: null,
    comments: "",
    specialRequirements: "",
  };
}

/** Valores de edición a partir de la solicitud guardada (fecha en la zona del restaurante). */
export function requestFormValues(r: ReservationRequest, timeZone: string): RequestFormValues {
  return {
    customer: r.customer,
    sourceChannel: r.sourceChannel,
    commercialItemId: r.commercialItemId,
    when: isoToZonedInputs(r.reservationAt, timeZone),
    people: r.numberOfPeople === null ? "" : String(r.numberOfPeople),
    price: r.quotedPrice ?? "",
    currency: r.currency,
    comments: r.comments ?? "",
    specialRequirements: r.specialRequirements ?? "",
  };
}

const sameWhen = (a: ZonedInputs, b: ZonedInputs) => a.day === b.day && a.time === b.time;
const isEmptyWhen = (w: ZonedInputs) => w.day === "" && w.time === "";

/** Personas: vacío = null; cualquier otro texto se convierte (NaN o decimal si no es un entero válido). */
export function parsePeople(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

// ---------------------------------------------------------------- validación

export interface RequestValidationOptions {
  timeZone: string;
  now: number;
  /** En la edición: la fecha guardada no se revalida si no cambió (no se reenvía). */
  initialWhen?: ZonedInputs;
}

export function validateRequestForm(values: RequestFormValues, options: RequestValidationOptions): RequestFormErrors {
  const errors: RequestFormErrors = {};
  if (!values.customer) errors.customerId = "Elige un cliente.";
  if (!values.sourceChannel || !(CONTACT_CHANNELS as readonly string[]).includes(values.sourceChannel)) {
    errors.sourceChannel = "Elige el canal por el que llegó la solicitud.";
  }

  const unchangedWhen = options.initialWhen !== undefined && sameWhen(values.when, options.initialWhen);
  if (!unchangedWhen && !isEmptyWhen(values.when)) {
    if (!values.when.day || !values.when.time) errors.reservationAt = "Completa el día y la hora, o deja ambos vacíos.";
    else {
      const iso = zonedInputsToIso(values.when, options.timeZone);
      if (iso === null) errors.reservationAt = "La fecha no es válida.";
      else if (!isFutureIso(iso, options.now + FUTURE_MARGIN_MS)) errors.reservationAt = "Elige una fecha y hora futuras.";
    }
  }

  const people = parsePeople(values.people);
  if (people !== null && (!Number.isSafeInteger(people) || people < 1 || people > PEOPLE_MAX)) {
    errors.numberOfPeople = "Escribe un número entero mayor que 0.";
  }

  const price = values.price.trim();
  if (price && !MONEY_PATTERN.test(price)) {
    errors.quotedPrice = "Escribe un importe como 150 o 150.50 (punto decimal, hasta 2 decimales).";
  }

  for (const key of ["comments", "specialRequirements"] as const) {
    if (values[key].trim().length > REQUEST_TEXT_MAX_LENGTH) errors[key] = `Escribe como máximo ${REQUEST_TEXT_MAX_LENGTH} caracteres.`;
  }
  return errors;
}

// ---------------------------------------------------------------- cuerpos

/** POST /reservation-requests: sin opcionales vacíos; la moneda solo junto al precio. */
export function buildCreateRequestBody(values: RequestFormValues, timeZone: string): CreateReservationRequestBody {
  const body: CreateReservationRequestBody = {
    customerId: values.customer!.id,
    sourceChannel: values.sourceChannel as ContactChannel,
  };
  if (values.commercialItemId) body.commercialItemId = values.commercialItemId;
  const reservationAt = isEmptyWhen(values.when) ? null : zonedInputsToIso(values.when, timeZone);
  if (reservationAt) body.reservationAt = reservationAt;
  const people = parsePeople(values.people);
  if (people !== null) body.numberOfPeople = people;
  const price = values.price.trim();
  if (price) {
    body.quotedPrice = price;
    // Sin moneda elegida, el backend usa la del restaurante.
    if (values.currency) body.currency = values.currency;
  }
  const comments = values.comments.trim();
  if (comments) body.comments = comments;
  const requirements = values.specialRequirements.trim();
  if (requirements) body.specialRequirements = requirements;
  return body;
}

const orNull = (value: string) => value.trim() || null;

function sameMoney(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

/**
 * PATCH /reservation-requests/:id: solo lo que cambió; `null` borra. La fecha solo se envía si cambió
 * (reenviar una fecha ya pasada responde 400). Borrar el precio borra también la moneda.
 */
export function buildUpdateRequestBody(
  initial: ReservationRequest,
  values: RequestFormValues,
  timeZone: string,
): UpdateReservationRequestBody {
  const body: UpdateReservationRequestBody = {};
  if (values.customer && values.customer.id !== initial.customerId) body.customerId = values.customer.id;
  if (values.sourceChannel && values.sourceChannel !== initial.sourceChannel) body.sourceChannel = values.sourceChannel;
  if (values.commercialItemId !== initial.commercialItemId) body.commercialItemId = values.commercialItemId;

  if (!sameWhen(values.when, isoToZonedInputs(initial.reservationAt, timeZone))) {
    body.reservationAt = isEmptyWhen(values.when) ? null : zonedInputsToIso(values.when, timeZone);
  }

  const people = parsePeople(values.people);
  if (people !== initial.numberOfPeople) body.numberOfPeople = people;

  const price = orNull(values.price);
  if (!sameMoney(price, initial.quotedPrice)) body.quotedPrice = price;
  if (price !== null && values.currency !== null && values.currency !== initial.currency) body.currency = values.currency;

  for (const key of ["comments", "specialRequirements"] as const) {
    const next = orNull(values[key]);
    if (next !== initial[key]) body[key] = next;
  }
  return body;
}

// ---------------------------------------------------------------- errores del guardado

export const SETUP_REQUIRED_ERROR = "Configura el restaurante antes de crear solicitudes o reservas";

export interface RequestSaveErrors {
  fields: RequestFormErrors;
  form: string | null;
  /** 409 por falta de configuración: se enlaza a Ajustes › Empresa. */
  needsSetup: boolean;
  /** Hay que releer la lista: conflicto, estado cambiado o un alta que pudo completarse. */
  refresh: boolean;
}

const BUSINESS_FIELDS: ReadonlyArray<readonly [string, RequestField]> = [
  ["La fecha de reserva debe ser válida y futura", "reservationAt"],
  ["El elemento comercial debe estar activo y aprobado", "commercialItemId"],
  ["Elemento comercial no encontrado", "commercialItemId"],
  ["El precio y la moneda deben estar presentes juntos", "quotedPrice"],
  ["Cliente no encontrado", "customerId"],
];

function withPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Lleva el error de un alta (`creating`) o una edición a su campo o al aviso del formulario. El alta no es
 * idempotente: ante un fallo de conexión pudo haberse creado, así que se pide revisar la lista.
 */
export function requestSaveErrors(error: unknown, creating: boolean): RequestSaveErrors {
  const result: RequestSaveErrors = { fields: {}, form: null, needsSetup: false, refresh: false };
  if (isConnectionError(error)) {
    result.refresh = true;
    result.form = creating
      ? "No se pudo confirmar si la solicitud se creó. Revisa la lista antes de volver a intentarlo."
      : "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    return result;
  }
  // `isValidationError` va primero: negado después de `instanceof`, el type guard dejaría `never`.
  if (!isValidationError(error) && error instanceof ApiError) {
    const message = error.messages.join(" ");
    const field = BUSINESS_FIELDS.find(([prefix]) => message.startsWith(prefix))?.[1];
    if (field) {
      result.fields[field] = withPeriod(message);
      return result;
    }
    if (message.startsWith(SETUP_REQUIRED_ERROR)) {
      result.needsSetup = true;
      result.form = withPeriod(message);
      return result;
    }
    if (error.status === 409 || error.status === 404) {
      // Estado que ya no admite cambios, conflicto concurrente o solicitud borrada: se relee.
      result.refresh = true;
      result.form = withPeriod(message);
      return result;
    }
  }
  const server = serverFormErrors(error, REQUEST_FIELDS);
  result.fields = server.fields;
  result.form = server.form;
  return result;
}
