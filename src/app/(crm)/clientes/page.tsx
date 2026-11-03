import { Suspense } from "react";
import type { Metadata } from "next";
import { ClientesView } from "@/features/clientes/clientes-view";

export const metadata: Metadata = { title: "Clientes · CRM Inteligente" };

export default function ClientesPage() {
  return (
    <Suspense fallback={null}>
      <ClientesView />
    </Suspense>
  );
}
