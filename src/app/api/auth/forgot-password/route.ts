import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkAuthAttempt } from "@/lib/server/auth-limits";
import { backendFetch, BackendUnavailableError } from "@/lib/server/backend";
import { backendUnavailable, jsonError } from "@/lib/server/session";

const Schema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

/** Pide el enlace de recuperación. El backend responde igual exista o no el correo. */
export async function POST(request: NextRequest) {
  const attempt = checkAuthAttempt(request, "forgot-password");
  if (attempt.blocked) return attempt.blocked;

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Ingresa un correo válido.");

  try {
    const res = await backendFetch({
      method: "POST",
      path: "/auth/forgot-password",
      // El backend limita 3 solicitudes/min por cuenta y por IP (la del navegador si se reenvía y
      // bk-crm tiene TRUST_PROXY; si no, la de este BFF): un usuario no agota el cupo de los demás.
      headers: { "content-type": "application/json", ...attempt.forwardHeaders },
      body: JSON.stringify(parsed.data),
    });
    if (res.status === 429) {
      return jsonError(429, "Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.");
    }
    if (!res.ok) return jsonError(502, "No se pudo enviar el enlace. Inténtalo de nuevo.");
    return NextResponse.json(
      { message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña." },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof BackendUnavailableError) return backendUnavailable(error.reason);
    throw error;
  }
}
