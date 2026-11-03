/**
 * Backend simulado (modo mock): implementa el mismo contrato HTTP que bk-crm (rutas, roles, filtros,
 * paginación, validación de propiedades no declaradas y reglas de negocio) sobre el estado en memoria.
 * Referencia: docs/backend/*.md. No inventa endpoints que bk-crm no tenga.
 */
import type {
  CommercialItem,
  Conversation,
  CustomerDetail,
  Message,
  ReservationDetail,
  ReservationRequest,
  ReservationStatus,
  Reservation,
  RestaurantConfig,
  RoleCode,
} from "@/lib/api/types";
import { RESERVATION_STATUS_TRANSITIONS } from "@/lib/api/types";
import { buildSeed } from "./seed";
import { getStore, iso, uuid, type MockConversation, type MockCustomer, type MockRequest, type MockReservation, type MockStore, type MockUser } from "./store";

export interface MockRequestInput {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  body: string | null;
}

const ACCESS_TTL_S = 15 * 60;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INPUT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function mockStore(): MockStore {
  return getStore(() => buildSeed());
}

function mockPassword(): string {
  return process.env.CRM_MOCK_PASSWORD?.trim() || "demo1234";
}

// ---------------------------------------------------------------------------- respuestas

class HttpError extends Error {
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

function fail(status: number, message: string | string[]): never {
  throw new HttpError(status, { message, error: REASONS[status] ?? "Error", statusCode: status });
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------- tokens simulados

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeToken(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.mock`;
}

function readToken(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[2] !== "mock") return null;
  try {
    return JSON.parse(Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function issueTokens(user: MockUser, session: { id: string; refreshJti: string; expiresAt: number }) {
  const nowS = Math.floor(Date.now() / 1000);
  return {
    accessToken: makeToken({ sub: user.id, sessionId: session.id, email: user.email, roles: user.roles, iat: nowS, exp: nowS + ACCESS_TTL_S }),
    refreshToken: makeToken({ sub: user.id, sessionId: session.id, jti: session.refreshJti, iat: nowS, exp: Math.floor(session.expiresAt / 1000) }),
  };
}

// ---------------------------------------------------------------------------- utilidades

const lower = (v: string | null | undefined) => (v ?? "").toLocaleLowerCase("es");
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

function hasRole(user: MockUser, roles: readonly RoleCode[]) {
  return user.roles.some((r) => roles.includes(r));
}

function isEligibleAssignee(user: MockUser) {
  return user.isActive && hasRole(user, ["ADMIN", "OPERATOR"]);
}

function publicUser(u: MockUser) {
  const { password: _password, ...rest } = u;
  void _password;
  return rest;
}

function paginate<T>(rows: T[], page: number, limit: number) {
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
  };
}

/** Coincidencia por campo, como el backend (no por nombre completo). */
function customerMatches(c: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null }, term: string) {
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

interface Ctx {
  store: MockStore;
  user: MockUser | null;
  sessionId: string | null;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------- validación de query/body

function readQuery(ctx: Ctx, allowed: readonly string[]) {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const [key, value] of ctx.query) {
    if (!allowed.includes(key)) errors.push(`property ${key} should not exist`);
    else if (seen.has(key)) errors.push(`${key} must be a single value`);
    else if (value.trim() === "") errors.push(`${key} should not be empty`);
    seen.add(key);
  }
  if (errors.length) fail(400, errors);
}

function pageParams(ctx: Ctx, defaultLimit: number) {
  const page = ctx.query.has("page") ? Number(ctx.query.get("page")) : 1;
  const limit = ctx.query.has("limit") ? Number(ctx.query.get("limit")) : defaultLimit;
  const errors: string[] = [];
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) errors.push("page must not be less than 1");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) errors.push("limit must not be greater than 100");
  if (errors.length) fail(400, errors);
  return { page, limit };
}

function boolParam(ctx: Ctx, key: string): boolean | undefined {
  const v = ctx.query.get(key);
  if (v === null) return undefined;
  if (v !== "true" && v !== "false") fail(400, [`${key} must be a boolean value`]);
  return v === "true";
}

function enumParam<T extends string>(ctx: Ctx, key: string, values: readonly T[]): T | undefined {
  const v = ctx.query.get(key);
  if (v === null) return undefined;
  if (!values.includes(v as T)) fail(400, [`${key} must be one of the following values: ${values.join(", ")}`]);
  return v as T;
}

function uuidParam(ctx: Ctx, key: string): string | undefined {
  const v = ctx.query.get(key);
  if (v === null) return undefined;
  if (!UUID_RE.test(v)) fail(400, [`${key} must be a UUID`]);
  return v;
}

function dateRange(ctx: Ctx) {
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

function searchParam(ctx: Ctx): string | undefined {
  const v = ctx.query.get("search");
  if (v === null) return undefined;
  const t = v.trim();
  if (t.length < 1 || t.length > 200) fail(400, ["search must be shorter than or equal to 200 characters"]);
  return t;
}

function requireBodyKeys(ctx: Ctx, allowed: readonly string[], required: readonly string[] = []) {
  const errors: string[] = [];
  for (const key of Object.keys(ctx.body)) if (!allowed.includes(key)) errors.push(`property ${key} should not exist`);
  for (const key of required) if (!(key in ctx.body)) errors.push(`${key} should not be empty`);
  if (errors.length) fail(400, errors);
}

// ---------------------------------------------------------------------------- proyecciones (mismas formas que bk-crm)

function customerSummary(c: MockCustomer) {
  return { id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email };
}

function itemSummary(i: CommercialItem | undefined) {
  return i ? { id: i.id, nameEs: i.nameEs, nameEn: i.nameEn, type: i.type, isActive: i.isActive, approvalStatus: i.approvalStatus } : null;
}

function assigneeEmbed(store: MockStore, id: string | null) {
  if (!id) return null;
  const u = store.users.find((x) => x.id === id);
  return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, isActive: u.isActive, isEligible: isEligibleAssignee(u) } : null;
}

function findCustomer(store: MockStore, id: string) {
  return store.customers.find((c) => c.id === id)!;
}

function conversationOut(store: MockStore, conv: MockConversation): Conversation {
  const unreadCount = store.messages.filter((m) => m.conversationId === conv.id && m.direction === "INBOUND" && m.readAt === null).length;
  return { ...conv, customer: customerSummary(findCustomer(store, conv.customerId)), assignedUser: assigneeEmbed(store, conv.assignedUserId), unreadCount };
}

function requestOut(store: MockStore, r: MockRequest): ReservationRequest {
  return {
    ...r,
    customer: customerSummary(findCustomer(store, r.customerId)),
    commercialItem: itemSummary(store.items.find((i) => i.id === r.commercialItemId)),
  };
}

function reservationOut(store: MockStore, r: MockReservation): Reservation {
  const { noteHistory: _n, rescheduleHistory: _h, ...base } = r;
  void _n;
  void _h;
  return {
    ...base,
    assignedUser: assigneeEmbed(store, r.assignedUserId),
    customer: customerSummary(findCustomer(store, r.customerId)),
    commercialItem: itemSummary(store.items.find((i) => i.id === r.commercialItemId)),
  };
}

function author(store: MockStore, id: string) {
  const u = store.users.find((x) => x.id === id);
  return { id, firstName: u?.firstName ?? "", lastName: u?.lastName ?? "" };
}

function reservationDetailOut(store: MockStore, r: MockReservation): ReservationDetail {
  return {
    ...reservationOut(store, r),
    noteHistory: r.noteHistory.map((n) => ({ ...n, author: author(store, n.authorUserId) })),
    rescheduleHistory: r.rescheduleHistory.map((h) => ({ ...h, changedBy: author(store, h.changedByUserId) })),
  };
}

function customerDetailOut(store: MockStore, c: MockCustomer): CustomerDetail {
  const { interests, ...base } = c;
  return {
    ...base,
    interests: [...interests]
      .sort((a, b) => b.lastInterestedAt.localeCompare(a.lastInterestedAt))
      .map(({ commercialItemId, ...i }) => ({ ...i, commercialItem: itemSummary(store.items.find((x) => x.id === commercialItemId))! })),
  };
}

function customerOut(c: MockCustomer) {
  const { interests: _i, ...base } = c;
  void _i;
  return base;
}

// ---------------------------------------------------------------------------- rutas

type Access = "PUBLIC" | "AUTH" | readonly RoleCode[];

interface Route {
  method: string;
  pattern: string;
  access: Access;
  handler: (ctx: Ctx) => Response;
}

const READERS: RoleCode[] = ["ADMIN", "OWNER", "OPERATOR"];
const WRITERS: RoleCode[] = ["ADMIN", "OPERATOR"];
const ADMIN: RoleCode[] = ["ADMIN"];

function getConversation(ctx: Ctx) {
  const conv = ctx.store.conversations.find((c) => c.id === ctx.params.id);
  if (!conv) fail(404, "Conversación no encontrada");
  return conv;
}

function getReservation(ctx: Ctx) {
  const r = ctx.store.reservations.find((x) => x.id === ctx.params.id);
  if (!r) fail(404, "Reserva no encontrada");
  return r;
}

function touchConversation(conv: MockConversation, at: number) {
  conv.lastMessageAt = iso(at);
  conv.updatedAt = iso(at);
}

const ROUTES: Route[] = [
  // ------------------------------------------------------------------ auth
  {
    method: "POST",
    pattern: "/auth/login",
    access: "PUBLIC",
    handler: (ctx) => {
      requireBodyKeys(ctx, ["email", "password"], ["email", "password"]);
      const email = lower(String(ctx.body.email ?? "")).trim();
      const password = String(ctx.body.password ?? "");
      if (password.length < 8) fail(400, ["password must be longer than or equal to 8 characters"]);
      const user = ctx.store.users.find((u) => u.email === email);
      if (!user || !user.isActive || password !== mockPassword()) fail(401, "Correo o contraseña incorrectos");
      const session = { id: uuid(), userId: user.id, refreshJti: uuid(), revoked: false, expiresAt: Date.now() + SESSION_TTL_MS };
      ctx.store.sessions.push(session);
      user.lastLoginAt = iso(Date.now());
      return json(201, {
        ...issueTokens(user, session),
        user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, roles: user.roles },
      });
    },
  },
  {
    method: "POST",
    pattern: "/auth/refresh",
    access: "PUBLIC",
    handler: (ctx) => {
      requireBodyKeys(ctx, ["refreshToken"], ["refreshToken"]);
      const payload = readToken(String(ctx.body.refreshToken));
      if (!payload || typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) fail(401, "Refresh token inválido o expirado");
      const session = ctx.store.sessions.find((s) => s.id === payload.sessionId && s.userId === payload.sub);
      if (!session) fail(401, "Sesión no válida");
      if (session.revoked) fail(401, "Sesión revocada");
      if (session.expiresAt < Date.now()) fail(401, "Sesión expirada");
      if (session.refreshJti !== payload.jti) fail(401, "Refresh token inválido");
      const user = ctx.store.users.find((u) => u.id === session.userId);
      if (!user || !user.isActive) fail(401, "Usuario no autorizado");
      session.refreshJti = uuid();
      return json(201, issueTokens(user, session));
    },
  },
  {
    method: "GET",
    pattern: "/auth/me",
    access: "AUTH",
    handler: (ctx) => {
      const u = ctx.user!;
      return json(200, { id: u.id, sessionId: ctx.sessionId, firstName: u.firstName, lastName: u.lastName, email: u.email, roles: u.roles });
    },
  },
  {
    method: "POST",
    pattern: "/auth/logout",
    access: "AUTH",
    handler: (ctx) => {
      const s = ctx.store.sessions.find((x) => x.id === ctx.sessionId);
      if (s) s.revoked = true;
      return json(201, { message: "Sesión cerrada correctamente" });
    },
  },
  {
    method: "POST",
    pattern: "/auth/forgot-password",
    access: "PUBLIC",
    handler: (ctx) => {
      requireBodyKeys(ctx, ["email"], ["email"]);
      return json(200, { message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña" });
    },
  },
  {
    method: "POST",
    pattern: "/auth/reset-password",
    access: "PUBLIC",
    handler: (ctx) => {
      requireBodyKeys(ctx, ["token", "newPassword"], ["token", "newPassword"]);
      if (!/^[a-f0-9]{64}$/i.test(String(ctx.body.token))) fail(400, ["El token de recuperación no tiene un formato válido"]);
      return json(200, { message: "Contraseña restablecida correctamente" });
    },
  },

  // ------------------------------------------------------------------ usuarios
  {
    method: "GET",
    pattern: "/users",
    access: ADMIN,
    handler: (ctx) => json(200, [...ctx.store.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicUser)),
  },
  {
    method: "POST",
    pattern: "/users",
    access: ADMIN,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["firstName", "lastName", "email", "password", "roles"], ["firstName", "lastName", "email", "password", "roles"]);
      const email = lower(String(ctx.body.email)).trim();
      const roles = ctx.body.roles as RoleCode[];
      if (!Array.isArray(roles) || roles.length === 0) fail(400, "Debes asignar al menos un rol");
      if (String(ctx.body.password).length < 8) fail(400, ["password must be longer than or equal to 8 characters"]);
      if (ctx.store.users.some((u) => u.email === email)) fail(409, "Ya existe un usuario registrado con este correo");
      const now = iso(Date.now());
      const user: MockUser = {
        id: uuid(),
        firstName: String(ctx.body.firstName).trim(),
        lastName: String(ctx.body.lastName).trim(),
        email,
        isActive: true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
        roles,
        password: "",
      };
      ctx.store.users.push(user);
      return json(201, publicUser(user));
    },
  },
  {
    method: "PATCH",
    pattern: "/users/:id/status",
    access: ADMIN,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["isActive"], ["isActive"]);
      if (typeof ctx.body.isActive !== "boolean") fail(400, ["isActive must be a boolean value"]);
      const user = ctx.store.users.find((u) => u.id === ctx.params.id);
      if (!user) fail(404, "Usuario no encontrado");
      if (!ctx.body.isActive && user.roles.includes("ADMIN")) {
        const otherAdmins = ctx.store.users.filter((u) => u.id !== user.id && u.isActive && u.roles.includes("ADMIN"));
        if (otherAdmins.length === 0) fail(409, "No se puede desactivar al último administrador activo");
      }
      user.isActive = ctx.body.isActive;
      user.updatedAt = iso(Date.now());
      if (!user.isActive) ctx.store.sessions.filter((s) => s.userId === user.id).forEach((s) => (s.revoked = true));
      return json(200, publicUser(user));
    },
  },
  {
    method: "PATCH",
    pattern: "/users/:id/roles",
    access: ADMIN,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["roles"], ["roles"]);
      const roles = ctx.body.roles as RoleCode[];
      if (!Array.isArray(roles) || roles.length === 0) fail(400, ["roles must contain at least 1 elements"]);
      const user = ctx.store.users.find((u) => u.id === ctx.params.id);
      if (!user) fail(404, "Usuario no encontrado");
      if (user.roles.includes("ADMIN") && !roles.includes("ADMIN")) {
        const otherAdmins = ctx.store.users.filter((u) => u.id !== user.id && u.isActive && u.roles.includes("ADMIN"));
        if (otherAdmins.length === 0) fail(409, "No se puede retirar el rol al último administrador activo");
      }
      user.roles = roles;
      user.updatedAt = iso(Date.now());
      return json(200, publicUser(user));
    },
  },

  // ------------------------------------------------------------------ configuración
  {
    method: "GET",
    pattern: "/restaurant-config",
    access: READERS,
    handler: (ctx) => {
      if (!ctx.store.config) fail(404, "Configuración del restaurante no encontrada");
      return json(200, ctx.store.config);
    },
  },
  {
    method: "PUT",
    pattern: "/restaurant-config",
    access: ADMIN,
    handler: (ctx) => {
      const keys = [
        "businessName", "logoUrl", "description", "address", "latitude", "longitude", "whatsappNumber", "email", "website",
        "currency", "timeZone", "reservationPolicy", "cancellationPolicy", "responseTimeoutMinutes", "approvalResponsibleId",
        "languages", "schedules",
      ];
      requireBodyKeys(ctx, keys, ["businessName", "address", "whatsappNumber", "email", "currency", "timeZone", "reservationPolicy", "cancellationPolicy", "responseTimeoutMinutes", "languages", "schedules"]);
      const b = ctx.body as Record<string, unknown>;
      const errors: string[] = [];
      if (!/^\+[1-9]\d{7,14}$/.test(String(b.whatsappNumber))) errors.push("whatsappNumber debe usar formato internacional E.164");
      if (!["PEN", "USD"].includes(String(b.currency))) errors.push("currency must be one of the following values: PEN, USD");
      const timeout = Number(b.responseTimeoutMinutes);
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > 1440) errors.push("responseTimeoutMinutes must not be greater than 1440");
      const schedules = Array.isArray(b.schedules) ? (b.schedules as Array<Record<string, unknown>>) : [];
      if (schedules.length !== 7 || new Set(schedules.map((s) => s.dayOfWeek)).size !== 7) {
        errors.push("schedules debe contener exactamente una entrada para cada día de la semana");
      }
      schedules.forEach((s, i) => {
        if (s.isOpen) {
          const okFormat = [s.openTime, s.closeTime].every((t) => typeof t === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t));
          if (!okFormat || String(s.openTime) >= String(s.closeTime)) {
            errors.push(`schedules.${i}.isOpen Un día abierto requiere openTime y closeTime en formato HH:mm, con apertura anterior al cierre; un día cerrado no admite horas`);
          }
        } else if (s.openTime || s.closeTime) {
          errors.push(`schedules.${i}.isOpen Un día abierto requiere openTime y closeTime en formato HH:mm, con apertura anterior al cierre; un día cerrado no admite horas`);
        }
      });
      for (const key of ["logoUrl", "website"]) {
        const v = b[key];
        if (v !== null && v !== undefined && !/^https?:\/\/[^\s/]+\.[^\s/]+/.test(String(v))) errors.push(`${key} must be a URL address`);
      }
      if (errors.length) fail(400, errors);
      let responsible: RestaurantConfig["approvalResponsible"] = null;
      if (b.approvalResponsibleId) {
        const u = ctx.store.users.find((x) => x.id === b.approvalResponsibleId);
        if (!u) fail(400, "El responsable de aprobación no existe");
        if (!u.isActive) fail(400, "El responsable de aprobación debe estar activo");
        if (!u.roles.includes("OWNER")) fail(400, "El responsable de aprobación debe tener el rol OWNER");
        responsible = { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email };
      }
      const order = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
      const now = iso(Date.now());
      const config: RestaurantConfig = {
        id: ctx.store.config?.id ?? uuid(),
        businessName: String(b.businessName).trim(),
        logoUrl: (b.logoUrl as string | null) ?? null,
        description: (b.description as string | null) ?? null,
        address: String(b.address).trim(),
        latitude: (b.latitude as number | null) ?? null,
        longitude: (b.longitude as number | null) ?? null,
        whatsappNumber: String(b.whatsappNumber),
        email: lower(String(b.email)).trim(),
        website: (b.website as string | null) ?? null,
        currency: b.currency as RestaurantConfig["currency"],
        timeZone: String(b.timeZone),
        reservationPolicy: String(b.reservationPolicy),
        cancellationPolicy: String(b.cancellationPolicy),
        responseTimeoutMinutes: timeout,
        approvalResponsibleId: responsible?.id ?? null,
        approvalResponsible: responsible,
        languages: ["ES", "EN", "PT"].filter((l) => (b.languages as string[]).includes(l)) as RestaurantConfig["languages"],
        schedules: [...schedules]
          .sort((x, y) => order.indexOf(String(x.dayOfWeek)) - order.indexOf(String(y.dayOfWeek)))
          .map((s) => ({
            dayOfWeek: s.dayOfWeek as RestaurantConfig["schedules"][number]["dayOfWeek"],
            isOpen: Boolean(s.isOpen),
            openTime: s.isOpen ? String(s.openTime) : null,
            closeTime: s.isOpen ? String(s.closeTime) : null,
          })),
        createdAt: ctx.store.config?.createdAt ?? now,
        updatedAt: now,
      };
      ctx.store.config = config;
      return json(200, config);
    },
  },

  // ------------------------------------------------------------------ catálogo
  {
    method: "GET",
    pattern: "/commercial-categories",
    access: READERS,
    handler: (ctx) => json(200, [...ctx.store.categories].sort((a, b) => a.displayOrder - b.displayOrder)),
  },
  {
    method: "GET",
    pattern: "/commercial-items",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "type", "approvalStatus", "isActive", "categoryId", "search", "sort", "order"]);
      const { page, limit } = pageParams(ctx, 20);
      const type = enumParam(ctx, "type", ["DISH", "BEVERAGE", "SERVICE", "PROMOTION", "EVENT"] as const);
      const approval = enumParam(ctx, "approvalStatus", ["DRAFT", "APPROVED", "REJECTED"] as const);
      const isActive = boolParam(ctx, "isActive");
      const categoryId = uuidParam(ctx, "categoryId");
      const search = searchParam(ctx);
      const sort = enumParam(ctx, "sort", ["category", "name", "createdAt"] as const) ?? "createdAt";
      const order = enumParam(ctx, "order", ["asc", "desc"] as const) ?? "desc";
      let rows = ctx.store.items.filter(
        (i) =>
          (!type || i.type === type) &&
          (!approval || i.approvalStatus === approval) &&
          (isActive === undefined || i.isActive === isActive) &&
          (!categoryId || i.categoryId === categoryId) &&
          (!search || [i.nameEs, i.nameEn, i.descriptionEs, i.descriptionEn].some((f) => lower(f).includes(lower(search)))),
      );
      const dir = order === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        if (sort === "category") return dir * (a.category.displayOrder - b.category.displayOrder || a.displayOrder - b.displayOrder || lower(a.nameEs).localeCompare(lower(b.nameEs)));
        if (sort === "name") return dir * lower(a.nameEs ?? a.nameEn).localeCompare(lower(b.nameEs ?? b.nameEn));
        return dir * a.createdAt.localeCompare(b.createdAt);
      });
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "POST",
    pattern: "/commercial-items",
    access: ADMIN,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["type", "categoryId", "nameEs", "nameEn", "descriptionEs", "descriptionEn", "basePrice"], ["type", "categoryId"]);
      const b = ctx.body;
      const cat = ctx.store.categories.find((c) => c.id === b.categoryId);
      if (!cat) fail(400, "La categoría comercial no existe");
      if (!cat.isActive) fail(400, "La categoría comercial está inactiva");
      if (!b.nameEs && !b.nameEn) fail(400, "El elemento comercial debe tener al menos un nombre en español o inglés");
      if (b.basePrice !== undefined && b.basePrice !== null && !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(String(b.basePrice))) {
        fail(400, ["basePrice debe ser un importe válido"]);
      }
      if ((b.type === "DISH" || b.type === "BEVERAGE") && (b.basePrice === undefined || b.basePrice === null)) {
        fail(400, "Un plato o bebida debe tener un precio base o variantes activas, pero no ambos");
      }
      const now = iso(Date.now());
      const item: CommercialItem = {
        id: uuid(),
        type: b.type as CommercialItem["type"],
        categoryId: cat.id,
        nameEs: (b.nameEs as string | null) ?? null,
        nameEn: (b.nameEn as string | null) ?? null,
        descriptionEs: (b.descriptionEs as string | null) ?? null,
        descriptionEn: (b.descriptionEn as string | null) ?? null,
        basePrice: b.basePrice === undefined || b.basePrice === null ? null : Number(b.basePrice).toFixed(2),
        displayOrder: 0,
        isActive: true,
        approvalStatus: "DRAFT",
        conditions: null,
        internalNotes: null,
        availabilityNote: null,
        createdAt: now,
        updatedAt: now,
        category: { id: cat.id, nameEs: cat.nameEs, nameEn: cat.nameEn, isActive: cat.isActive, displayOrder: cat.displayOrder },
        variants: [],
        images: [],
        faqs: [],
        schedules: [],
        promotionDetail: null,
        eventDetail: null,
      };
      ctx.store.items.push(item);
      return json(201, item);
    },
  },
  {
    method: "PATCH",
    pattern: "/commercial-items/:id/status",
    access: ADMIN,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["isActive"], ["isActive"]);
      if (typeof ctx.body.isActive !== "boolean") fail(400, ["isActive must be a boolean value"]);
      const item = ctx.store.items.find((i) => i.id === ctx.params.id);
      if (!item) fail(404, "Elemento comercial no encontrado");
      item.isActive = ctx.body.isActive;
      item.updatedAt = iso(Date.now());
      return json(200, item);
    },
  },
  {
    method: "PATCH",
    pattern: "/commercial-items/:id/approval",
    access: ADMIN,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["approvalStatus"], ["approvalStatus"]);
      const status = ctx.body.approvalStatus;
      if (!["DRAFT", "APPROVED", "REJECTED"].includes(String(status))) fail(400, ["approvalStatus must be one of the following values: DRAFT, APPROVED, REJECTED"]);
      const item = ctx.store.items.find((i) => i.id === ctx.params.id);
      if (!item) fail(404, "Elemento comercial no encontrado");
      if (status === "APPROVED") {
        if (!item.nameEs?.trim()) fail(400, "El elemento necesita un nombre en español antes de aprobarse");
        if (!item.category.isActive) fail(400, "No se puede aprobar un elemento de una categoría inactiva");
      }
      item.approvalStatus = status as CommercialItem["approvalStatus"];
      item.updatedAt = iso(Date.now());
      return json(200, item);
    },
  },

  // ------------------------------------------------------------------ clientes
  {
    method: "GET",
    pattern: "/customers",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "search", "status", "channel", "commercialItemId"]);
      const { page, limit } = pageParams(ctx, 20);
      const search = searchParam(ctx);
      const status = enumParam(ctx, "status", ["NEW", "INTERESTED", "IN_CONVERSATION", "REQUESTED_RESERVATION", "CONFIRMED", "REJECTED", "LOST", "RECURRENT"] as const);
      const channel = enumParam(ctx, "channel", ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE", "PHONE", "EMAIL", "OTHER"] as const);
      const itemId = uuidParam(ctx, "commercialItemId");
      const rows = ctx.store.customers
        .filter(
          (c) =>
            (!search || customerMatches(c, search)) &&
            (!status || c.status === status) &&
            (!channel || c.sourceChannel === channel) &&
            (!itemId || c.interests.some((i) => i.commercialItemId === itemId)),
        )
        .sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt) || a.id.localeCompare(b.id))
        .map(customerOut);
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "GET",
    pattern: "/customers/:id",
    access: READERS,
    handler: (ctx) => {
      const c = ctx.store.customers.find((x) => x.id === ctx.params.id);
      if (!c) fail(404, "Cliente no encontrado");
      return json(200, customerDetailOut(ctx.store, c));
    },
  },
  {
    method: "PATCH",
    pattern: "/customers/:id/status",
    access: WRITERS,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["status"], ["status"]);
      const c = ctx.store.customers.find((x) => x.id === ctx.params.id);
      if (!c) fail(404, "Cliente o interés no encontrado");
      c.status = ctx.body.status as MockCustomer["status"];
      c.updatedAt = iso(Date.now());
      return json(200, customerOut(c));
    },
  },

  // ------------------------------------------------------------------ solicitudes
  {
    method: "GET",
    pattern: "/reservation-requests",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "customerId", "dateFrom", "dateTo", "status", "channel", "commercialItemId", "search"]);
      const { page, limit } = pageParams(ctx, 20);
      const { fromMs, toMs } = dateRange(ctx);
      const customerId = uuidParam(ctx, "customerId");
      const itemId = uuidParam(ctx, "commercialItemId");
      const status = enumParam(ctx, "status", [
        "INCOMPLETE_DATA", "READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE", "ACCEPTED", "REJECTED", "MODIFICATION_REQUESTED", "RENEGOTIATING", "CANCELLED",
      ] as const);
      const channel = enumParam(ctx, "channel", ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE", "PHONE", "EMAIL", "OTHER"] as const);
      const search = searchParam(ctx);
      const rows = ctx.store.requests
        .filter((r) => {
          const at = r.reservationAt ? Date.parse(r.reservationAt) : null;
          if ((fromMs !== null || toMs !== null) && at === null) return false;
          if (fromMs !== null && at! < fromMs) return false;
          if (toMs !== null && at! >= toMs) return false;
          if (customerId && r.customerId !== customerId) return false;
          if (itemId && r.commercialItemId !== itemId) return false;
          if (status && r.status !== status) return false;
          if (channel && r.sourceChannel !== channel) return false;
          if (search && !lower(r.code).includes(lower(search)) && !customerMatches(findCustomer(ctx.store, r.customerId), search)) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .map((r) => requestOut(ctx.store, r));
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "GET",
    pattern: "/reservation-requests/:id",
    access: READERS,
    handler: (ctx) => {
      const r = ctx.store.requests.find((x) => x.id === ctx.params.id);
      if (!r) fail(404, "Solicitud de reserva no encontrada");
      return json(200, requestOut(ctx.store, r));
    },
  },
  {
    method: "PATCH",
    pattern: "/reservation-requests/:id/status",
    access: WRITERS,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["status"], ["status"]);
      if (ctx.body.status !== "CANCELLED") fail(400, ["status must be one of the following values: CANCELLED"]);
      const r = ctx.store.requests.find((x) => x.id === ctx.params.id);
      if (!r) fail(404, "Solicitud de reserva no encontrada");
      if (r.status === "CANCELLED") return json(200, requestOut(ctx.store, r));
      if (r.status !== "INCOMPLETE_DATA" && r.status !== "READY_TO_SEND") fail(409, "La solicitud no admite modificaciones en su estado actual");
      r.status = "CANCELLED";
      r.updatedAt = iso(Date.now());
      return json(200, requestOut(ctx.store, r));
    },
  },

  // ------------------------------------------------------------------ reservas
  {
    method: "GET",
    pattern: "/reservations",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "customerId", "dateFrom", "dateTo", "commercialItemId", "assignedUserId", "search", "excludeCancelled", "status"]);
      const { page, limit } = pageParams(ctx, 20);
      const { fromMs, toMs } = dateRange(ctx);
      const customerId = uuidParam(ctx, "customerId");
      const itemId = uuidParam(ctx, "commercialItemId");
      const assigned = uuidParam(ctx, "assignedUserId");
      const search = searchParam(ctx);
      const excludeCancelled = boolParam(ctx, "excludeCancelled");
      const status = enumParam(ctx, "status", ["CONFIRMED", "UPCOMING", "IN_SERVICE", "COMPLETED", "RESCHEDULED", "CANCELLED", "NO_SHOW"] as const);
      if (status === "CANCELLED" && excludeCancelled) fail(400, "No combines status=CANCELLED con excludeCancelled=true");
      const rows = ctx.store.reservations
        .filter((r) => {
          const at = Date.parse(r.reservationAt);
          if (fromMs !== null && at < fromMs) return false;
          if (toMs !== null && at >= toMs) return false;
          if (customerId && r.customerId !== customerId) return false;
          if (itemId && r.commercialItemId !== itemId) return false;
          if (assigned && r.assignedUserId !== assigned) return false;
          if (status ? r.status !== status : excludeCancelled && r.status === "CANCELLED") return false;
          if (search && !lower(r.code).includes(lower(search)) && !customerMatches(findCustomer(ctx.store, r.customerId), search)) return false;
          return true;
        })
        .sort((a, b) => a.reservationAt.localeCompare(b.reservationAt) || a.id.localeCompare(b.id))
        .map((r) => reservationOut(ctx.store, r));
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "GET",
    pattern: "/reservations/:id",
    access: READERS,
    handler: (ctx) => json(200, reservationDetailOut(ctx.store, getReservation(ctx))),
  },
  {
    method: "PATCH",
    pattern: "/reservations/:id/status",
    access: WRITERS,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["status"], ["status"]);
      const target = ctx.body.status as ReservationStatus;
      const allTargets = ["CONFIRMED", "UPCOMING", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"];
      if (!allTargets.includes(String(target))) fail(400, [`status must be one of the following values: ${allTargets.join(", ")}`]);
      const r = getReservation(ctx);
      if (r.status === target) return json(200, reservationOut(ctx.store, r));
      if (!(RESERVATION_STATUS_TRANSITIONS[r.status] as readonly string[]).includes(target)) fail(409, "Transición de reserva no permitida");
      if ((target === "IN_SERVICE" || target === "NO_SHOW") && Date.parse(r.reservationAt) > Date.now()) {
        fail(409, "Todavía no ha llegado la hora de la reserva");
      }
      r.status = target;
      r.updatedAt = iso(Date.now());
      return json(200, reservationOut(ctx.store, r));
    },
  },

  // ------------------------------------------------------------------ conversaciones
  {
    method: "GET",
    pattern: "/conversations",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "channel", "customerId", "assignedUserId", "unreadOnly", "isAssistantPaused", "search"]);
      const { page, limit } = pageParams(ctx, 50);
      const channel = enumParam(ctx, "channel", ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE", "PHONE", "EMAIL", "OTHER"] as const);
      const customerId = uuidParam(ctx, "customerId");
      const assigned = uuidParam(ctx, "assignedUserId");
      const unreadOnly = boolParam(ctx, "unreadOnly");
      const paused = boolParam(ctx, "isAssistantPaused");
      const search = searchParam(ctx);
      const rows = ctx.store.conversations
        .map((c) => conversationOut(ctx.store, c))
        .filter(
          (c) =>
            (!channel || c.channel === channel) &&
            (!customerId || c.customerId === customerId) &&
            (!assigned || c.assignedUserId === assigned) &&
            (!unreadOnly || c.unreadCount > 0) &&
            (paused === undefined || c.isAssistantPaused === paused) &&
            (!search || customerMatches(c.customer, search)),
        )
        .sort((a, b) => {
          if (a.lastMessageAt === b.lastMessageAt) return b.id.localeCompare(a.id);
          if (a.lastMessageAt === null) return 1;
          if (b.lastMessageAt === null) return -1;
          return b.lastMessageAt.localeCompare(a.lastMessageAt);
        });
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "GET",
    pattern: "/conversations/:id",
    access: READERS,
    handler: (ctx) => json(200, conversationOut(ctx.store, getConversation(ctx))),
  },
  {
    method: "GET",
    pattern: "/conversations/:id/messages",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit"]);
      const { page, limit } = pageParams(ctx, 50);
      const conv = getConversation(ctx);
      const rows = ctx.store.messages.filter((m) => m.conversationId === conv.id).sort((a, b) => b.sequence - a.sequence);
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "PATCH",
    pattern: "/conversations/:id/read",
    access: WRITERS,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["throughMessageId"], ["throughMessageId"]);
      const conv = getConversation(ctx);
      const through = ctx.store.messages.find((m) => m.id === ctx.body.throughMessageId && m.conversationId === conv.id);
      if (!through) fail(404, "Mensaje no encontrado en esta conversación");
      const now = iso(Date.now());
      let updated = 0;
      for (const m of ctx.store.messages) {
        if (m.conversationId === conv.id && m.direction === "INBOUND" && m.readAt === null && m.sequence <= through.sequence) {
          m.readAt = now;
          updated += 1;
        }
      }
      return json(200, { updated, throughMessageId: through.id });
    },
  },
  {
    method: "PATCH",
    pattern: "/conversations/:id/assistant",
    access: WRITERS,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["paused"], ["paused"]);
      if (typeof ctx.body.paused !== "boolean") fail(400, ["paused must be a boolean value"]);
      const conv = getConversation(ctx);
      if (conv.isAssistantPaused !== ctx.body.paused) {
        conv.isAssistantPaused = ctx.body.paused;
        conv.updatedAt = iso(Date.now());
      }
      return json(200, conversationOut(ctx.store, conv));
    },
  },
  {
    method: "PATCH",
    pattern: "/conversations/:id/assignee",
    access: WRITERS,
    handler: (ctx) => {
      requireBodyKeys(ctx, ["assignedUserId"], ["assignedUserId"]);
      const target = ctx.body.assignedUserId as string | null;
      if (target !== null && (typeof target !== "string" || !UUID_RE.test(target))) fail(400, ["assignedUserId must be a UUID"]);
      const conv = getConversation(ctx);
      const me = ctx.user!;
      if (!me.roles.includes("ADMIN")) {
        const free = conv.assignedUserId === null;
        const mine = conv.assignedUserId === me.id;
        const allowed = (target === me.id && (free || mine)) || (target === null && (free || mine));
        if (!allowed) fail(403, "Solo puedes tomar conversaciones libres o desasignarte de las propias");
      }
      if (target !== null) {
        const u = ctx.store.users.find((x) => x.id === target);
        if (!u) fail(404, "Usuario no encontrado");
        if (!isEligibleAssignee(u)) fail(400, "Responsable no elegible");
      }
      if (conv.assignedUserId !== target) {
        conv.assignedUserId = target;
        conv.updatedAt = iso(Date.now());
      }
      return json(200, conversationOut(ctx.store, conv));
    },
  },
  {
    method: "POST",
    pattern: "/conversations/:id/messages",
    access: WRITERS,
    handler: (ctx) => {
      const key = ctx.headers["idempotency-key"] ?? "";
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key)) fail(400, "Idempotency-Key debe contener 16 a 80 caracteres alfanuméricos, guion o guion bajo");
      requireBodyKeys(ctx, ["type", "content"], ["type", "content"]);
      if (ctx.body.type !== "TEXT") fail(400, ["type must be equal to TEXT"]);
      const content = ctx.body.content;
      if (typeof content !== "string" || !/\S/.test(content) || content.length > 4096) fail(400, ["content must be shorter than or equal to 4096 characters"]);
      const conv = getConversation(ctx);
      const me = ctx.user!;
      const idemKey = `${conv.id}:${key}`;
      const existing = ctx.store.idempotency.get(idemKey);
      if (existing) {
        if (existing.authorUserId !== me.id || existing.content !== content) fail(409, "Idempotency-Key ya utilizada con otros datos");
        return json(202, ctx.store.messages.find((m) => m.id === existing.messageId));
      }
      const customer = findCustomer(ctx.store, conv.customerId);
      if (conv.channel !== "WHATSAPP" || !digits(customer.phone)) fail(400, "Conversación sin destinatario WhatsApp habilitado");
      const lastInbound = ctx.store.messages
        .filter((m) => m.conversationId === conv.id && m.direction === "INBOUND" && m.occurredAt)
        .reduce((max, m) => Math.max(max, Date.parse(m.occurredAt!)), 0);
      if (Date.now() - lastInbound > 24 * 60 * 60 * 1000) fail(409, "Ventana de WhatsApp cerrada; se requiere una plantilla aprobada");
      const now = Date.now();
      const sequence = ctx.store.messages.filter((m) => m.conversationId === conv.id).reduce((max, m) => Math.max(max, m.sequence), 0) + 1;
      const message: Message = {
        id: uuid(),
        conversationId: conv.id,
        channel: conv.channel,
        sequence,
        externalMessageId: null,
        direction: "OUTBOUND",
        status: "QUEUED",
        type: "TEXT",
        content,
        authorUserId: me.id,
        occurredAt: null,
        receivedAt: null,
        processedAt: null,
        sentAt: null,
        deliveredAt: null,
        providerReadAt: null,
        failedAt: null,
        readAt: null,
        errorCode: null,
        createdAt: iso(now),
        updatedAt: iso(now),
        attachments: [],
      };
      ctx.store.messages.push(message);
      ctx.store.idempotency.set(idemKey, { messageId: message.id, authorUserId: me.id, content });
      touchConversation(conv, now);
      // Simula el worker de envío: QUEUED → SENT → DELIVERED.
      setTimeout(() => {
        message.status = "SENT";
        message.externalMessageId = `mock-wamid-${message.id.slice(0, 8)}`;
        message.sentAt = iso(Date.now());
        message.updatedAt = message.sentAt;
      }, 1200);
      setTimeout(() => {
        message.status = "DELIVERED";
        message.deliveredAt = iso(Date.now());
        message.updatedAt = message.deliveredAt;
      }, 2600);
      return json(202, message);
    },
  },
];

// ---------------------------------------------------------------------------- despacho

function compile(pattern: string) {
  const names: string[] = [];
  const re = new RegExp(`^${pattern.replace(/:([a-zA-Z]+)/g, (_m, name: string) => {
    names.push(name);
    return "([^/]+)";
  })}$`);
  return { re, names };
}

const COMPILED = ROUTES.map((r) => ({ ...r, ...compile(r.pattern) }));

function authenticate(store: MockStore, headers: Record<string, string>): { user: MockUser; sessionId: string } | null {
  const auth = headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const payload = readToken(auth.slice(7));
  if (!payload || typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  const session = store.sessions.find((s) => s.id === payload.sessionId);
  if (!session || session.revoked || session.expiresAt < Date.now()) return null;
  const user = store.users.find((u) => u.id === payload.sub);
  if (!user || !user.isActive) return null;
  return { user, sessionId: session.id };
}

/** Pausa artificial para que los estados de carga sean visibles en la demo. */
const LATENCY_MS = Number(process.env.CRM_MOCK_LATENCY_MS ?? 120);

export async function handleMockRequest(input: MockRequestInput): Promise<Response> {
  if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));
  const store = mockStore();
  const path = decodeURI(input.path);
  const candidates = COMPILED.filter((r) => r.re.test(path));
  const route = candidates.find((r) => r.method === input.method);
  if (!route) {
    return json(404, { message: `Cannot ${input.method} ${path}`, error: "Not Found", statusCode: 404 });
  }

  const match = route.re.exec(path)!;
  const params: Record<string, string> = {};
  route.names.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1]!)));

  try {
    let user: MockUser | null = null;
    let sessionId: string | null = null;
    if (route.access !== "PUBLIC") {
      const auth = authenticate(store, input.headers);
      if (!auth) return json(401, { message: "Unauthorized", statusCode: 401 });
      user = auth.user;
      sessionId = auth.sessionId;
      if (route.access !== "AUTH" && !hasRole(user, route.access)) {
        fail(403, "No tienes permisos para realizar esta acción");
      }
    }
    if (params.id !== undefined && !UUID_RE.test(params.id)) fail(400, "Validation failed (uuid is expected)");

    let body: Record<string, unknown> = {};
    if (input.body) {
      try {
        const parsed = JSON.parse(input.body);
        body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        fail(400, "Unexpected token in JSON");
      }
    }

    return route.handler({ store, user, sessionId, params, query: new URLSearchParams(input.search), body, headers: input.headers });
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, error.body);
    console.error("[mock] error no controlado", error);
    return json(500, { statusCode: 500, message: "Ocurrió un error interno", path, method: input.method, timestamp: iso(Date.now()) });
  }
}
