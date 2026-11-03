import { Suspense } from "react";
import type { Metadata } from "next";
import { HorariosView } from "@/features/ajustes/config/horarios-view";

export const metadata: Metadata = { title: "Ajustes · Horarios · CRM Inteligente" };

export default function AjustesHorariosPage() {
  return (
    <Suspense fallback={null}>
      <HorariosView />
    </Suspense>
  );
}
