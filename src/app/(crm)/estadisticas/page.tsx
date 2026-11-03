import { Suspense } from "react";
import type { Metadata } from "next";
import { EstadisticasView } from "@/features/estadisticas/estadisticas-view";

export const metadata: Metadata = { title: "Estadísticas · CRM Inteligente" };

export default function EstadisticasPage() {
  return (
    <Suspense fallback={null}>
      <EstadisticasView />
    </Suspense>
  );
}
