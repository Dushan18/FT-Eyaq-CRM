/**
 * Lógica pura del alta y la edición de clientes (POST /customers, PATCH /customers/:id).
 * Contrato: docs/frontend-api-completo.md, Parte 03 («Crear cliente», «Editar cliente»).
 */
import { ApiError } from "@/lib/api/client";
import { isValidationError } from "@/lib/api/errors";
import {
  CONTACT_CHANNELS,
  type ContactChannel,
  type CreateCustomerInterestRequest,
  type CreateCustomerRequest,
  type Customer,
  type UpdateCustomerRequest,
} from "@/lib/api/types";
import { serverFormErrors } from "@/lib/forms/server-errors";

export const CUSTOMER_NAME_MAX_LENGTH = 100;
export const CUSTOMER_PHONE_MAX_LENGTH = 80;
export const CUSTOMER_EMAIL_MAX_LENGTH = 320;
export const CUSTOMER_NOTES_MAX_LENGTH = 5000;
export const INTEREST_NOTES_MAX_LENGTH = 5000;

/** El selector de país arranca en Perú, pero no se asume: se envía siempre el país elegido. */
export const DEFAULT_PHONE_COUNTRY = "PE";

/** Países del selector (ISO 3166-1 alfa-2). Perú primero; el resto por nombre. */
export const PHONE_COUNTRIES: ReadonlyArray<{ code: string; name: string; dial: string }> = [
  { code: "PE", name: "Perú", dial: "+51" },
  { code: "DE", name: "Alemania", dial: "+49" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "BO", name: "Bolivia", dial: "+591" },
  { code: "BR", name: "Brasil", dial: "+55" },
  { code: "CA", name: "Canadá", dial: "+1" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "KR", name: "Corea del Sur", dial: "+82" },
  { code: "CR", name: "Costa Rica", dial: "+506" },
  { code: "EC", name: "Ecuador", dial: "+593" },
  { code: "ES", name: "España", dial: "+34" },
  { code: "US", name: "Estados Unidos", dial: "+1" },
  { code: "FR", name: "Francia", dial: "+33" },
  { code: "IL", name: "Israel", dial: "+972" },
  { code: "IT", name: "Italia", dial: "+39" },
  { code: "JP", name: "Japón", dial: "+81" },
  { code: "MX", name: "México", dial: "+52" },
  { code: "NL", name: "Países Bajos", dial: "+31" },
  { code: "PA", name: "Panamá", dial: "+507" },
  { code: "PY", name: "Paraguay", dial: "+595" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "GB", name: "Reino Unido", dial: "+44" },
  { code: "CH", name: "Suiza", dial: "+41" },
  { code: "UY", name: "Uruguay", dial: "+598" },
  { code: "VE", name: "Venezuela", dial: "+58" },
];

/** Opciones del selector; si el cliente guardado tiene otro país, se añade para no perderlo. */
export function phoneCountryOptions(current: string): Array<{ code: string; label: string }> {
  const options = PHONE_COUNTRIES.map((c) => ({ code: c.code, label: `${c.name} (${c.dial})` }));
  if (current && !PHONE_COUNTRIES.some((c) => c.code === current)) options.push({ code: current, label: current });
  return options;
}

/** El backend solo valida con libphonenumber; aquí se previene lo evidente (caracteres y cantidad de dígitos). */
const PHONE_CHARS = /^\+?[\d\s().-]+$/;
/** Comprobación básica; el backend aplica @IsEmail. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

// ---------------------------------------------------------------- valores del formulario

export interface CustomerFormValues {
  /** "" mientras no se elige (solo en el alta). */
  sourceChannel: ContactChannel | "";
  firstName: string;
  lastName: string;
  phone: string;
  /** ISO alfa-2; "" = sin país (un número nacional sin país no se normaliza y exige correo). */
  phoneCountry: string;
  email: string;
  notes: string;
}

export type CustomerField = keyof CustomerFormValues;
export type CustomerFormErrors = Partial<Record<CustomerField, string>>;

export const CUSTOMER_FIELDS: readonly CustomerField[] = [
  "sourceChannel",
  "firstName",
  "lastName",
  "phone",
  "phoneCountry",
  "email",
  "notes",
];

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
  sourceChannel: "",
  firstName: "",
  lastName: "",
  phone: "",
  phoneCountry: DEFAULT_PHONE_COUNTRY,
  email: "",
  notes: "",
};

/** Valores de edición: lo guardado, con "" en vez de null. */
export function customerFormValues(c: Customer): CustomerFormValues {
  return {
    sourceChannel: c.sourceChannel,
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    phone: c.phone ?? "",
    // Un teléfono guardado sin país se muestra como «Sin país»: elegir uno es un cambio real.
    phoneCountry: c.phoneCountry ?? (c.phone ? "" : DEFAULT_PHONE_COUNTRY),
    email: c.email ?? "",
    notes: c.notes ?? "",
  };
}

/** Con «+» el país sale del prefijo y `phoneCountry` no se usa. */
export function isInternationalPhone(phone: string): boolean {
  return phone.trim().startsWith("+");
}

// ---------------------------------------------------------------- validación

export function phoneFormatError(phone: string): string | undefined {
  const value = phone.trim();
  if (!value) return undefined;
  if (value.length > CUSTOMER_PHONE_MAX_LENGTH) return `Escribe como máximo ${CUSTOMER_PHONE_MAX_LENGTH} caracteres.`;
  if (!PHONE_CHARS.test(value)) return "Usa solo dígitos, espacios, paréntesis, puntos o guiones (y un + al inicio).";
  const digits = value.replace(/\D/g, "").length;
  if (digits < 6 || digits > 15) return "El número debe tener entre 6 y 15 dígitos.";
  return undefined;
}

function nameError(value: string): string | undefined {
  return value.trim().length > CUSTOMER_NAME_MAX_LENGTH ? `Escribe como máximo ${CUSTOMER_NAME_MAX_LENGTH} caracteres.` : undefined;
}

/**
 * Canales cuyos clientes pueden ser una identidad del proveedor (Messenger e Instagram): bk-crm los crea
 * desde el webhook sin teléfono ni correo, y no admite cambiarles el canal. La respuesta no dice si un
 * cliente de estos canales lo es (uno creado a mano no lo es), así que en la edición se tratan todos igual
 * y decide el backend.
 */
export const PROVIDER_IDENTITY_CHANNELS = ["FACEBOOK", "INSTAGRAM"] as const satisfies readonly ContactChannel[];

export function isProviderIdentityChannel(channel: ContactChannel | ""): boolean {
  return (PROVIDER_IDENTITY_CHANNELS as readonly string[]).includes(channel);
}

export interface CustomerValidationOptions {
  /**
   * Omite la regla de contacto: las identidades de Messenger e Instagram están exentas y la respuesta no dice
   * si un cliente FACEBOOK o INSTAGRAM lo es, así que en la edición de esos clientes decide el backend.
   */
  skipContactRule?: boolean;
}

/** Mismas reglas que el backend: longitudes, formatos y «un correo o un teléfono normalizable». */
export function validateCustomerForm(values: CustomerFormValues, options: CustomerValidationOptions = {}): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (!values.sourceChannel || !(CONTACT_CHANNELS as readonly string[]).includes(values.sourceChannel)) {
    errors.sourceChannel = "Elige el canal por el que llegó.";
  }

  const firstName = nameError(values.firstName);
  if (firstName) errors.firstName = firstName;
  const lastName = nameError(values.lastName);
  if (lastName) errors.lastName = lastName;

  const email = values.email.trim();
  if (email.length > CUSTOMER_EMAIL_MAX_LENGTH) errors.email = `Escribe como máximo ${CUSTOMER_EMAIL_MAX_LENGTH} caracteres.`;
  else if (email && !EMAIL_PATTERN.test(email)) errors.email = "Escribe un correo válido.";

  const phone = values.phone.trim();
  const phoneError = phoneFormatError(phone);
  if (phoneError) errors.phone = phoneError;
  const international = isInternationalPhone(phone);
  if (phone && !international && values.phoneCountry && !COUNTRY_PATTERN.test(values.phoneCountry)) {
    errors.phoneCountry = "Elige un país de la lista.";
  }

  if (values.notes.trim().length > CUSTOMER_NOTES_MAX_LENGTH) {
    errors.notes = `Escribe como máximo ${CUSTOMER_NOTES_MAX_LENGTH} caracteres.`;
  }

  if (!options.skipContactRule && !errors.email && !errors.phone && !errors.phoneCountry) {
    const normalizable = phone !== "" && (international || values.phoneCountry !== "");
    if (!email && !normalizable) {
      if (!phone) errors.phone = "Escribe un teléfono o un correo: hace falta al menos uno.";
      else errors.phoneCountry = "Elige el país del número o agrega un correo.";
    }
  }
  return errors;
}

// ---------------------------------------------------------------- cuerpos

/** POST /customers: sin campos vacíos (nunca ""), con `phoneCountry` solo para un número nacional. */
export function buildCreateCustomerBody(values: CustomerFormValues): CreateCustomerRequest {
  const body: CreateCustomerRequest = { sourceChannel: values.sourceChannel as ContactChannel };
  const firstName = values.firstName.trim();
  if (firstName) body.firstName = firstName;
  const lastName = values.lastName.trim();
  if (lastName) body.lastName = lastName;
  const phone = values.phone.trim();
  if (phone) {
    body.phone = phone;
    if (!isInternationalPhone(phone) && values.phoneCountry) body.phoneCountry = values.phoneCountry;
  }
  const email = values.email.trim().toLowerCase();
  if (email) body.email = email;
  const notes = values.notes.trim();
  if (notes) body.notes = notes;
  return body;
}

const orNull = (value: string) => value.trim() || null;

/**
 * PATCH /customers/:id: solo lo que cambió respecto de `initial`; `null` borra. Cada vez que se envía un
 * teléfono nacional se reenvía su país (el backend no lo hereda).
 */
export function buildUpdateCustomerBody(initial: Customer, values: CustomerFormValues): UpdateCustomerRequest {
  const body: UpdateCustomerRequest = {};
  if (values.sourceChannel && values.sourceChannel !== initial.sourceChannel) body.sourceChannel = values.sourceChannel;

  for (const key of ["firstName", "lastName", "notes"] as const) {
    const next = orNull(values[key]);
    if (next !== (initial[key] ?? null)) body[key] = next;
  }

  // El backend guarda el correo en minúsculas: cambiar solo las mayúsculas no es un cambio.
  const email = orNull(values.email)?.toLowerCase() ?? null;
  if (email !== (initial.email?.toLowerCase() ?? null)) body.email = email;

  const phone = orNull(values.phone);
  if (phone === null) {
    // null borra también el país.
    if (initial.phone !== null) body.phone = null;
  } else {
    const country = isInternationalPhone(phone) ? null : values.phoneCountry || null;
    const countryChanged = !isInternationalPhone(phone) && country !== (initial.phoneCountry ?? null);
    if (phone !== initial.phone || countryChanged) {
      body.phone = phone;
      if (country) body.phoneCountry = country;
    }
  }
  return body;
}

/** El resumen del cliente (nombre, teléfono, correo) viaja en conversaciones, solicitudes y reservas. */
export function changesCustomerSummary(body: UpdateCustomerRequest): boolean {
  return "firstName" in body || "lastName" in body || "phone" in body || "email" in body;
}

/** POST /customers/:id/interests: la nota se omite si está vacía. */
export function buildInterestBody(commercialItemId: string, notes: string): CreateCustomerInterestRequest {
  const note = notes.trim();
  return note ? { commercialItemId, notes: note } : { commercialItemId };
}

// ---------------------------------------------------------------- errores del guardado

/**
 * Inicio del 400 al cambiar el canal de una identidad de Messenger o Instagram. bk-crm responde
 * «…de una identidad del proveedor» para los dos canales (antes decía «…de Messenger»): se compara solo
 * la parte común.
 */
export const PROVIDER_CHANNEL_ERROR = "No se puede cambiar el canal de una identidad";

export interface CustomerSaveErrors {
  fields: CustomerFormErrors;
  form: string | null;
  /** 409 por teléfono o correo de otro cliente: el dato con el que buscarlo. */
  duplicateOf: string | null;
  /** 400 de identidad de Messenger o Instagram: el selector vuelve al canal guardado del cliente. */
  resetChannel: boolean;
}

function withPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Lleva el error de un alta o una edición a su campo. Los mensajes de negocio llegan en español; los que
 * nombran un campo técnico (`phoneCountry`) se reescriben para la persona.
 */
export function customerSaveErrors(error: unknown, body: CreateCustomerRequest | UpdateCustomerRequest): CustomerSaveErrors {
  const result: CustomerSaveErrors = { fields: {}, form: null, duplicateOf: null, resetChannel: false };
  // `isValidationError` va primero: negado después de `instanceof`, el type guard dejaría `never`.
  if (!isValidationError(error) && error instanceof ApiError) {
    const message = error.messages.join(" ");
    if (error.status === 409 && message.startsWith("Ya existe un cliente")) {
      const text = withPeriod(message);
      if (body.phone) result.fields.phone = text;
      if (body.email) result.fields.email = text;
      if (!body.phone && !body.email) result.form = text;
      result.duplicateOf = body.email || body.phone || null;
      return result;
    }
    if (message.startsWith(PROVIDER_CHANNEL_ERROR)) {
      result.fields.sourceChannel = withPeriod(message);
      result.resetChannel = true;
      return result;
    }
    if (message.startsWith("phoneCountry debe ser un país ISO válido")) {
      result.fields.phoneCountry = "El servidor no reconoce ese país: elige otro.";
      return result;
    }
    if (message.startsWith("phoneCountry requiere un teléfono")) {
      result.fields.phoneCountry = "El país solo se indica junto con un teléfono.";
      return result;
    }
    if (message.startsWith("El teléfono")) {
      result.fields.phone = withPeriod(message);
      return result;
    }
    if (message.startsWith("Proporciona un email válido o un teléfono")) {
      result.fields.phone = "Hace falta un correo o un teléfono con su país (o con + y el código del país).";
      return result;
    }
  }
  const server = serverFormErrors(error, CUSTOMER_FIELDS);
  result.fields = server.fields;
  result.form = server.form;
  return result;
}
