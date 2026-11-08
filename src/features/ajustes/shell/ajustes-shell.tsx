"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { canViewSettingsTab } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/format/text";
import { Panel } from "@/components/ui/primitives";
import { NoAccess } from "@/components/ui/state";
import { settingsTabFromPath, settingsTabLink, visibleSettingsTabs } from "./settings-tabs";

/**
 * Marco de Ajustes (sección blanca del mockup): pestañas a la izquierda y la pestaña activa a la
 * derecha. Mientras carga la sesión la pestaña se monta igual (el marco del CRM la oculta) para que
 * Next.js pueda prerenderizarla; con la sesión lista, una pestaña no permitida muestra NoAccess.
 */
export function AjustesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const tabs = visibleSettingsTabs(session.roles);
  const current = settingsTabFromPath(pathname);
  const blocked = session.status === "ready" && current !== null && !canViewSettingsTab(session.roles, current);

  return (
    <Panel className="grid h-full content-start gap-5 overflow-y-auto px-4 py-5 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-7 lg:px-8 lg:py-7">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 mb-3 text-[22px] font-bold sm:text-2xl">Ajustes</h1>
        {/* En pantallas estrechas las secciones van en una fila que se desplaza en horizontal. */}
        <nav aria-label="Secciones de Ajustes" className="relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:p-0">
          {tabs.map((tab) => {
            const active = tab.key === current;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9.5 shrink-0 items-center whitespace-nowrap rounded-[10px] px-3 text-[13.5px] font-semibold no-underline transition-colors",
                  active ? "bg-brand-soft" : "hover:bg-surface",
                )}
                // Color en línea: la regla global de `a` (sin capa) se impone a las utilidades de Tailwind.
                style={{ color: active ? "#1f3fbf" : "#3b4560" }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex min-w-0 max-w-190 flex-col gap-5 md:pt-12.5">
        {blocked ? <NoAccess view={settingsTabLink(current).label} /> : children}
      </div>
    </Panel>
  );
}
