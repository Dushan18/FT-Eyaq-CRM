/** Rutas simuladas de sesión y usuarios (Parte 01). */
import type { RoleCode } from "@/lib/api/types";
import { ADMIN, BodyCheck, fail, isEmail, json, lower, requireBodyKeys, requireSomeField, type Route } from "../http";
import { iso, uuid, type MockStore, type MockUser } from "../store";
import { publicUser } from "../views";

const ACCESS_TTL_S = 15 * 60;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROLE_CODES: readonly RoleCode[] = ["ADMIN", "OWNER", "OPERATOR", "SUPPORT"];

function mockPassword(): string {
  return process.env.CRM_MOCK_PASSWORD?.trim() || "demo1234";
}

// ---------------------------------------------------------------------------- tokens simulados

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeToken(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.mock`;
}

export function readToken(token: string): Record<string, unknown> | null {
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

// ---------------------------------------------------------------------------- validación de usuarios

/** firstName/lastName: al crear son obligatorios; al editar, opcionales pero sin null ni "". El máximo se mide antes del trim. */
function personName(check: BodyCheck, key: string, value: unknown, mode: "create" | "update"): string | undefined {
  if (value === undefined && mode === "update") return undefined;
  const long = `${key} must be shorter than or equal to 100 characters`;
  const spaces = `${key} no puede contener solo espacios`;
  const empty = `${key} should not be empty`;
  const str = `${key} must be a string`;
  if (value === undefined || value === null) {
    check.add(...(mode === "create" ? [long, spaces, empty, str] : [long, spaces, str]));
    return undefined;
  }
  if (typeof value !== "string") {
    check.add(long, spaces, str);
    return undefined;
  }
  const msgs: string[] = [];
  if (value.length > 100) msgs.push(long);
  if (!value.trim()) msgs.push(spaces);
  if (mode === "create" && value === "") msgs.push(empty);
  if (msgs.length) {
    check.add(...msgs);
    return undefined;
  }
  return value.trim();
}

function userEmail(check: BodyCheck, value: unknown, mode: "create" | "update"): string | undefined {
  if (value === undefined && mode === "update") return undefined;
  const long = "email must be shorter than or equal to 320 characters";
  const bad = "email must be an email";
  if (typeof value !== "string" || value.length > 320) {
    check.add(long, bad);
    return undefined;
  }
  if (!isEmail(value)) {
    check.add(bad);
    return undefined;
  }
  return value.trim().toLowerCase();
}

function userPassword(check: BodyCheck, value: unknown): string | undefined {
  const max = "password must be shorter than or equal to 72 characters";
  const min = "password must be longer than or equal to 8 characters";
  if (typeof value !== "string") check.add(max, min, "password must be a string");
  else if (value.length < 8) check.add(min);
  else if (value.length > 72) check.add(max);
  else return value;
  return undefined;
}

function userRoles(check: BodyCheck, value: unknown): RoleCode[] | undefined {
  const each = `each value in roles must be one of the following values: ${ROLE_CODES.join(", ")}`;
  const unique = "All roles's elements must be unique";
  const min = "roles must contain at least 1 elements";
  const arr = "roles must be an array";
  if (!Array.isArray(value)) {
    const validSingle = typeof value === "string" && (ROLE_CODES as readonly string[]).includes(value);
    check.add(...(validSingle ? [unique, min, arr] : [each, unique, min, arr]));
    return undefined;
  }
  const msgs: string[] = [];
  if (value.some((v) => !(ROLE_CODES as readonly unknown[]).includes(v))) msgs.push(each);
  if (new Set(value).size !== value.length) msgs.push(unique);
  if (value.length === 0) msgs.push(min);
  if (msgs.length) {
    check.add(...msgs);
    return undefined;
  }
  return value as RoleCode[];
}

function findUser(store: MockStore, id: string): MockUser {
  const user = store.users.find((u) => u.id === id);
  if (!user) fail(404, "Usuario no encontrado");
  return user;
}

function otherActiveAdmins(store: MockStore, user: MockUser) {
  return store.users.filter((u) => u.id !== user.id && u.isActive && u.roles.includes("ADMIN"));
}

// ---------------------------------------------------------------------------- rutas

export const authRoutes: Route[] = [
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

  // ------------------------------------------------------------------ usuarios (solo ADMIN)
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
      const b = ctx.body;
      const check = new BodyCheck();
      check.only(b, ["firstName", "lastName", "email", "password", "roles"]);
      const firstName = personName(check, "firstName", b.firstName, "create");
      const lastName = personName(check, "lastName", b.lastName, "create");
      const email = userEmail(check, b.email, "create");
      userPassword(check, b.password);
      const roles = userRoles(check, b.roles);
      check.done();
      if (ctx.store.users.some((u) => u.email === email)) fail(409, "Ya existe un usuario registrado con este correo");
      const now = iso(Date.now());
      const user: MockUser = {
        id: uuid(),
        firstName: firstName!,
        lastName: lastName!,
        email: email!,
        isActive: true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
        roles: roles!,
        password: "",
      };
      ctx.store.users.push(user);
      return json(201, publicUser(user));
    },
  },
  {
    method: "GET",
    pattern: "/users/:id",
    access: ADMIN,
    handler: (ctx) => json(200, publicUser(findUser(ctx.store, ctx.params.id!))),
  },
  {
    method: "PATCH",
    pattern: "/users/:id",
    access: ADMIN,
    handler: (ctx) => {
      const b = ctx.body;
      const check = new BodyCheck();
      check.only(b, ["firstName", "lastName", "email"]);
      const firstName = personName(check, "firstName", b.firstName, "update");
      const lastName = personName(check, "lastName", b.lastName, "update");
      const email = userEmail(check, b.email, "update");
      check.done();
      const user = findUser(ctx.store, ctx.params.id!);
      requireSomeField(b, "Debes proporcionar al menos un campo para actualizar");
      if (email !== undefined && ctx.store.users.some((u) => u.id !== user.id && u.email === email)) {
        fail(409, "Ya existe un usuario registrado con este correo");
      }
      if (firstName !== undefined) user.firstName = firstName;
      if (lastName !== undefined) user.lastName = lastName;
      if (email !== undefined) user.email = email;
      user.updatedAt = iso(Date.now());
      // approvalResponsible de la configuración embebe nombre, apellido y email.
      const config = ctx.store.config;
      if (config?.approvalResponsible?.id === user.id) {
        config.approvalResponsible = { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email };
      }
      return json(200, publicUser(user));
    },
  },
  {
    method: "PATCH",
    pattern: "/users/:id/status",
    access: ADMIN,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["isActive"]);
      const isActive = check.bool("isActive", ctx.body.isActive, { required: true });
      check.done();
      const user = findUser(ctx.store, ctx.params.id!);
      // La regla del último ADMIN solo protege a un ADMIN activo.
      if (!isActive && user.isActive && user.roles.includes("ADMIN") && otherActiveAdmins(ctx.store, user).length === 0) {
        fail(409, "No se puede desactivar al último administrador activo");
      }
      user.isActive = isActive!;
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
      const check = new BodyCheck();
      check.only(ctx.body, ["roles"]);
      const roles = userRoles(check, ctx.body.roles);
      check.done();
      const user = findUser(ctx.store, ctx.params.id!);
      if (user.isActive && user.roles.includes("ADMIN") && !roles!.includes("ADMIN") && otherActiveAdmins(ctx.store, user).length === 0) {
        fail(409, "No se puede retirar el rol al último administrador activo");
      }
      // Reemplazar roles no toca updatedAt (la relación vive en otra tabla).
      user.roles = [...roles!];
      return json(200, publicUser(user));
    },
  },
];
