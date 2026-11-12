"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format/text";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DialogPlacement = "center" | "right";

/**
 * Diálogo modal accesible: foco inicial dentro (el elemento con `data-autofocus` o el primero enfocable),
 * Tab no sale del diálogo, Escape y el clic en el fondo cierran (salvo `busy`), y al cerrar el foco vuelve
 * a donde estaba. Se monta en `document.body`; solo existe mientras `open` es true.
 * Con `placement="right"` es un panel lateral de alto completo (la columna que no cabe en pantallas estrechas).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  size = "md",
  placement = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Mientras hay un guardado en curso no se cierra con Escape ni con el fondo. */
  busy?: boolean;
  size?: "sm" | "md" | "lg";
  placement?: DialogPlacement;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <DialogPanel onClose={onClose} title={title} description={description} footer={footer} busy={busy} size={size} placement={placement}>
      {children}
    </DialogPanel>,
    document.body,
  );
}

function DialogPanel({
  onClose,
  title,
  description,
  children,
  footer,
  busy,
  size,
  placement,
}: {
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy: boolean;
  size: "sm" | "md" | "lg";
  placement: DialogPlacement;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = panel.current;
    // Primero el elemento marcado; si no, el primer campo del contenido (no el botón «Cerrar» de la cabecera).
    // El panel lateral es para consultar: se enfoca el propio panel, para no abrir el teclado en el móvil.
    const target =
      root?.querySelector<HTMLElement>("[data-autofocus]") ??
      (placement === "right"
        ? root
        : (body.current?.querySelector<HTMLElement>(FOCUSABLE) ?? root?.querySelector<HTMLElement>(FOCUSABLE) ?? root));
    target?.focus();
    return () => previous?.focus();
    // `placement` no cambia mientras el diálogo está abierto.
  }, [placement]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busyRef.current) closeRef.current();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items.at(-1)!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-[rgba(14,24,56,.45)]",
        placement === "right" ? "flex justify-end" : "grid place-items-center p-3 sm:p-4",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busyRef.current) closeRef.current();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full flex-col overflow-hidden bg-white shadow-[0_20px_60px_rgba(14,24,56,.25)] outline-none",
          placement === "right"
            ? cn("h-dvh sm:rounded-l-2xl", size === "lg" ? "max-w-xl" : "max-w-sm")
            : cn("max-h-[min(90dvh,760px)] rounded-2xl", size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg"),
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-base font-bold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="m-0 mt-1 text-[12.5px] text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => !busyRef.current && closeRef.current()}
            disabled={busy}
            aria-label="Cerrar"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-lg text-muted hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        </header>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
