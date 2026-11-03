import { connection, NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/server/env";
import { jsonError } from "@/lib/server/session";
import { runSimulator, simulatorSnapshot, SimulatorError, type SimulatorAction } from "@/lib/mock/simulator";

/**
 * Simulador de canales para desarrollo (solo CRM_BACKEND_MODE=mock y CRM_ENABLE_SIMULATOR≠false).
 * GET  → ids disponibles.  POST → ejecuta una acción. Ver README («Simulador de canales»).
 */
function disabled() {
  return jsonError(404, "El simulador solo está disponible en modo mock.");
}

export async function GET() {
  // El estado simulado cambia en cada petición: nunca se prerenderiza en el build.
  await connection();
  if (!getServerEnv().simulatorEnabled) return disabled();
  return NextResponse.json(simulatorSnapshot(), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!getServerEnv().simulatorEnabled) return disabled();
  const action = (await request.json().catch(() => null)) as SimulatorAction | null;
  if (!action || typeof action !== "object" || !("accion" in action)) {
    return jsonError(400, 'Envía {"accion": "entrante" | "samanta" | "solicitud" | "dueno" | "reiniciar", ...}.');
  }
  try {
    return NextResponse.json(runSimulator(action), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SimulatorError) return jsonError(400, error.message);
    throw error;
  }
}
