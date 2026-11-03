import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "demo1234";
export const USERS = {
  admin: "frank@eyaqsystems.com",
  owner: "ricardo@sabormagico.pe",
  operator: "camila@sabormagico.pe",
  support: "soporte@eyaqsystems.com",
} as const;

/** Inicia sesión por el BFF (deja las cookies httpOnly en el contexto del navegador). */
export async function loginAs(page: Page, email: string) {
  const res = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(res.ok(), `login de ${email}`).toBeTruthy();
}

/** Acción del simulador de canales (solo modo mock). */
export async function simulate<T = Record<string, unknown>>(request: APIRequestContext, action: Record<string, unknown>): Promise<T> {
  const res = await request.post("/api/dev/simulador", { data: action });
  const body = await res.json();
  expect(res.ok(), `simulador ${String(action.accion)}: ${JSON.stringify(body)}`).toBeTruthy();
  return body as T;
}

/** Día (YYYY-MM-DD) en la zona del restaurante, a `daysAhead` días de hoy. Lima no tiene horario de verano. */
export function limaDay(daysAhead: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Nombre único para no chocar con otras pruebas que comparten el servidor. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/** Junta los errores de consola de la página para comprobar que una vista carga limpia. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}
