import { Suspense } from "react";
import type { Metadata } from "next";
import { EmpresaView } from "@/features/ajustes/config/empresa-view";

export const metadata: Metadata = { title: "Ajustes · Empresa · CRM Inteligente" };

export default function AjustesEmpresaPage() {
  return (
    <Suspense fallback={null}>
      <EmpresaView />
    </Suspense>
  );
}
