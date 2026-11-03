// @vitest-environment node
/**
 * Sesión del BFF contra el backend simulado (misma rotación de un solo uso que bk-crm).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/mock/seed";
import { handleMockRequest } from "@/lib/mock/server";
import { resetStore } from "@/lib/mock/store";
import { proxyWithSession, refreshSession } from "./session";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./tokens";

async function backend(path: string, body: unknown, accessToken?: string) {
  return handleMockRequest({
    method: "POST",
    path,
    search: "",
    headers: { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function login(): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await backend("/auth/login", { email: "camila@sabormagico.pe", password: "demo1234" });
  return (await res.json()) as { accessToken: string; refreshToken: string };
}

function browserRequest(cookies: Record<string, string>) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest("http://localhost:5173/api/backend/auth/me", { headers: cookie ? { cookie } : {} });
}

beforeEach(() => resetStore(() => buildSeed()));

describe("renovación del token", () => {
  it("el backend rechaza un refresh token ya usado (rotación de un solo uso)", async () => {
    const { refreshToken } = await login();
    expect((await backend("/auth/refresh", { refreshToken })).status).toBe(201);
    expect((await backend("/auth/refresh", { refreshToken })).status).toBe(401);
  });

  it("varias peticiones simultáneas comparten una sola renovación y las rezagadas reciben el mismo resultado", async () => {
    const { refreshToken } = await login();
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => refreshSession(refreshToken)));
    expect(outcomes.every((o) => o.kind === "ok")).toBe(true);
    const issued = new Set(outcomes.map((o) => (o.kind === "ok" ? o.tokens.refreshToken : "")));
    expect(issued.size).toBe(1);
    expect(await refreshSession(refreshToken)).toEqual(outcomes[0]);
  });

  it("un token rechazado cierra la sesión (no se confunde con un backend caído)", async () => {
    expect(await refreshSession("token-invalido")).toEqual({ kind: "invalid" });
  });
});

describe("proxy con sesión", () => {
  it("sin cookies responde NO_SESSION sin llamar al backend", async () => {
    const res = await proxyWithSession(browserRequest({}), { method: "GET", path: "/auth/me" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "NO_SESSION" });
  });

  it("con solo el refresh token renueva, responde y guarda las cookies nuevas", async () => {
    const { refreshToken } = await login();
    const res = await proxyWithSession(browserRequest({ [REFRESH_COOKIE]: refreshToken }), { method: "GET", path: "/auth/me" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: "camila@sabormagico.pe" });
    const access = res.cookies.get(ACCESS_COOKIE);
    const refresh = res.cookies.get(REFRESH_COOKIE);
    expect(access?.value).toBeTruthy();
    expect(refresh?.value).toBeTruthy();
    expect(refresh?.value).not.toBe(refreshToken);
    expect(refresh?.httpOnly).toBe(true);
  });

  it("una sesión cerrada en el backend termina la sesión del navegador y borra las cookies", async () => {
    const tokens = await login();
    await backend("/auth/logout", {}, tokens.accessToken);
    const res = await proxyWithSession(
      browserRequest({ [ACCESS_COOKIE]: tokens.accessToken, [REFRESH_COOKIE]: tokens.refreshToken }),
      { method: "GET", path: "/auth/me" },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "SESSION_EXPIRED" });
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });
});
