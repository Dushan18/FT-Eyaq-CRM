import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarioView } from "@/features/calendario/calendario-view";

export const metadata: Metadata = { title: "Calendario · CRM Inteligente" };

export default function CalendarioPage() {
  return (
    <Suspense fallback={null}>
      <CalendarioView />
    </Suspense>
  );
}
