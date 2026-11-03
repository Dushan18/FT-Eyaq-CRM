import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import {
  EMPTY_USER_FORM,
  ROLE_OPTIONS,
  buildCreateUserBody,
  createUserErrorTarget,
  lastAccessText,
  roleSummary,
  sortUsers,
  validateUserForm,
  type UserFormValues,
} from "./usuarios-logic";

const TZ = "America/Lima";
// Miércoles 14 oct 2026, 00:45 en Lima (05:45 UTC).
const NOW = Date.parse("2026-10-14T05:45:00.000Z");

const valid: UserFormValues = {
  firstName: "Lucía",
  lastName: "Ramos",
  email: "lucia@sabormagico.pe",
  password: "temporal123",
  role: "OPERATOR",
};

describe("validación del formulario de usuario", () => {
  it("acepta un alta completa", () => {
    expect(validateUserForm(valid)).toEqual({});
  });

  it("exige nombre y apellido que no sean solo espacios", () => {
    const errors = validateUserForm({ ...valid, firstName: "   ", lastName: "" });
    expect(errors.firstName).toBe("Escribe el nombre.");
    expect(errors.lastName).toBe("Escribe el apellido.");
  });

  it("limita nombre y apellido a 100 caracteres (sin contar espacios alrededor)", () => {
    expect(validateUserForm({ ...valid, firstName: ` ${"a".repeat(100)} ` }).firstName).toBeUndefined();
    expect(validateUserForm({ ...valid, lastName: "a".repeat(101) }).lastName).toBe("Máximo 100 caracteres.");
  });

  it("valida el correo", () => {
    expect(validateUserForm({ ...valid, email: "" }).email).toBe("Escribe el correo.");
    for (const bad of ["lucia", "lucia@", "lucia@sabormagico", "lu cia@sabormagico.pe", "@sabormagico.pe"]) {
      expect(validateUserForm({ ...valid, email: bad }).email, bad).toBe("Escribe un correo válido.");
    }
    expect(validateUserForm({ ...valid, email: "  Lucia@SaborMagico.pe " }).email).toBeUndefined();
    expect(validateUserForm({ ...valid, email: `${"a".repeat(310)}@correo.com` }).email).toBe("Máximo 320 caracteres.");
  });

  it("la contraseña temporal tiene entre 8 y 72 caracteres", () => {
    expect(validateUserForm({ ...valid, password: "1234567" }).password).toBe("Mínimo 8 caracteres.");
    expect(validateUserForm({ ...valid, password: "12345678" }).password).toBeUndefined();
    expect(validateUserForm({ ...valid, password: "a".repeat(72) }).password).toBeUndefined();
    expect(validateUserForm({ ...valid, password: "a".repeat(73) }).password).toBe("Máximo 72 caracteres.");
  });

  it("el formulario vacío marca todos los campos de texto", () => {
    const errors = validateUserForm(EMPTY_USER_FORM);
    expect(Object.keys(errors).sort()).toEqual(["email", "firstName", "lastName", "password"]);
  });

  it("ofrece los 4 roles con sus etiquetas", () => {
    expect(ROLE_OPTIONS).toEqual([
      { value: "ADMIN", label: "Administrador" },
      { value: "OWNER", label: "Propietario" },
      { value: "OPERATOR", label: "Operador" },
      { value: "SUPPORT", label: "Soporte EYAQ" },
    ]);
  });
});

describe("cuerpo de POST /users", () => {
  it("envía exactamente los campos del contrato, recortados, con el rol elegido", () => {
    const body = buildCreateUserBody({
      firstName: "  Lucía ",
      lastName: " Ramos",
      email: "  Lucia@SaborMagico.pe ",
      password: " clave temporal ",
      role: "OWNER",
    });
    expect(body).toEqual({
      firstName: "Lucía",
      lastName: "Ramos",
      email: "lucia@sabormagico.pe",
      // La contraseña se envía tal cual: los espacios forman parte de ella.
      password: " clave temporal ",
      roles: ["OWNER"],
    });
    expect(Object.keys(body).sort()).toEqual(["email", "firstName", "lastName", "password", "roles"]);
  });
});

describe("presentación de usuarios", () => {
  it("muestra el rol de mayor precedencia y cuántos más tiene", () => {
    expect(roleSummary(["OPERATOR", "ADMIN"])).toEqual({ main: "ADMIN", label: "Administrador", extra: 1, title: "Administrador, Operador" });
    expect(roleSummary(["OWNER"])).toEqual({ main: "OWNER", label: "Propietario", extra: 0, title: "Propietario" });
    expect(roleSummary([]).label).toBe("Sin rol");
  });

  it("último acceso en la zona del restaurante o «Nunca»", () => {
    expect(lastAccessText(null, NOW, TZ)).toBe("Nunca");
    expect(lastAccessText("2026-10-14T04:30:00.000Z", NOW, TZ)).toBe("Hace 1 h");
    expect(lastAccessText("2026-10-14T05:43:00.000Z", NOW, TZ)).toBe("Hace 2 min");
  });

  it("ordena del más reciente al más antiguo sin mutar la lista", () => {
    const user = (id: string, createdAt: string) => ({ id, createdAt }) as User;
    const list = [user("a", "2026-01-01T00:00:00.000Z"), user("b", "2026-03-01T00:00:00.000Z")];
    expect(sortUsers(list).map((u) => u.id)).toEqual(["b", "a"]);
    expect(list.map((u) => u.id)).toEqual(["a", "b"]);
  });
});

describe("errores del alta", () => {
  it("el correo duplicado (409) se muestra en el campo Correo", () => {
    const error = new ApiError(409, ["Ya existe un usuario registrado con este correo"]);
    expect(createUserErrorTarget(error)).toEqual({ field: "email", message: "Ya existe un usuario registrado con este correo." });
  });

  it("un correo rechazado por la validación del backend también va al campo Correo", () => {
    expect(createUserErrorTarget(new ApiError(400, ["email must be an email"])).field).toBe("email");
  });

  it("otros errores van al aviso del formulario", () => {
    expect(createUserErrorTarget(new ApiError(400, ["Uno o más roles no están disponibles"]))).toEqual({
      field: null,
      message: "Uno o más roles no están disponibles.",
    });
    expect(createUserErrorTarget(new ApiError(0, ["No se pudo conectar con el servidor."])).field).toBeNull();
  });
});
