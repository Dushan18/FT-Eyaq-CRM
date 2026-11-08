import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkAuthAttempt } from "@/lib/server/auth-limits";
import { backendFetch, BackendUnavailableError } from "@/lib/server/backend";
import { backendUnavailable, jsonError } from "@/lib/server/session";

const Schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  newPassword: z.string().min(8).max(72),
});

/** Restablece la contraseña con el token del correo. El backend cierra todas las sesiones del usuario. */
export async function POST(request: NextRequest) {
  const attempt = checkAuthAttempt(request, "reset-password");
  if (attempt.blocked) return attempt.blocked;

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "El enlace no es válido o la contraseña no cumple el largo (8 a 72 caracteres).");
  }

  try {
    const res = await backendFetch({
      method: "POST",
      path: "/auth/reset-password",
      headers: { "content-type": "application/json", ...attempt.forwardHeaders },
      body: JSON.stringify(parsed.data),
    });
    if (res.status === 429) {
      return jsonError(429, "Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.");
    }
    if (res.status === 400) {
      return jsonError(400, "El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.");
    }
    if (!res.ok) return jsonError(502, "No se pudo cambiar la contraseña. Inténtalo de nuevo.");
    return NextResponse.json({ message: "Contraseña restablecida correctamente." }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof BackendUnavailableError) return backendUnavailable(error.reason);
    throw error;
  }
}
