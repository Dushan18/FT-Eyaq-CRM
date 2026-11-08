// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toBackendPath } from "./proxy-path";

describe("rutas que el BFF reenvía a bk-crm", () => {
  it("reenvía las rutas de negocio y codifica cada segmento", () => {
    expect(toBackendPath(["conversations"])).toBe("/conversations");
    expect(toBackendPath(["conversations", "c1", "messages"])).toBe("/conversations/c1/messages");
    expect(toBackendPath(["auth", "me"])).toBe("/auth/me");
    expect(toBackendPath(["customers", "a b/c?d"])).toBe("/customers/a%20b%2Fc%3Fd");
  });

  it("bloquea las rutas de sesión y los webhooks", () => {
    for (const name of ["login", "refresh", "logout", "forgot-password", "reset-password", "test-admin"]) {
      expect(toBackendPath(["auth", name])).toBeNull();
    }
    expect(toBackendPath(["webhooks"])).toBeNull();
    expect(toBackendPath(["webhooks", "whatsapp"])).toBeNull();
  });

  it("bloquea aunque cambien las mayúsculas (Express no las distingue)", () => {
    expect(toBackendPath(["Auth", "Refresh"])).toBeNull();
    expect(toBackendPath(["AUTH", "LOGIN"])).toBeNull();
    expect(toBackendPath(["Webhooks", "WhatsApp"])).toBeNull();
  });

  it("rechaza segmentos que fetch normalizaría hacia otra ruta", () => {
    expect(toBackendPath(["conversations", "..", "auth", "refresh"])).toBeNull();
    expect(toBackendPath(["x", "..", "webhooks", "whatsapp"])).toBeNull();
    expect(toBackendPath(["conversations", ".", "c1"])).toBeNull();
    expect(toBackendPath(["auth", "", "login"])).toBeNull();
    expect(toBackendPath([])).toBeNull();
  });

  it("deja pasar segmentos que solo se parecen a un punto", () => {
    expect(toBackendPath(["customers", "...", "x"])).toBe("/customers/.../x");
    expect(toBackendPath(["customers", "%2e%2e"])).toBe("/customers/%252e%252e");
  });
});
