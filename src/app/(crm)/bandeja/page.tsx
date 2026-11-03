import { Suspense } from "react";
import type { Metadata } from "next";
import { BandejaView } from "@/features/bandeja/bandeja-view";

export const metadata: Metadata = { title: "Bandeja · CRM Inteligente" };

export default function BandejaPage() {
  return (
    <Suspense fallback={null}>
      <BandejaView />
    </Suspense>
  );
}
