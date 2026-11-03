import { Suspense, type ReactNode } from "react";
import { AjustesShell } from "@/features/ajustes/shell/ajustes-shell";

/** Marco común de las pestañas de Ajustes (usa usePathname: va dentro de Suspense por Cache Components). */
export default function AjustesLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AjustesShell>{children}</AjustesShell>
    </Suspense>
  );
}
