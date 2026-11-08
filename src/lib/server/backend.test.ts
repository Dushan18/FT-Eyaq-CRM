// @vitest-environment node
import { describe, expect, it } from "vitest";
import { backendTimeoutMs } from "./backend";

describe("techo de tiempo hacia bk-crm", () => {
  const drafts = "/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/assistant-drafts";

  it("da margen a la IA solo al generar un borrador de Samanta", () => {
    expect(backendTimeoutMs({ method: "POST", path: drafts }, 15_000)).toBe(65_000);
    expect(backendTimeoutMs({ method: "post", path: drafts }, 90_000)).toBe(90_000);
  });

  it("mantiene el techo general en el resto de rutas", () => {
    expect(backendTimeoutMs({ method: "GET", path: drafts }, 15_000)).toBe(15_000);
    expect(backendTimeoutMs({ method: "POST", path: `${drafts}/d1/approve` }, 15_000)).toBe(15_000);
    expect(backendTimeoutMs({ method: "POST", path: "/conversations/c1/messages" }, 15_000)).toBe(15_000);
  });
});
