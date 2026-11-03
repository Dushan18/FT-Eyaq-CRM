"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import { qk } from "@/lib/api/query-keys";
import type { RestaurantConfig } from "@/lib/api/types";
import type { SettingsTab } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session";
import { useRestaurant } from "@/lib/restaurant";
import { cn } from "@/lib/format/text";
import { Button } from "@/components/ui/primitives";
import { ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import { settingsTabLink } from "../shell/settings-tabs";
import { backendMessageTabs } from "./config-schema";
import type { ConfigSave } from "./use-config-save";

export const READ_ONLY_TEXT = "Solo un administrador puede modificar la configuración.";
export const NOT_CONFIGURED_TEXT = "El restaurante aún no está configurado. Pide a un administrador que complete Ajustes.";

/** Raíz de cada pestaña: misma separación (20 px) que la columna del marco. */
export function TabBody({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-5">{children}</div>;
}

/** Título de la pestaña (17 px, 700). */
export function TabTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-[17px] font-bold">{children}</h2>;
}

/** Tarjeta de Samanta: borde #e8ebf0, radio 16, padding 20, separación 14. */
export function SettingsCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3.5 rounded-2xl border border-card p-5", className)}>
      <h3 className="m-0 text-sm font-bold">{title}</h3>
      {children}
    </section>
  );
}

/** Nota breve (12 px, gris tenue) para reglas del backend o lo que aún no existe en él. */
export function PendingNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("m-0 text-xs text-subtle", className)}>{children}</p>;
}

/** Enlace dentro de un aviso: conserva el color del aviso (el global de `a` lo pintaría de azul). */
function NoticeLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold underline" style={{ color: "inherit" }}>
      {children}
    </Link>
  );
}

export function ReadOnlyNotice() {
  return <InlineNotice>{READ_ONLY_TEXT}</InlineNotice>;
}

/**
 * Carga de la configuración compartida (`qk.config`): distingue cargando, sin configurar (404) y
 * error de consulta (con Reintentar). `setup` reemplaza el aviso de 404 (formulario inicial de ADMIN).
 */
export function ConfigGate({ children, setup }: { children: (config: RestaurantConfig) => ReactNode; setup?: ReactNode }) {
  const restaurant = useRestaurant();
  const session = useSession();
  const queryClient = useQueryClient();

  if (restaurant.config) return <>{children(restaurant.config)}</>;
  if (restaurant.missing) {
    if (setup) return <>{setup}</>;
    return (
      <InlineNotice tone="warning">
        {session.can("config.edit") ? (
          <>
            El restaurante aún no está configurado. Complétalo primero en <NoticeLink href="/ajustes/empresa">Empresa</NoticeLink>.
          </>
        ) : (
          NOT_CONFIGURED_TEXT
        )}
      </InlineNotice>
    );
  }
  if (restaurant.error) {
    return (
      <ErrorState
        error={restaurant.error}
        subject="la configuración del restaurante"
        onRetry={() => void queryClient.refetchQueries({ queryKey: qk.config })}
      />
    );
  }
  return <LoadingState label="Cargando la configuración…" />;
}

function SaveError({ error, tab }: { error: unknown; tab: SettingsTab }) {
  const messages = error instanceof ApiError ? error.messages : [error instanceof Error ? error.message : "Error desconocido."];
  // Como el PUT reenvía toda la configuración, el problema puede estar en otra pestaña.
  const elsewhere = backendMessageTabs(messages).filter((t) => t !== tab);
  return (
    <InlineNotice tone="error">
      <div className="font-semibold">No se pudieron guardar los cambios.</div>
      {messages.length === 1 ? (
        <div>{messages[0]}</div>
      ) : (
        <ul className="m-0 mt-1 pl-4">
          {messages.map((message, i) => (
            <li key={`${i}-${message}`}>{message}</li>
          ))}
        </ul>
      )}
      {elsewhere.length > 0 ? (
        <div className="mt-1">
          Revisa{" "}
          {elsewhere.map((t, i) => (
            <Fragment key={t}>
              {i > 0 ? ", " : null}
              <NoticeLink href={settingsTabLink(t).href}>{settingsTabLink(t).label}</NoticeLink>
            </Fragment>
          ))}
          .
        </div>
      ) : null}
    </InlineNotice>
  );
}

/** Avisos y botones de guardado: se habilitan solo si hay cambios. */
export function SaveArea({
  save,
  tab,
  dirty,
  invalid,
  onDiscard,
  submitLabel = "Guardar cambios",
  alwaysSubmittable = false,
}: {
  save: ConfigSave;
  /** Pestaña que guarda (para señalar otras pestañas en los errores del backend). */
  tab: SettingsTab;
  dirty: boolean;
  /** Hay errores de validación en el formulario. */
  invalid: boolean;
  onDiscard: () => void;
  submitLabel?: string;
  /** La configuración inicial se puede enviar aunque no haya cambios (así muestra qué falta). */
  alwaysSubmittable?: boolean;
}) {
  const pending = save.isPending;
  const created = save.variables?.mode === "create";
  return (
    <div className="flex flex-col gap-3">
      {invalid ? <InlineNotice tone="error">Revisa los campos marcados.</InlineNotice> : null}
      {save.isError ? <SaveError error={save.error} tab={tab} /> : null}
      {save.isSuccess && !dirty ? (
        <InlineNotice>
          {created ? (
            <>
              Configuración guardada. Los 7 días quedaron cerrados: ajústalos en{" "}
              <NoticeLink href="/ajustes/horarios">Horarios</NoticeLink>.
            </>
          ) : (
            "Cambios guardados"
          )}
        </InlineNotice>
      ) : null}
      <div className="flex items-center gap-2.5">
        <Button type="submit" className="h-9 px-3.5" disabled={(!dirty && !alwaysSubmittable) || pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
        <Button variant="outline" className="h-9 px-3.5" disabled={!dirty || pending} onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

/** Lleva el foco al primer campo con error tras validar. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
