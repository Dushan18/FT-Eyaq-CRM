"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { SessionProvider, useSession } from "@/lib/auth/session";
import { VIEW_LABELS, homePathFor, viewFromPath } from "@/lib/auth/permissions";
import { ErrorState, LoadingState, NoAccess } from "@/components/ui/state";
import { Sidebar } from "./sidebar";

export function CrmShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ShellFrame>{children}</ShellFrame>
    </SessionProvider>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center rounded-[20px] bg-white p-8 text-center">{children}</div>;
}

/**
 * Marco del mockup: 100vh, mínimo 1240 × 720, navegación de 76 px y contenido.
 * La vista siempre se renderiza (aunque oculta mientras carga la sesión) para que Next.js pueda
 * prerenderizar y validar el segmento; si el rol no tiene la vista, no se monta.
 */
function ShellFrame({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const view = viewFromPath(pathname);
  const home = homePathFor(session.roles);
  const ready = session.status === "ready";
  const allowed = view ? session.canView(view) : true;

  // Una ruta no permitida lleva a la primera vista habilitada del rol.
  useEffect(() => {
    if (ready && !allowed && home) router.replace(home);
  }, [ready, allowed, home, router]);

  let overlay: ReactNode = null;
  if (session.status === "loading") {
    overlay = (
      <Centered>
        <LoadingState label="Cargando tu sesión…" />
      </Centered>
    );
  } else if (session.status === "error") {
    overlay = (
      <Centered>
        <ErrorState error={session.error} subject="tu sesión" onRetry={session.retry} />
      </Centered>
    );
  } else if (!home) {
    overlay = (
      <Centered>
        <div className="max-w-md">
          <div className="text-[17px] font-bold">Tu rol no tiene vistas habilitadas</div>
          <p className="mt-2 text-[13.5px] text-muted">
            El backend no permite a este rol consultar conversaciones, solicitudes, reservas ni clientes. Pide a un
            administrador que revise tus roles.
          </p>
        </div>
      </Centered>
    );
  } else if (!allowed) {
    overlay = <NoAccess view={view ? VIEW_LABELS[view] : "esta vista"} />;
  }

  const mountView = !ready || allowed;

  return (
    <div className="grid h-screen min-h-[720px] min-w-[1240px] grid-cols-[76px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 p-4">
      <Sidebar />
      <div className="min-h-0 min-w-0">
        {overlay}
        {mountView ? (
          <div className="h-full min-h-0" hidden={overlay !== null}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
