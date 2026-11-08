"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import { customersApi, reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CustomerDetail, Reservation, ReservationDetail } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta } from "@/lib/domain/channels";
import { customerName, itemName } from "@/lib/domain/conversation";
import { RESERVATION_STATUS } from "@/lib/domain/statuses";
import { TONES } from "@/lib/domain/tones";
import { formatTime, formatWeekdayDate } from "@/lib/format/dates";
import { orDash } from "@/lib/format/text";
import { useRestaurant } from "@/lib/restaurant";
import { Dialog } from "@/components/ui/dialog";
import { Button, ChannelDot, DetailList, Panel, Pill, SectionLabel } from "@/components/ui/primitives";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { canManageReservation, type Viewer } from "./reservation-actions";
import { AssigneeSection } from "./reservation-assignee";
import { EditReservationDialog, RescheduleDialog } from "./reservation-dialogs";
import { NotesSection, RescheduleHistory } from "./reservation-history";
import { StatusControl } from "./reservation-status-control";

interface Permissions {
  /** can("reservation.status"): cambiar el estado. */
  canStatus: boolean;
  viewer: Viewer;
}

/**
 * Panel derecho del Calendario. La reserva se carga por id (GET /reservations/:id), así que se muestra
 * aunque ya no esté en el periodo visible (por ejemplo, después de reprogramarla).
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
  const permissions = usePermissions();
  const canWrite = permissions.canStatus || permissions.viewer.canEdit;

  // `leading-[normal]`: el mockup no fija interlineado en el panel (salvo el texto vacío, que usa 1.5).
  return (
    <Panel as="aside" aria-label="Detalle de reserva" className="flex flex-col gap-4 overflow-y-auto p-5 leading-[normal]">
      <SectionLabel>Detalle de reserva</SectionLabel>
      {reservationId ? (
        <ReservationDetailBody key={reservationId} id={reservationId} listRow={listRow} permissions={permissions} enabled={enabled} />
      ) : (
        <p className="m-0 text-[13px] leading-normal text-muted">
          {canWrite
            ? "Selecciona una reserva para ver sus detalles, cambiar su estado o agregar observaciones."
            : "Selecciona una reserva para revisar sus detalles."}
        </p>
      )}
    </Panel>
  );
}

/**
 * El mismo detalle en un panel lateral, cuando la pantalla no tiene sitio para la columna derecha: se abre
 * al elegir una reserva y al cerrarlo se deja de seleccionar.
 */
export function ReservationDetailSheet({
  reservationId,
  listRow,
  enabled,
  onClose,
}: {
  reservationId: string | null;
  listRow?: Reservation;
  enabled: boolean;
  onClose: () => void;
}) {
  const permissions = usePermissions();
  return (
    <Dialog open={reservationId !== null} onClose={onClose} title="Detalle de reserva" placement="right">
      {reservationId ? (
        <div className="flex flex-col gap-4 leading-[normal]">
          <ReservationDetailBody key={reservationId} id={reservationId} listRow={listRow} permissions={permissions} enabled={enabled} />
        </div>
      ) : null}
    </Dialog>
  );
}

function usePermissions(): Permissions {
  const session = useSession();
  return {
    canStatus: session.can("reservation.status"),
    viewer: { roles: session.roles, userId: session.user?.id ?? null, canEdit: session.can("reservation.edit") },
  };
}

function ReservationDetailBody({
  id,
  listRow,
  permissions,
  enabled,
}: {
  id: string;
  listRow?: Reservation;
  permissions: Permissions;
  enabled: boolean;
}) {
  const detail = useQuery({
    queryKey: qk.reservation(id),
    queryFn: () => reservationsApi.get(id),
    refetchInterval: 60_000,
    enabled,
  });
  // Respuesta del último PATCH. Se guarda como estado para mostrar el cambio en el mismo render en que se
  // cierra la acción (sin parpadeos) y aunque el detalle aún no estuviera en caché. Gana hasta que el
  // detalle se vuelva a leer con un `updatedAt` más reciente.
  const [saved, setSaved] = useState<Reservation | null>(null);

  if (detail.isError && !detail.data) {
    return <ErrorState error={detail.error} subject="la reserva" onRetry={() => void detail.refetch()} className="px-0" />;
  }
  const base: Reservation | ReservationDetail | undefined = detail.data ?? listRow;
  if (!base) return <LoadingState label="Cargando reserva…" />;
  const reservation: Reservation = saved && saved.updatedAt >= base.updatedAt ? { ...base, ...saved } : base;

  return (
    <ReservationSummary
      reservation={reservation}
      history={detail.data ?? null}
      permissions={permissions}
      onSaved={setSaved}
    />
  );
}

type OpenDialog = "edit" | "reschedule" | null;

function ReservationSummary({
  reservation: r,
  history,
  permissions,
  onSaved,
}: {
  reservation: Reservation;
  /** Detalle con historiales; null mientras solo se tiene la fila del listado. */
  history: Pick<ReservationDetail, "noteHistory" | "rescheduleHistory"> | null;
  permissions: Permissions;
  onSaved: (updated: Reservation) => void;
}) {
  const { timeZone } = useRestaurant();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // Al ocultarse la vista (Activity) no queda abierto ningún diálogo.
  useLayoutEffect(() => () => setDialog(null), []);

  // La reserva no trae canal: se usa el canal de origen del cliente.
  const customer = useQuery({
    queryKey: qk.customer(r.customerId),
    queryFn: () => customersApi.get(r.customerId),
    staleTime: 5 * 60_000,
  });
  const status = RESERVATION_STATUS[r.status];
  // En bk-crm toda reserva se registra con «Nueva reserva» (reservationRequestId siempre es null); el modo
  // simulado también crea reservas a partir de solicitudes aceptadas.
  const fromRequest = r.reservationRequestId !== null;
  const manageable = canManageReservation(r.status, permissions.viewer.canEdit);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-subtle">{r.code}</span>
        <span className="text-[18px] font-bold">{customerName(r.customer, customer.data?.sourceChannel)}</span>
        <ChannelLine customer={customer} />
      </div>
      <DetailList
        rows={[
          { label: "Fecha", value: formatWeekdayDate(r.reservationAt, timeZone), strong: true },
          { label: "Hora", value: formatTime(r.reservationAt, timeZone), strong: true },
          { label: "Personas", value: r.numberOfPeople, strong: true },
          { label: "Servicio", value: itemName(r.commercialItem), strong: true },
          { label: "Notas", value: <span className="whitespace-pre-wrap wrap-break-word">{orDash(r.notes)}</span> },
        ]}
      />
      <div className="flex flex-wrap gap-1.5">
        <Pill tone={fromRequest ? TONES.blue : TONES.gray}>{fromRequest ? "Desde una solicitud" : "Registro manual"}</Pill>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>

      <StatusControl reservation={r} canWrite={permissions.canStatus} onSaved={onSaved} />

      {manageable ? (
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 flex-1 px-3" onClick={() => setDialog("edit")}>
            Editar
          </Button>
          <Button variant="outline" className="h-9 flex-1 px-3" onClick={() => setDialog("reschedule")}>
            Reprogramar
          </Button>
        </div>
      ) : null}

      <AssigneeSection reservation={r} viewer={permissions.viewer} onSaved={onSaved} />
      <NotesSection
        reservationId={r.id}
        notes={history?.noteHistory ?? null}
        canAdd={permissions.viewer.canEdit}
        timeZone={timeZone}
      />
      {history ? <RescheduleHistory entries={history.rescheduleHistory} timeZone={timeZone} /> : null}

      {dialog === "edit" ? <EditReservationDialog reservation={r} onClose={() => setDialog(null)} onSaved={onSaved} /> : null}
      {dialog === "reschedule" ? <RescheduleDialog reservation={r} onClose={() => setDialog(null)} onSaved={onSaved} /> : null}
    </div>
  );
}

function ChannelLine({ customer }: { customer: UseQueryResult<CustomerDetail> }) {
  if (customer.data) {
    const ch = channelMeta(customer.data.sourceChannel);
    return (
      <span className="flex items-center gap-1.5 text-[12.5px] text-muted" title="Canal por el que llegó el cliente">
        <span aria-hidden="true">
          <ChannelDot channel={customer.data.sourceChannel} />
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
