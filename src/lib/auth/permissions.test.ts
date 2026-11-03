import { describe, expect, it } from "vitest";
import { can, canView, canViewSettingsTab, homePathFor, primaryRole, viewFromPath, VIEW_ORDER, type Action } from "./permissions";

const WRITE_ACTIONS: Action[] = [
  "conversation.read",
  "conversation.pause",
  "conversation.assign",
  "conversation.send",
  "request.cancel",
  "reservation.status",
  "customer.edit",
];
const ADMIN_ONLY: Action[] = ["config.edit", "catalog.edit", "users.manage"];

describe("permisos por rol (réplica de la matriz de bk-crm)", () => {
  it("el administrador ve todo y puede todo", () => {
    expect(VIEW_ORDER.every((v) => canView(["ADMIN"], v))).toBe(true);
    expect([...WRITE_ACTIONS, ...ADMIN_ONLY].every((a) => can(["ADMIN"], a))).toBe(true);
    expect(canViewSettingsTab(["ADMIN"], "usuarios")).toBe(true);
  });

  it("el propietario ve todas las vistas de negocio pero no modifica nada", () => {
    expect(VIEW_ORDER.every((v) => canView(["OWNER"], v))).toBe(true);
    expect([...WRITE_ACTIONS, ...ADMIN_ONLY].some((a) => can(["OWNER"], a))).toBe(false);
    expect(canViewSettingsTab(["OWNER"], "usuarios")).toBe(false);
  });

  it("el operador atiende (Bandeja, solicitudes, reservas, clientes) pero no configura", () => {
    expect(WRITE_ACTIONS.every((a) => can(["OPERATOR"], a))).toBe(true);
    expect(ADMIN_ONLY.some((a) => can(["OPERATOR"], a))).toBe(false);
  });

  it("Soporte EYAQ no tiene vistas de negocio (el backend le responde 403)", () => {
    expect(VIEW_ORDER.some((v) => canView(["SUPPORT"], v))).toBe(false);
    expect(homePathFor(["SUPPORT"])).toBeNull();
  });

  it("con varios roles vale el permiso más amplio y se muestra el rol principal", () => {
    expect(can(["OWNER", "OPERATOR"], "conversation.send")).toBe(true);
    expect(primaryRole(["OPERATOR", "ADMIN"])).toBe("ADMIN");
    expect(primaryRole([])).toBeNull();
  });

  it("la primera vista permitida es el destino tras iniciar sesión", () => {
    expect(homePathFor(["OPERATOR"])).toBe("/bandeja");
    expect(viewFromPath("/ajustes/usuarios")).toBe("ajustes");
    expect(viewFromPath("/no-existe")).toBeNull();
  });
});
