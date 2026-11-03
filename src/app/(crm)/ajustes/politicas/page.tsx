import { Suspense } from "react";
import type { Metadata } from "next";
import { PoliticasView } from "@/features/ajustes/config/politicas-view";

export const metadata: Metadata = { title: "Ajustes · Políticas · CRM Inteligente" };

export default function AjustesPoliticasPage() {
  return (
    <Suspense fallback={null}>
      <PoliticasView />
    </Suspense>
  );
}
