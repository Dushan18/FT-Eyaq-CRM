import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/format/text";

/**
 * Estados de una consulta. Regla: distinguir "no hay datos" (EmptyState) de "no se pudo consultar"
 * (ErrorState). Una falla de conexión nunca se muestra como lista vacía.
 */

export function LoadingState({ label = "Cargando…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-subtle", className)}>
      <span className="size-3.5 animate-spin rounded-full border-2 border-field border-t-brand" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ children, className, dashed = false }: { children: ReactNode; className?: string; dashed?: boolean }) {
  return (
    <div
      className={cn(
        "px-4.5 py-7.5 text-center text-[13px] text-subtle",
        dashed && "rounded-[14px] border border-dashed border-dashed-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function errorText(error: unknown, subject = "la información"): { title: string; detail: string | null } {
  if (error instanceof ApiError) {
    if (error.isUnavailable) return { title: `No se pudo cargar ${subject}.`, detail: error.messages[0] ?? null };
    if (error.isForbidden) return { title: "Tu rol no tiene acceso a esta información.", detail: null };
    if (error.isNotFound) return { title: "No se encontró lo solicitado.", detail: error.messages[0] ?? null };
    return { title: `No se pudo cargar ${subject}.`, detail: error.messages.join(" ") };
  }
  return { title: `No se pudo cargar ${subject}.`, detail: error instanceof Error ? error.message : null };
}

export function ErrorState({
  error,
  subject,
  onRetry,
  className,
}: {
  error: unknown;
  subject?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { title, detail } = errorText(error, subject);
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 px-4 py-8 text-center", className)}>
      <div className="text-[13.5px] font-semibold text-[#b42323]">{title}</div>
      {detail ? <div className="max-w-md text-[12.5px] text-muted">{detail}</div> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 h-8 cursor-pointer rounded-lg border border-button bg-white px-3 text-[12.5px] font-semibold text-brand hover:bg-brand-soft"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

/** Aviso en línea (por ejemplo, error de una acción o datos parciales). */
export function InlineNotice({ tone = "info", children }: { tone?: "info" | "warning" | "error"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "bg-[#fdecec] text-[#b42323]"
      : tone === "warning"
        ? "bg-[#fff1e6] text-[#b14a0b]"
        : "bg-surface text-muted";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-[10px] px-3 py-2 text-[12.5px] leading-[1.45]", styles)}>
      {children}
    </div>
  );
}

export function NoAccess({ view }: { view: string }) {
  return (
    <div className="grid h-full place-items-center rounded-[20px] bg-white p-8 text-center">
      <div className="max-w-sm">
        <div className="text-[17px] font-bold">Sin acceso a {view}</div>
        <p className="mt-2 text-[13.5px] text-muted">
          Tu rol no tiene permiso para esta vista. Si lo necesitas, pide a un administrador que revise tus roles.
        </p>
      </div>
    </div>
  );
}
