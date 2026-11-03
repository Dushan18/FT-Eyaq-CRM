/**
 * Lógica pura de Ajustes > Usuarios: presentación de cada cuenta y validación del alta (POST /users).
 * Reglas del backend: docs/backend/auth-usuarios-config.md §5 (CreateUserDto).
 */
import { ApiError } from "@/lib/api/client";
import type { CreateUserRequest, RoleCode, User } from "@/lib/api/types";
import { ROLE_CODES, ROLE_LABELS, primaryRole } from "@/lib/auth/permissions";
import { formatAgoLong } from "@/lib/format/dates";

export const PERSON_NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 320;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
/** Comprobación básica; el backend aplica @IsEmail (exige dominio con TLD). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ROLE_OPTIONS: ReadonlyArray<{ value: RoleCode; label: string }> = ROLE_CODES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

// ---------------------------------------------------------------- presentación de la lista

/** Más recientes primero (el backend ya ordena por createdAt desc; se asegura aquí). */
export function sortUsers(users: readonly User[]): User[] {
  return [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface RoleSummary {
  /** Rol que se muestra (el de mayor precedencia); null si la cuenta no tiene roles. */
  main: RoleCode | null;
  label: string;
  /** Cantidad de roles adicionales ("+N"). */
  extra: number;
  /** Todos los roles, para el tooltip. */
  title: string;
}

export function roleSummary(roles: readonly RoleCode[]): RoleSummary {
  const main = primaryRole(roles);
  const unique = [...new Set(roles)];
  if (!main) return { main: null, label: "Sin rol", extra: 0, title: "Sin roles asignados" };
  const known = ROLE_CODES.filter((r) => unique.includes(r));
  return {
    main,
    label: ROLE_LABELS[main],
    extra: unique.length - 1,
    title: known.map((r) => ROLE_LABELS[r]).join(", "),
  };
}

/** Último acceso en la zona del restaurante, o "Nunca" si aún no inició sesión. */
export function lastAccessText(lastLoginAt: string | null, now: number, timeZone: string): string {
  return lastLoginAt ? formatAgoLong(lastLoginAt, now, timeZone) : "Nunca";
}

// ---------------------------------------------------------------- formulario "Invitar usuario"

export interface UserFormValues {
  firstName: string;
  lastName: string;
  email: string;
  /** Contraseña temporal: se envía tal cual (sin recortar espacios). */
  password: string;
  role: RoleCode;
}

export type UserFormErrors = Partial<Record<keyof UserFormValues, string>>;

export const EMPTY_USER_FORM: UserFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "OPERATOR",
};

function personNameError(value: string, missing: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return missing;
  if (trimmed.length > PERSON_NAME_MAX_LENGTH) return `Máximo ${PERSON_NAME_MAX_LENGTH} caracteres.`;
  return undefined;
}

export function validateUserForm(values: UserFormValues): UserFormErrors {
  const errors: UserFormErrors = {};

  const firstName = personNameError(values.firstName, "Escribe el nombre.");
  if (firstName) errors.firstName = firstName;
  const lastName = personNameError(values.lastName, "Escribe el apellido.");
  if (lastName) errors.lastName = lastName;

  const email = values.email.trim();
  if (!email) errors.email = "Escribe el correo.";
  else if (email.length > EMAIL_MAX_LENGTH) errors.email = `Máximo ${EMAIL_MAX_LENGTH} caracteres.`;
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Escribe un correo válido.";

  if (values.password.length < PASSWORD_MIN_LENGTH) errors.password = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`;
  else if (values.password.length > PASSWORD_MAX_LENGTH) errors.password = `Máximo ${PASSWORD_MAX_LENGTH} caracteres.`;

  if (!(ROLE_CODES as readonly string[]).includes(values.role)) errors.role = "Elige un rol.";
  return errors;
}

/** Cuerpo de POST /users con exactamente los campos del contrato. Debe llamarse con valores validados. */
export function buildCreateUserBody(values: UserFormValues): CreateUserRequest {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    // El backend guarda el correo recortado y en minúsculas; con espacios alrededor @IsEmail falla.
    email: values.email.trim().toLowerCase(),
    password: values.password,
    roles: [values.role],
  };
}

// ---------------------------------------------------------------- errores

function withPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Motivo de una acción fallida, tal como lo explica el backend. */
export function actionErrorText(error: unknown): string {
  if (error instanceof ApiError) return error.messages.map(withPeriod).join(" ");
  if (error instanceof Error && error.message) return withPeriod(error.message);
  return "Inténtalo de nuevo.";
}

/**
 * Dónde mostrar el error del alta: el correo duplicado (409) y el correo rechazado por @IsEmail (400)
 * van bajo el campo Correo; el resto, como aviso del formulario.
 */
export function createUserErrorTarget(error: unknown): { field: "email" | null; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 409) return { field: "email", message: withPeriod(error.messages[0] ?? "Ya existe un usuario con este correo") };
    if (error.status === 400 && error.messages.length > 0 && error.messages.every((m) => m.startsWith("email"))) {
      return { field: "email", message: "El servidor no aceptó este correo: revisa que esté bien escrito." };
    }
  }
  return { field: null, message: actionErrorText(error) };
}
