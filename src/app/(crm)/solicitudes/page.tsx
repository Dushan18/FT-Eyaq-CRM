import { Suspense } from "react";
import type { Metadata } from "next";
import { SolicitudesView } from "@/features/solicitudes/solicitudes-view";

export const metadata: Metadata = { title: "Solicitudes · CRM Inteligente" };

export default function SolicitudesPage() {
  return (
    <Suspense fallback={null}>
      <SolicitudesView />
    </Suspense>
  );
}
