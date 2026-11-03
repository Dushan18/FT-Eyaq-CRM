import { Suspense } from "react";
import type { Metadata } from "next";
import { ServiciosView } from "@/features/ajustes/servicios/servicios-view";

export const metadata: Metadata = { title: "Ajustes · Servicios · CRM Inteligente" };

export default function AjustesServiciosPage() {
  return (
    <Suspense fallback={null}>
      <ServiciosView />
    </Suspense>
  );
}
