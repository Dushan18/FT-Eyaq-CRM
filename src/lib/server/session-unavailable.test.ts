// @vitest-environment node
/**
 * Método Eyaq: "no se pudo" no es "no hay". Si el backend no responde al renovar, la sesión NO se
 * cierra: el usuario ve que el servidor no está disponible y conserva sus cookies.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { proxyWithSession, refreshSession } from "./session";
import { REFRESH_COOKIE } from "./tokens";

vi.mock("./backend", async (importOriginal) => {
  const original = await importOriginal<typeof import("./backend")>();
  return {
    ...original,
    backendFetch: vi.fn(async () => {
      throw new original.BackendUnavailableError("network");
    }),
  };
});

describe("backend caído", () => {
  it("la renovación informa «no disponible», no «sesión inválida»", async () => {
    expect(await refreshSession("cualquier-token-1")).toEqual({ kind: "unavailable" });
  });

  it("el proxy responde 503 y no borra las cookies de sesión", async () => {
    const request = new NextRequest("http://localhost:5173/api/backend/auth/me", {
      headers: { cookie: `${REFRESH_COOKIE}=cualquier-token-2` },
    });
    const res = await proxyWithSession(request, { method: "GET", path: "/auth/me" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "BACKEND_UNAVAILABLE" });
    expect(res.cookies.get(REFRESH_COOKIE)).toBeUndefined();
  });
});
