"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { customersApi, reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CustomerDetail, Reservation, ReservationDetail, ReservationStatusTarget } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta } from "@/lib/domain/channels";
import { customerName, itemName } from "@/lib/domain/conversation";
import { RESERVATION_STATUS } from "@/lib/domain/statuses";
import { TONES } from "@/lib/domain/tones";
import { formatTime, formatWeekdayDate } from "@/lib/format/dates";
import { orDash } from "@/lib/format/text";
import { useRestaurant } from "@/lib/restaurant";
import { ChannelDot, DetailList, Panel, Pill, SectionLabel } from "@/components/ui/primitives";
import { ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import { PREPARED_TARGET, prepareAction } from "./calendar-utils";

/**
 * Panel derecho del Calendario. La reserva se carga por id (GET /reservations/:id), así que se muestra
 * aunque ya no esté en el periodo visible.
 */
export function ReservationDetailPanel({
  reservationId,
  listRow,
  enabled,
}: {
  reservationId: string | null;
  /** La misma reserva tal como vino en el listado: se muestra mientras llega el detalle. */
  listRow?: Reservation;
  /** false mientras no se sepa si el rol puede leer reservas. */
  enabled: boolean;
}) {
  const session = useSession();
  const canWrite = session.can("reservation.status");

  // `leading-[normal]`: el mockup no fija interlineado en el panel (salvo el texto vacío, que usa 1.5).
  return (
    <Panel as="aside" aria-label="Detalle de reserva" className="flex flex-col gap-4 overflow-y-auto p-5 leading-[normal]">
      <SectionLabel>Detalle de reserva</SectionLabel>
      {reservationId ? (
        <ReservationDetailBody key={reservationId} id={reservationId} listRow={listRow} canWrite={canWrite} enabled={enabled} />
      ) : (
        <p className="m-0 text-[13px] leading-[1.5] text-muted">
          {canWrite
            ? "Selecciona una reserva para revisar los detalles y marcarla como preparada."
            : "Selecciona una reserva para revisar sus detalles."}
        </p>
      )}
    </Panel>
  );
}

function ReservationDetailBody({
  id,
  listRow,
  canWrite,
  enabled,
}: {
  id: string;
  listRow?: Reservation;
  canWrite: boolean;
  enabled: boolean;
}) {
  const detail = useQuery({
    queryKey: qk.reservation(id),
    queryFn: () => reservationsApi.get(id),
    refetchInterval: 60_000,
    enabled,
  });

  if (detail.isError && !detail.data) {
    return <ErrorState error={detail.error} subject="la reserva" onRetry={() => void detail.refetch()} className="px-0" />;
  }
  const reservation: Reservation | undefined = detail.data ?? listRow;
  if (!reservation) return <LoadingState label="Cargando reserva…" />;
  return <ReservationSummary reservation={reservation} canWrite={canWrite} />;
}

function ReservationSummary({ reservation: r, canWrite }: { reservation: Reservation; canWrite: boolean }) {
  const { timeZone } = useRestaurant();
  // La reserva no trae canal: se usa el canal de origen del cliente.
  const customer = useQuery({
    queryKey: qk.customer(r.customerId),
    queryFn: () => customersApi.get(r.customerId),
    staleTime: 5 * 60_000,
  });
  const status = RESERVATION_STATUS[r.status];
  const fromRequest = r.reservationRequestId !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-subtle">{r.code}</span>
        <span className="text-[18px] font-bold">{customerName(r.customer)}</span>
        <ChannelLine customer={customer} />
      </div>
      <DetailList
        rows={[
          { label: "Fecha", value: formatWeekdayDate(r.reservationAt, timeZone), strong: true },
          { label: "Hora", value: formatTime(r.reservationAt, timeZone), strong: true },
          { label: "Personas", value: r.numberOfPeople, strong: true },
          { label: "Servicio", value: itemName(r.commercialItem), strong: true },
          { label: "Notas", value: <span className="wrap-break-word">{orDash(r.notes)}</span> },
        ]}
      />
      <div className="flex flex-wrap gap-1.5">
        <Pill tone={fromRequest ? TONES.green : TONES.gray}>{fromRequest ? "Aceptada por el dueño" : "Registrada en el CRM"}</Pill>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      <PrepareControl reservation={r} canWrite={canWrite} />
    </div>
  );
}

function ChannelLine({ customer }: { customer: UseQueryResult<CustomerDetail> }) {
  if (customer.data) {
    const ch = channelMeta(customer.data.sourceChannel);
    return (
      <span className="flex items-center gap-1.5 text-[12.5px] text-muted" title="Canal por el que llegó el cliente">
        <span aria-hidden="true">
          <ChannelDot color={ch.color} short={ch.short} label={ch.label} />
        </span>
        {ch.label}
      </span>
    );
  }
  if (customer.isError) {
    return (
      <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
        No se pudo cargar el canal.
        <button
          type="button"
          onClick={() => void customer.refetch()}
          className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-brand hover:underline"
        >
          Reintentar
        </button>
      </span>
    );
  }
  return <span className="text-[12.5px] text-faint">Cargando canal…</span>;
}

function prepareErrorText(error: unknown): string {
  const detail = error instanceof ApiError ? error.messages.join(" ") : error instanceof Error ? error.message : "";
  return detail ? `No se pudo marcar como preparada. ${detail}` : "No se pudo marcar como preparada.";
}

/**
 * "Marcar como preparada" → PATCH /reservations/:id/status {status: PREPARED_STATUS}. El backend no permite
 * volver atrás, por eso se pide confirmación en línea antes de enviarlo.
 */
function PrepareControl({ reservation, canWrite }: { reservation: Reservation; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  // Respuesta del PATCH. Se guarda como estado (y no se lee de `mutation.data`) para que cambie en el mismo
  // render en que se cierra la confirmación: así no reaparece "Marcar como preparada" un instante.
  const [saved, setSaved] = useState<Reservation | null>(null);
  const markRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const preparedRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<"mark" | "confirm" | "cancel" | "prepared" | null>(null);

  const mutation = useMutation({
    mutationFn: (target: ReservationStatusTarget) => reservationsApi.setStatus(reservation.id, target),
    onSuccess: (updated) => {
      // La respuesta no trae historiales: se mezcla con el detalle en caché para mostrar el estado nuevo ya.
      queryClient.setQueryData<ReservationDetail>(qk.reservation(updated.id), (old) => (old ? { ...old, ...updated } : old));
      setSaved(updated);
      focusNext.current = "prepared";
      setConfirming(false);
    },
    onError: () => {
      focusNext.current = "confirm";
    },
    // También tras un 409: el estado cambió en otro lado y hay que mostrar el actual.
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.reservationsAll }),
  });
  const { reset } = mutation;

  // Al ocultarse la vista (Activity) no deben quedar abiertos la confirmación ni un aviso viejo.
  useLayoutEffect(
    () => () => {
      setConfirming(false);
      reset();
    },
    [reset],
  );

  // Lleva el foco al control que reemplaza al que se usó, para no perderlo. Espera a que exista y esté
  // habilitado: mientras se guarda (y se vuelven a leer las reservas) los botones siguen deshabilitados.
  useEffect(() => {
    const refs = { mark: markRef, confirm: confirmRef, cancel: cancelRef, prepared: preparedRef };
    const element = focusNext.current ? refs[focusNext.current].current : null;
    if (!element || (element instanceof HTMLButtonElement && element.disabled)) return;
    element.focus();
    focusNext.current = null;
  });

  // La respuesta del PATCH es la versión más reciente hasta que el detalle se vuelva a leer.
  const current = saved && saved.updatedAt >= reservation.updatedAt ? saved : reservation;
  const action = prepareAction(current.status, canWrite);
  const target = PREPARED_TARGET;
  const error = mutation.isError ? <InlineNotice tone="error">{prepareErrorText(mutation.error)}</InlineNotice> : null;

  if (action === "prepared") {
    return (
      <div
        ref={preparedRef}
        role="status"
        tabIndex={-1}
        className="grid h-[42px] place-items-center rounded-xl bg-[#e8f6ee] text-[13.5px] font-bold text-[#14753f]"
      >
        <span>
          Preparada <span aria-hidden="true">✓</span>
        </span>
      </div>
    );
  }
  if (action === "none" || target === null) return error;

  const open = () => {
    reset();
    focusNext.current = "cancel";
    setConfirming(true);
  };
  const cancel = () => {
    reset();
    focusNext.current = "mark";
    setConfirming(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div
          role="group"
          aria-label="Confirmar que la reserva está preparada"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !mutation.isPending) cancel();
          }}
          className="flex flex-col gap-2.5 rounded-xl border border-card bg-surface p-3"
        >
          <p className="m-0 text-[13px] font-semibold leading-[1.45] text-ink">No se puede deshacer. ¿Marcar como preparada?</p>
          <div className="flex gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={() => mutation.mutate(target)}
              disabled={mutation.isPending}
              className="h-9 flex-1 cursor-pointer rounded-[10px] border-0 bg-brand text-[13px] font-bold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? "Guardando…" : "Confirmar"}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={cancel}
              disabled={mutation.isPending}
              className="h-9 flex-1 cursor-pointer rounded-[10px] border border-button bg-white text-[13px] font-semibold text-ink-2 transition-colors hover:bg-[#f5f7fa] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={markRef}
          type="button"
          onClick={open}
          className="h-[42px] cursor-pointer rounded-xl border-0 bg-brand text-[13.5px] font-bold text-white transition-colors hover:bg-brand-hover"
        >
          Marcar como preparada
        </button>
      )}
      {error}
    </div>
  );
}
