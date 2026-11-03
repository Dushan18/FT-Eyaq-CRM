import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { backendFetch, BackendUnavailableError } from "@/lib/server/backend";
import { backendUnavailable, jsonError } from "@/lib/server/session";

const Schema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

/** Pide el enlace de recuperación. El backend responde igual exista o no el correo. */
export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Ingresa un correo válido.");

  try {
    const res = await backendFetch({
      method: "POST",
      path: "/auth/forgot-password",
      // Nota: el backend limita 3 solicitudes/min por IP. Detrás de este BFF todas llegan con la IP del
      // servidor Next.js, así que el límite es compartido hasta que el backend confíe en X-Forwarded-For.
      headers: { "content-type": "application/json" },
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
