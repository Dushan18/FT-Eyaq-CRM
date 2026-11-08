import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkAuthAttempt } from "@/lib/server/auth-limits";
import { backendFetch, BackendUnavailableError } from "@/lib/server/backend";
import { getServerEnv } from "@/lib/server/env";
import { applyCookies, backendUnavailable, jsonError } from "@/lib/server/session";
import { sessionCookies } from "@/lib/server/tokens";
import type { LoginResponse } from "@/lib/api/types";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const attempt = checkAuthAttempt(request, "login");
  if (attempt.blocked) return attempt.blocked;

  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "Ingresa un correo válido y una contraseña de al menos 8 caracteres.");
  }

  let res: Response;
  try {
    res = await backendFetch({
      method: "POST",
      path: "/auth/login",
      headers: { "content-type": "application/json", ...attempt.forwardHeaders },
      body: JSON.stringify(parsed.data),
    });
  } catch (error) {
    if (error instanceof BackendUnavailableError) return backendUnavailable(error.reason);
    throw error;
  }

  // bk-crm limita los intentos de login por cuenta (5 por minuto).
  if (res.status === 429) {
    return jsonError(429, "Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      res.status === 401
        ? "Correo o contraseña incorrectos."
        : typeof body?.message === "string"
          ? body.message
          : "No se pudo iniciar sesión.";
    return jsonError(res.status === 401 || res.status === 400 ? res.status : 502, message);
  }

  const data = (await res.json()) as LoginResponse;
  const response = NextResponse.json({ user: data.user }, { status: 200, headers: { "cache-control": "no-store" } });
  return applyCookies(response, sessionCookies(data, env.cookieSecure));
}
