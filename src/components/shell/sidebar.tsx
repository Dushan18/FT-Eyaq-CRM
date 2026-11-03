"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { ROLE_LABELS, VIEW_LABELS, VIEW_ORDER, VIEW_PATHS, primaryRole, type ViewKey } from "@/lib/auth/permissions";
import { initials, personName } from "@/lib/format/text";

/** Íconos del mockup (trazos de 24 × 24). */
const ICONS: Record<ViewKey, string> = {
  bandeja: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  solicitudes: "M9 11l2 2 4-4M5 4h14v16H5z",
  calendario: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  estadisticas: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  clientes: "M16 20v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
};

export function Sidebar() {
  const pathname = usePathname();
  const session = useSession();
  const views = VIEW_ORDER.filter((v) => session.canView(v));

  return (
    <nav aria-label="Navegación principal" className="flex flex-col items-center gap-1.5 rounded-[20px] bg-navy py-[18px]">
      <div
        aria-hidden="true"
        className="mb-[18px] grid size-[38px] place-items-center rounded-full"
        style={{ background: "conic-gradient(#f26a1b 0 30%,#1f9d55 0 55%,#2b55e6 0 100%)" }}
      >
        <div className="size-4 rounded-full bg-navy" />
      </div>
      {views.map((view) => {
        const href = VIEW_PATHS[view];
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={view}
            href={href}
            title={VIEW_LABELS[view]}
            aria-current={active ? "page" : undefined}
            className="flex w-[52px] flex-col items-center gap-1 rounded-xl pb-1.5 pt-2 no-underline transition-colors hover:bg-white/[.08]"
            style={{ background: active ? "rgba(255,255,255,.12)" : undefined, color: active ? "#fff" : "#9aa6c8" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONS[view]} />
            </svg>
            <span className="text-[9.5px] font-semibold tracking-[.01em]">{VIEW_LABELS[view]}</span>
          </Link>
        );
      })}
      <div className="flex-1" />
      <UserMenu />
    </nav>
  );
}

function UserMenu() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = session.user;
  const name = user ? personName(user.firstName, user.lastName) : "";
  const role = primaryRole(session.roles);

  // El menú es transitorio: se cierra al ocultar la ruta (Activity) y al hacer clic fuera.
  useLayoutEffect(() => () => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Cuenta de ${name}` : "Cuenta"}
        title={user ? `${name} · ${role ? ROLE_LABELS[role] : "Sin rol"}` : "Cuenta"}
        className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-brand text-xs font-bold text-white"
      >
        {user ? initials(name) : "·"}
      </button>
      {open && user ? (
        <div role="menu" className="absolute bottom-0 left-[46px] z-20 w-60 rounded-2xl border border-card bg-white p-3 shadow-[0_8px_24px_rgba(14,24,56,.18)]">
          <div className="px-1 pb-2">
            <div className="truncate text-[13.5px] font-bold text-ink">{name}</div>
            <div className="truncate text-xs text-subtle">{user.email}</div>
            <div className="mt-1 text-xs font-semibold text-slate">{role ? ROLE_LABELS[role] : "Sin rol asignado"}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void session.logout()}
            className="h-9 w-full cursor-pointer rounded-[10px] border border-button bg-white text-[13px] font-semibold text-ink-2 hover:bg-surface"
          >
            Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}
