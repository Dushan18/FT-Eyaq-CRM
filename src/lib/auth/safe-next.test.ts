import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("ruta de regreso tras iniciar sesión", () => {
  it("acepta rutas internas con su query", () => {
    expect(safeNextPath("/bandeja")).toBe("/bandeja");
    expect(safeNextPath("/bandeja?c=6f1c2a4e&canal=whatsapp")).toBe("/bandeja?c=6f1c2a4e&canal=whatsapp");
    expect(safeNextPath("/ajustes/horarios#lunes")).toBe("/ajustes/horarios#lunes");
  });

  it("rechaza vacíos y rutas que no empiezan en /", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("bandeja")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rechaza todo lo que el navegador resolvería a otro sitio", () => {
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("/\t/evil.com")).toBeNull();
    expect(safeNextPath("/\n/evil.com")).toBeNull();
    expect(safeNextPath("/\r/evil.com")).toBeNull();
    expect(safeNextPath("/\u0000/evil.com")).toBeNull();
    expect(safeNextPath("/x\\..\\..\\/evil.com")).toBeNull();
  });

  it("no devuelve al login ni a la API, tampoco con rutas disfrazadas", () => {
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath("/login?next=/bandeja")).toBeNull();
    expect(safeNextPath("/api/backend/users")).toBeNull();
    expect(safeNextPath("/bandeja/../login")).toBeNull();
    expect(safeNextPath("/x/%2e%2e/api/backend/users")).toBeNull();
  });
});
