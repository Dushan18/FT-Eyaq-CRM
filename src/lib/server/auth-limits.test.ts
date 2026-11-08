// @vitest-environment node
/**
 * Límite por IP en el login del BFF y reenvío de esa IP a bk-crm (con CRM_TRUST_PROXY=1).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendRequest } from "./backend";

const env = vi.hoisted(() => ({ trustProxyHops: 1 }));

vi.mock("./env", () => ({
  getServerEnv: () => ({
    mode: "live",
    backendUrl: "http://bk-crm.test",
    backendTimeoutMs: 15_000,
    cookieSecure: false,
    mockPassword: "demo1234",
    simulatorEnabled: false,
    trustProxyHops: env.trustProxyHops,
  }),
}));

const backendFetch = vi.hoisted(() =>
  vi.fn<(req: BackendRequest) => Promise<Response>>(async () =>
    Response.json({ statusCode: 401, message: "Correo o contraseña incorrectos" }, { status: 401 }),
  ),
);

vi.mock("./backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./backend")>()),
  backendFetch,
}));

const { POST } = await import("@/app/api/auth/login/route");

let nextIp = 1;
/** Cada prueba usa una IP propia: los límites viven en memoria del módulo. */
function freshIp() {
  nextIp += 1;
  return `203.0.113.${nextIp}`;
}

function loginRequest(xff: string, email = "ana@sabormagico.pe") {
  return new NextRequest("http://localhost:5173/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": xff },
    body: JSON.stringify({ email, password: "incorrecta1" }),
  });
}

beforeEach(() => {
  env.trustProxyHops = 1;
  backendFetch.mockClear();
});

describe("límite de intentos de login por IP", () => {
  it("reenvía a bk-crm la IP del navegador, no la que el navegador escribió", async () => {
    const ip = freshIp();
    await POST(loginRequest(`9.9.9.9, ${ip}`));
    expect(backendFetch).toHaveBeenCalledTimes(1);
    expect(backendFetch.mock.calls[0]![0].headers).toMatchObject({ "x-forwarded-for": ip });
  });

  it("tras 20 intentos desde la misma IP responde 429 sin consultar a bk-crm, aunque cambie la cuenta", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i += 1) {
      expect((await POST(loginRequest(ip, `cuenta${i}@sabormagico.pe`))).status).toBe(401);
    }
    backendFetch.mockClear();

    const blocked = await POST(loginRequest(ip, "otra@sabormagico.pe"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await blocked.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(backendFetch).not.toHaveBeenCalled();

    // Otra conexión no se ve afectada.
    expect((await POST(loginRequest(freshIp()))).status).toBe(401);
  });

  it("sin CRM_TRUST_PROXY no limita por IP ni reenvía X-Forwarded-For", async () => {
    env.trustProxyHops = 0;
    const ip = freshIp();
    for (let i = 0; i < 25; i += 1) {
      expect((await POST(loginRequest(ip))).status).toBe(401);
    }
    expect(backendFetch.mock.calls.every(([req]) => !("x-forwarded-for" in (req.headers ?? {})))).toBe(true);
  });
});
