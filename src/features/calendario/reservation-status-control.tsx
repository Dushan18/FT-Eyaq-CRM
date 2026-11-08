"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { Reservation, ReservationStatusTarget } from "@/lib/api/types";
import { RESERVATION_FINAL_STATUSES } from "@/lib/api/types";
import { RESERVATION_STATUS } from "@/lib/domain/statuses";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/format/text";
import { InlineNotice } from "@/components/ui/state";
import { prepareAction } from "./calendar-utils";
import { storeReservation } from "./reservation-cache";
import { actionErrorText, shouldRefreshAfter, statusActions, waitsForArrival, type StatusAction } from "./reservation-actions";

const BUTTON_BASE =
  "cursor-pointer rounded-[10px] text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const TONE_CLASS: Record<StatusAction["tone"], string> = {
  primary: "h-10.5 w-full rounded-xl border-0 bg-brand text-[13.5px] font-bold text-white hover:bg-brand-hover",
  secondary: "h-9 flex-1 border border-button bg-white px-3 text-ink-2 hover:bg-[#f5f7fa]",
  danger: "h-9 flex-1 border border-[#f0c4c4] bg-white px-3 text-[#b42323] hover:bg-[#fdecec]",
};

type FocusTarget = "confirm" | "back" | "group" | `action:${ReservationStatusTarget}`;

/**
 * Cambios de estado (PATCH /reservations/:id/status) con los botones que permite
 * `RESERVATION_STATUS_TRANSITIONS[status]`. «Iniciar servicio» y «No asistió» se habilitan a la hora de la
 * reserva. «Marcar como preparada» y los estados finales (completada, cancelada, no asistió) piden
 * confirmación en línea.
 */
export function StatusControl({
  reservation,
  canWrite,
  onSaved,
}: {
  reservation: Reservation;
  canWrite: boolean;
  /** Respuesta del PATCH: el panel la muestra ya, antes de que se vuelva a leer el detalle. */
  onSaved: (updated: Reservation) => void;
}) {
  const queryClient = useQueryClient();
  const now = useNow();
  const [confirming, setConfirming] = useState<ReservationStatusTarget | null>(null);
  const [done, setDone] = useState<Reservation | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<FocusTarget | null>(null);

  const mutation = useMutation({
    mutationFn: (target: ReservationStatusTarget) => reservationsApi.setStatus(reservation.id, target),
    onSuccess: (updated) => {
      storeReservation(queryClient, updated, { stats: true });
      onSaved(updated);
      setDone(updated);
      focusNext.current = "group";
      setConfirming(null);
    },
    onError: (error, target) => {
      setDone(null);
      focusNext.current = confirming ? "confirm" : `action:${target}`;
      // 409/403: otra persona pudo cambiar la reserva; se muestra el estado actual.
      if (shouldRefreshAfter(error)) void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
    },
  });
  const { reset } = mutation;

  // Al ocultarse la vista (Activity) no deben quedar abiertos la confirmación ni un aviso viejo.
  useLayoutEffect(
    () => () => {
      setConfirming(null);
      setDone(null);
      reset();
    },
    [reset],
  );

  // Lleva el foco al control que reemplaza al que se usó, para no perderlo. Espera a que exista y esté
  // habilitado: mientras se guarda los botones siguen deshabilitados.
  useEffect(() => {
    const target = focusNext.current;
    const root = groupRef.current;
    const element = !target || !root ? null : target === "group" ? root : root.querySelector<HTMLElement>(`[data-focus="${target}"]`);
    if (!element || (element instanceof HTMLButtonElement && element.disabled)) return;
    element.focus();
    focusNext.current = null;
  });

  const actions = statusActions(reservation, canWrite, now);
  const prepared = prepareAction(reservation.status, canWrite) === "prepared";
  const pending = mutation.isPending;
  const confirmAction = confirming ? actions.find((a) => a.target === confirming) : undefined;
  const isFinal = RESERVATION_FINAL_STATUSES.includes(reservation.status);

  const run = (action: StatusAction) => {
    reset();
    setDone(null);
    if (action.confirm) {
      focusNext.current = "back";
      setConfirming(action.target);
    } else {
      mutation.mutate(action.target);
    }
  };
  const back = () => {
    reset();
    focusNext.current = confirming ? `action:${confirming}` : null;
    setConfirming(null);
  };

  const primary = actions.filter((a) => a.tone === "primary");
  const others = actions.filter((a) => a.tone !== "primary");
  const actionButton = (action: StatusAction) => (
    <button
      key={action.target}
      data-focus={`action:${action.target}`}
      type="button"
      onClick={() => run(action)}
      disabled={!action.enabled || pending}
      title={action.enabled ? undefined : "Disponible a partir de la hora de la reserva"}
      className={cn(BUTTON_BASE, TONE_CLASS[action.tone])}
    >
      {pending && mutation.variables === action.target ? "Guardando…" : action.label}
    </button>
  );

  return (
    <div ref={groupRef} tabIndex={-1} className="flex flex-col gap-2 outline-none">
      {prepared ? (
        <div className="grid h-10.5 place-items-center rounded-xl bg-[#e8f6ee] text-[13.5px] font-bold text-[#14753f]">
          <span>
            Preparada <span aria-hidden="true">✓</span>
          </span>
        </div>
      ) : null}

      {confirmAction ? (
        <div
          role="group"
          aria-label={`Confirmar: ${confirmAction.label}`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) {
              event.stopPropagation();
              back();
            }
          }}
          className="flex flex-col gap-2.5 rounded-xl border border-card bg-surface p-3"
        >
          <p className="m-0 text-[13px] font-semibold leading-[1.45] text-ink">{confirmAction.confirm}</p>
          <div className="flex gap-2">
            <button
              data-focus="confirm"
              type="button"
              onClick={() => mutation.mutate(confirmAction.target)}
              disabled={pending}
              className={cn(
                BUTTON_BASE,
                "h-9 flex-1 border-0 font-bold text-white",
                confirmAction.tone === "danger" ? "bg-[#b42323] hover:bg-[#9b1c1c]" : "bg-brand hover:bg-brand-hover",
              )}
            >
              {pending ? "Guardando…" : "Confirmar"}
            </button>
            <button
              data-focus="back"
              type="button"
              onClick={back}
              disabled={pending}
              className={cn(BUTTON_BASE, "h-9 flex-1 border border-button bg-white text-ink-2 hover:bg-[#f5f7fa]")}
            >
              Volver
            </button>
          </div>
        </div>
      ) : actions.length > 0 ? (
        <div role="group" aria-label="Cambiar estado" className="flex flex-col gap-2">
          {primary.map(actionButton)}
          {others.length > 0 ? <div className="flex flex-wrap gap-2">{others.map(actionButton)}</div> : null}
        </div>
      ) : null}

      {!confirmAction && waitsForArrival(actions) ? (
        <p className="m-0 text-xs leading-normal text-subtle">«Iniciar servicio» y «No asistió» se habilitan a la hora de la reserva.</p>
      ) : null}
      {canWrite && isFinal ? (
        <p className="m-0 text-xs leading-normal text-subtle">
          Reserva finalizada: ya no cambia de estado. Puedes seguir agregando observaciones.
        </p>
      ) : null}
      {mutation.isError ? <InlineNotice tone="error">{actionErrorText("No se pudo cambiar el estado.", mutation.error)}</InlineNotice> : null}
      {done && !mutation.isError ? <InlineNotice>Estado actualizado: {RESERVATION_STATUS[done.status].label}.</InlineNotice> : null}
    </div>
  );
}
