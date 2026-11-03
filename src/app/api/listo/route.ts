import { connection, NextResponse } from "next/server";
import { backendFetch, BackendUnavailableError } from "@/lib/server/backend";
import { getServerEnv } from "@/lib/server/env";

/**
 * Listo para atender: el backend (bk-crm) responde GET /health con su base de datos arriba.
 * 200 si está listo; 503 si el backend no responde o informa un problema ("no se pudo", nunca "no hay").
 */
export async function GET() {
  await connection();
  const headers = { "cache-control": "no-store" };
  if (getServerEnv().mode === "mock") {
    return NextResponse.json({ estado: "ok", backend: "simulado" }, { headers });
  }
  try {
    const res = await backendFetch({ method: "GET", path: "/health" });
    if (res.ok) return NextResponse.json({ estado: "ok", backend: "disponible" }, { headers });
    return NextResponse.json({ estado: "error", backend: `respondió ${res.status}` }, { status: 503, headers });
  } catch (error) {
    const motivo = error instanceof BackendUnavailableError ? error.reason : "error";
    return NextResponse.json({ estado: "error", backend: "no disponible", motivo }, { status: 503, headers });
  }
}
