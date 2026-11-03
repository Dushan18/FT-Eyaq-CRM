import { Suspense } from "react";
import type { Metadata } from "next";
import { SamantaView } from "@/features/ajustes/config/samanta-view";

export const metadata: Metadata = { title: "Ajustes · Samanta · CRM Inteligente" };

export default function AjustesSamantaPage() {
  return (
    <Suspense fallback={null}>
      <SamantaView />
    </Suspense>
  );
}
