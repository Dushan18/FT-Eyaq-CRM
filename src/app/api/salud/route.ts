import { connection, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server/env";

/**
 * Salud del proceso (para el balanceador o Docker): responde si el servidor del frontend vive.
 * No consulta el backend; para eso está /api/listo. No expone datos ni secretos.
 */
export async function GET() {
  await connection();
  return NextResponse.json({ estado: "ok", modo: getServerEnv().mode }, { headers: { "cache-control": "no-store" } });
}
