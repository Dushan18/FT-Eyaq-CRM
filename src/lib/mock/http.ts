/**
 * Piezas comunes de las rutas del backend simulado: errores con el formato de bk-crm (GlobalExceptionFilter),
 * contexto de cada petición y validación de query y body con los mismos mensajes que class-validator.
 *
 * Orden de los mensajes de un campo: el inverso de la declaración de los decoradores, como class-validator
 * (p. ej. `x must be shorter than or equal to 100 characters` antes que `x must be a string`). Los
 * `property <campo> should not exist` van siempre primero.
 */
import type { RoleCode } from "@/lib/api/types";
import { MONEY_PATTERN } from "@/lib/api/types";
import type { MockStore, MockUser } from "./store";

// ---------------------------------------------------------------------------- errores y respuestas

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.message === "string" ? body.message : "HttpError");
  }
}

const REASONS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  503: "Service Unavailable",
};

export function fail(status: number, message: string | string[]): never {
  throw new HttpError(status, { message, error: REASONS[status] ?? "Error", statusCode: status });
}

/** Error sin `error` (como el 429 `Límite de generación de Samanta alcanzado`). */
export function failBare(status: number, message: string): never {
  throw new HttpError(status, { statusCode: status, message });
}

export function json(status: number, body: unknown): Response {
  return new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------- rutas

export interface Ctx {
  store: MockStore;
  user: MockUser | null;
  sessionId: string | null;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export type Access = "PUBLIC" | "AUTH" | readonly RoleCode[];

export interface Route {
  method: string;
  pattern: string;
  access: Access;
  handler: (ctx: Ctx) => Response;
}

export const READERS: RoleCode[] = ["ADMIN", "OWNER", "OPERATOR"];
export const WRITERS: RoleCode[] = ["ADMIN", "OPERATOR"];
export const ADMIN: RoleCode[] = ["ADMIN"];

// ---------------------------------------------------------------------------- utilidades

/** UUID de la ruta (`ParseUUIDPipe`): cualquier versión. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** UUID del body y de la query (`@IsUUID()`): versión 1 a 8 y variante RFC, o el UUID nulo o el máximo. */
const BODY_UUID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i;
export const ISO_INPUT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_INPUT_SOURCE = String.raw`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/`;
const MONEY_SOURCE = String.raw`/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/`;
export const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const CHANNELS = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE", "PHONE", "EMAIL", "OTHER"] as const;

export const lower = (v: string | null | undefined) => (v ?? "").toLocaleLowerCase("es");
export const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
export const isUuid = (v: unknown): v is string => typeof v === "string" && BODY_UUID_RE.test(v);

/** Instante ISO de entrada con una fecha que existe (sin 30 de febrero ni offsets fuera de rango). */
export function isRealInstant(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!m) return false;
  const [, y, mo, d, h, mi, s, oh, om] = m.map((x) => (x === undefined ? 0 : Number(x)));
  if (mo! < 1 || mo! > 12 || h! > 23 || mi! > 59 || s! > 59 || oh! > 23 || om! > 59) return false;
  const daysInMonth = new Date(Date.UTC(y!, mo!, 0)).getUTCDate();
  return d! >= 1 && d! <= daysInMonth && !Number.isNaN(Date.parse(value));
}

/** Nombre normalizado de bk-crm: sin tildes ni signos diacríticos (también los sueltos), en minúsculas y con espacios colapsados. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[´`^¨~˜¸·]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasRole(user: MockUser, roles: readonly RoleCode[]) {
  return user.roles.some((r) => roles.includes(r));
}

export function isEligibleAssignee(user: MockUser) {
  return user.isActive && hasRole(user, ["ADMIN", "OPERATOR"]);
}

export function paginate<T>(rows: T[], page: number, limit: number) {
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
  };
}

/** Coincidencia por campo, como el backend (no por nombre completo). */
export function customerMatches(c: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null }, term: string) {
  const t = lower(term);
  const d = digits(term);
  return (
    lower(c.firstName).includes(t) ||
    lower(c.lastName).includes(t) ||
    lower(c.email).includes(t) ||
    (c.phone ?? "").includes(term) ||
    (d.length > 0 && digits(c.phone).includes(d))
  );
}

// ---------------------------------------------------------------------------- query

/** Rechaza parámetros no declarados o repetidos. `page=` y `limit=` vacíos valen 0, como en bk-crm. */
export function readQuery(ctx: Ctx, allowed: readonly string[]) {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const [key, value] of ctx.query) {
    if (!allowed.includes(key)) errors.push(`property ${key} should not exist`);
    else if (seen.has(key)) errors.push(`${key} must be a single value`);
    else if (value.trim() === "" && key !== "page" && key !== "limit") errors.push(`${key} should not be empty`);
    seen.add(key);
  }
  if (errors.length) fail(400, errors);
}

function rangeMessages(key: string, raw: number, min: number, max: number): string[] {
  if (typeof raw !== "number" || Number.isNaN(raw)) {
    return [`${key} must not be greater than ${max}`, `${key} must not be less than ${min}`, `${key} must be an integer number`];
  }
  const out: string[] = [];
  if (!(raw <= max)) out.push(`${key} must not be greater than ${max}`);
  if (!(raw >= min)) out.push(`${key} must not be less than ${min}`);
  if (!Number.isInteger(raw)) out.push(`${key} must be an integer number`);
  return out;
}

export function pageParams(ctx: Ctx, defaultLimit: number) {
  const page = ctx.query.has("page") ? Number(ctx.query.get("page")) : 1;
  const limit = ctx.query.has("limit") ? Number(ctx.query.get("limit")) : defaultLimit;
  const errors = [...rangeMessages("page", page, 1, 1_000_000), ...rangeMessages("limit", limit, 1, 100)];
  if (errors.length) fail(400, errors);
  return { page, limit };
}

export function boolParam(ctx: Ctx, key: string): boolean | undefined {
  const v = ctx.query.get(key);
  if (v === null) return undefined;
  if (v !== "true" && v !== "false") fail(400, [`${key} must be a boolean value`]);
  return v === "true";
}

export function enumParam<T extends string>(ctx: Ctx, key: string, values: readonly T[]): T | undefined {
  const v = ctx.query.get(key);
  if (v === null) return undefined;
  if (!values.includes(v as T)) fail(400, [`${key} must be one of the following values: ${values.join(", ")}`]);
  return v as T;
}

export function uuidParam(ctx: Ctx, key: string): string | undefined {
  const v = ctx.query.get(key);
  if (v === null) return undefined;
  if (!isUuid(v)) fail(400, [`${key} must be a UUID`]);
  return v;
}

export function dateRange(ctx: Ctx) {
  const from = ctx.query.get("dateFrom");
  const to = ctx.query.get("dateTo");
  for (const [key, v] of [["dateFrom", from], ["dateTo", to]] as const) {
    if (v !== null && (!ISO_INPUT_RE.test(v) || Number.isNaN(Date.parse(v)))) fail(400, [`${key} must be a valid ISO 8601 date string`]);
  }
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;
  if (fromMs !== null && toMs !== null && fromMs >= toMs) fail(400, "dateFrom debe ser anterior a dateTo y las fechas deben ser válidas");
  return { fromMs, toMs };
}

export function searchParam(ctx: Ctx): string | undefined {
  const v = ctx.query.get("search");
  if (v === null) return undefined;
  const t = v.trim();
  if (t.length < 1 || t.length > 200) fail(400, ["search must be shorter than or equal to 200 characters"]);
  return t;
}

/** Validación mínima de las rutas de sesión (login, refresh…): campos no declarados y obligatorios. */
export function requireBodyKeys(ctx: Ctx, allowed: readonly string[], required: readonly string[] = []) {
  const errors: string[] = [];
  for (const key of Object.keys(ctx.body)) if (!allowed.includes(key)) errors.push(`property ${key} should not exist`);
  for (const key of required) if (!(key in ctx.body)) errors.push(`${key} should not be empty`);
  if (errors.length) fail(400, errors);
}

// ---------------------------------------------------------------------------- body (class-validator)

interface FieldOpts {
  /** Sin @IsOptional: falta o null dan todos los mensajes del campo. */
  required?: boolean;
  /** null llega al servicio (borra en un PATCH). Por defecto true en los opcionales. */
  nullable?: boolean;
}

/** Ausente (undefined), null aceptado o valor validado. */
type Out<T> = T | null | undefined;

/**
 * Acumula los errores de validación de un body. Cada método devuelve el valor ya transformado (trim,
 * minúsculas, importe con 2 decimales…) o undefined si falta o no es válido. `done()` lanza el 400.
 */
export class BodyCheck {
  private readonly unknown: string[] = [];
  private readonly errors: string[] = [];
  private readonly children: BodyCheck[] = [];

  constructor(private readonly prefix = "") {}

  /** Nueva comprobación de un hijo (`variants.0.`), que vuelca sus errores en esta. */
  child(prefix: string): BodyCheck {
    const c = new BodyCheck(`${this.prefix}${prefix}`);
    this.children.push(c);
    return c;
  }

  add(...messages: string[]) {
    for (const m of messages) this.errors.push(`${this.prefix}${m}`);
  }

  /** `property <campo> should not exist` por cada clave no declarada. */
  only(body: Record<string, unknown>, allowed: readonly string[]) {
    for (const key of Object.keys(body)) if (!allowed.includes(key)) this.unknown.push(`${this.prefix}property ${key} should not exist`);
  }

  messages(): { unknown: string[]; errors: string[] } {
    const unknown = [...this.unknown];
    const errors = [...this.errors];
    for (const c of this.children) {
      const sub = c.messages();
      unknown.push(...sub.unknown);
      errors.push(...sub.errors);
    }
    return { unknown, errors };
  }

  done() {
    const { unknown, errors } = this.messages();
    if (unknown.length || errors.length) fail(400, [...unknown, ...errors]);
  }

  private missing(value: unknown, opts: FieldOpts): "skip" | "null" | "check" {
    if (value === undefined) return opts.required ? "check" : "skip";
    if (value === null) return opts.required || opts.nullable === false ? "check" : "null";
    return "check";
  }

  /** Texto con trim de 1 a `max` (decoradores @Transform(trim) @IsString @IsNotEmpty @MaxLength). */
  text(key: string, value: unknown, max: number, opts: FieldOpts = {}): Out<string> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    const tooLong = `${key} must be shorter than or equal to ${max} characters`;
    if (value === undefined || value === null) {
      this.add(tooLong, `${key} should not be empty`, `${key} must be a string`);
      return undefined;
    }
    if (typeof value !== "string") {
      this.add(tooLong, `${key} must be a string`);
      return undefined;
    }
    const t = value.trim();
    if (!t) this.add(`${key} should not be empty`);
    else if (t.length > max) this.add(tooLong);
    else return t;
    return undefined;
  }

  enumOf<T extends string>(key: string, value: unknown, values: readonly T[], opts: FieldOpts = {}): Out<T> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
    this.add(`${key} must be one of the following values: ${values.join(", ")}`);
    return undefined;
  }

  uuid(key: string, value: unknown, opts: FieldOpts = {}): Out<string> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    if (isUuid(value)) return value.toLowerCase();
    this.add(`${key} must be a UUID`);
    return undefined;
  }

  bool(key: string, value: unknown, opts: FieldOpts = {}): Out<boolean> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    if (typeof value === "boolean") return value;
    this.add(`${key} must be a boolean value`);
    return undefined;
  }

  /** Entero JSON en [min, max]. `coerce` aplica Number() a los textos ("10" → 10, "" → 0), como `@Type(() => Number)`. */
  int(key: string, value: unknown, min: number, max: number, opts: FieldOpts & { coerce?: boolean } = {}): Out<number> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    const n = opts.coerce && typeof value === "string" ? Number(value) : value;
    const msgs = rangeMessages(key, typeof n === "number" ? n : Number.NaN, min, max);
    if (msgs.length) {
      this.add(...msgs);
      return undefined;
    }
    return n as number;
  }

  /** Instante con segundos y zona (Partes 03 y 04): `must match`, `must be a valid ISO 8601 date string`, `must be a string`. */
  instant(key: string, value: unknown, opts: FieldOpts = {}): Out<string> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    const match = `${key} must match ${ISO_INPUT_SOURCE} regular expression`;
    const valid = `${key} must be a valid ISO 8601 date string`;
    if (typeof value !== "string") {
      this.add(match, valid, `${key} must be a string`);
      return undefined;
    }
    if (!ISO_INPUT_RE.test(value)) this.add(match);
    else if (!isRealInstant(value)) this.add(valid);
    else return new Date(Date.parse(value)).toISOString();
    return undefined;
  }

  /** Instante de los detalles del catálogo (Parte 02), con sus mensajes propios. */
  catalogInstant(key: string, value: unknown): Out<string> {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") {
      this.add(`${key} debe ser una fecha ISO 8601 válida`);
      return undefined;
    }
    const t = value.trim();
    if (!ISO_INPUT_RE.test(t)) this.add(`${key} debe incluir segundos y zona horaria (Z o ±HH:mm)`);
    else if (!isRealInstant(t)) this.add(`${key} debe ser una fecha ISO 8601 válida`);
    else return new Date(Date.parse(t)).toISOString();
    return undefined;
  }

  /** Importe de solicitudes (Parte 03): texto con MONEY_PATTERN, sin trim. Vuelve con 2 decimales. */
  money(key: string, value: unknown, opts: FieldOpts = {}): Out<string> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    const match = `${key} must match ${MONEY_SOURCE} regular expression`;
    if (typeof value !== "string") {
      this.add(match, `${key} must be a string`);
      return undefined;
    }
    if (!MONEY_PATTERN.test(value)) {
      this.add(match);
      return undefined;
    }
    return Number(value).toFixed(2);
  }

  /** Importe del catálogo (Parte 02): con trim y su mensaje propio. Vuelve con 2 decimales. */
  catalogMoney(key: string, value: unknown, opts: FieldOpts = {}): Out<string> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    const custom = `${key} debe ser una cadena decimal no negativa con máximo dos decimales`;
    if (typeof value !== "string") {
      this.add(custom, `${key} must be a string`);
      return undefined;
    }
    const t = value.trim();
    if (!MONEY_PATTERN.test(t)) {
      this.add(custom);
      return undefined;
    }
    return Number(t).toFixed(2);
  }

  /** Email con trim y minúsculas antes de validar (clientes). */
  email(key: string, value: unknown, opts: FieldOpts = {}): Out<string> {
    const state = this.missing(value, opts);
    if (state === "skip") return undefined;
    if (state === "null") return null;
    const tooLong = `${key} must be shorter than or equal to 320 characters`;
    if (typeof value !== "string") {
      this.add(`${key} must be an email`, tooLong);
      return undefined;
    }
    const t = value.trim().toLowerCase();
    const msgs: string[] = [];
    if (!isEmail(t)) msgs.push(`${key} must be an email`);
    if (t.length > 320) msgs.push(tooLong);
    if (msgs.length) {
      this.add(...msgs);
      return undefined;
    }
    return t;
  }
}

/** Aproximación de `@IsEmail()` de class-validator: sin espacios, local ≤ 64, total ≤ 254 y dominio con TLD. */
export function isEmail(value: string): boolean {
  if (value.length > 254 || /\s/.test(value)) return false;
  const at = value.lastIndexOf("@");
  if (at < 1 || at > 64) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return (
    labels.length >= 2 &&
    labels.every((l) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l)) &&
    /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]!)
  );
}

/** Al menos un campo en un PATCH (`null` cuenta). */
export function requireSomeField(body: Record<string, unknown>, message: string) {
  if (Object.keys(body).length === 0) fail(400, message);
}
