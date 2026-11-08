/**
 * Clasificación de errores de bk-crm y del BFF para la UI.
 * Los mensajes de negocio llegan en español y se muestran tal cual. Los de validación
 * (class-validator) llegan en inglés: aquí se agrupan por campo y se traducen.
 * Ver docs/frontend-api-completo.md (Parte 05, §4).
 */
import { ApiError } from "./client";
import type { ApiErrorBody } from "./types";

/** El navegador no llegó al BFF, o el BFF no llegó a bk-crm: es un problema de conexión, no de datos. */
export function isConnectionError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 502 || error.code === "BACKEND_UNAVAILABLE");
}

/** bk-crm respondió 503 sin `code`: algo está apagado en el servidor (WhatsApp, Messenger, Samanta…). */
export function isDisabledInServer(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && error.code === undefined;
}

/** 400 de validación de DTO: el body traía `message` como array. */
export function isValidationError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 400 && Array.isArray((error.body as ApiErrorBody | null)?.message);
}

export interface FieldErrors {
  /** Textos en español por ruta del campo: "email", "roles", "schedules.0", "schedules.0.openTime"… */
  fields: Record<string, string[]>;
  /** Mensajes sin campo. «property x should not exist» indica un body mal armado por el frontend. */
  other: string[];
}

const PATH_SEGMENT = /^(?:\d+|[a-z][A-Za-z0-9]*)$/;

/** Separa la ruta del campo del resto del mensaje; null si el mensaje no empieza por un campo. */
export function splitValidationMessage(message: string): { path: string; rest: string } | null {
  if (/(?:^|\.)property \S+ should not exist$/.test(message)) return null;
  const each = /^(?:(\S+)\.)?each value in (?:nested property )?(\w+) (.+)$/.exec(message);
  if (each) return { path: each[1] ?? each[2]!, rest: each[3]! };
  const unique = /^All (\w+)'s elements must be unique$/.exec(message);
  if (unique) return { path: unique[1]!, rest: "must be unique" };
  const path: string[] = [];
  for (const segment of message.split(" ", 1)[0]!.split(".")) {
    if (!PATH_SEGMENT.test(segment)) break;
    path.push(segment);
  }
  if (path.length === 0) return null;
  const joined = path.join(".");
  return { path: joined, rest: message.slice(joined.length).replace(/^[.\s]+/, "") };
}

const RULES: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^should not be (?:empty|null or undefined)$/, () => "Completa este campo."],
  [/^must match \/\\S\/ regular expression$/, () => "Completa este campo."],
  [/^must be an email$/, () => "Escribe un correo válido."],
  [/^must be longer than or equal to (\d+) characters$/, (m) => (m[1] === "1" ? "Completa este campo." : `Escribe al menos ${m[1]} caracteres.`)],
  [/^must be shorter than or equal to (\d+) characters$/, (m) => `Escribe como máximo ${m[1]} caracteres.`],
  [/^must not be less than (-?[\d.]+)$/, (m) => `El valor mínimo es ${m[1]}.`],
  [/^must not be greater than (-?[\d.]+)$/, (m) => `El valor máximo es ${m[1]}.`],
  [/^must contain at least (\d+) elements$/, (m) => (m[1] === "1" ? "Elige al menos una opción." : `Elige al menos ${m[1]}.`)],
  [/^must contain no more than (\d+) elements$/, (m) => `Elige como máximo ${m[1]}.`],
  [/^must be unique$/, () => "No repitas valores."],
  [/^must be one of the following values: /, () => "Elige una opción de la lista."],
  [/^must be a UUID$/, () => "Elige una opción de la lista."],
  [/^must be a valid ISO 8601 date string$/, () => "La fecha no es válida."],
  [/^must match .+ regular expression$/, () => "El formato no es válido."],
  [/^must be an integer number$/, () => "Escribe un número entero."],
  [/^must be a number conforming to the specified constraints$/, () => "Escribe un número válido."],
  [/^must be a URL address$/, () => "Escribe una dirección que empiece por http:// o https://."],
];

/** Texto en español para el resto de un mensaje de validación (sin la ruta del campo). */
export function validationText(rest: string): string {
  for (const [pattern, text] of RULES) {
    const match = pattern.exec(rest);
    if (match) return text(match);
  }
  // Una regla en inglés sin traducir, o un mensaje propio de bk-crm, que ya está en español.
  if (/^(?:must|should)\b/.test(rest)) return "Revisa este campo.";
  const sentence = rest.charAt(0).toLocaleUpperCase("es") + rest.slice(1);
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** Agrupa por campo los mensajes de un 400 de validación, ya en español. */
export function fieldErrors(messages: readonly string[]): FieldErrors {
  const fields: Record<string, string[]> = {};
  const other: string[] = [];
  for (const message of messages) {
    const parsed = splitValidationMessage(message);
    if (!parsed) {
      other.push(message);
      continue;
    }
    const text = validationText(parsed.rest);
    const list = (fields[parsed.path] ??= []);
    if (!list.includes(text)) list.push(text);
  }
  return { fields, other };
}
