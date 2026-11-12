"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { collectPages } from "@/lib/api/client";
import { requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ReservationRequest, ReservationRequestStatus } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { customerName, itemName } from "@/lib/domain/conversation";
import { REQUEST_STATUS, REQUEST_TAB_STATUSES, requestStatusView, type RequestTab } from "@/lib/domain/statuses";
import { formatAgoLong, formatDayTime } from "@/lib/format/dates";
import { cn } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { useOpenChat } from "@/lib/hooks/use-open-chat";
import { pickOption, useUrlParams } from "@/lib/hooks/use-url-state";
import { useRestaurant } from "@/lib/restaurant";
import { Button, ChannelDot, KpiCard, PageHeader, Panel, Pill, Segmented } from "@/components/ui/primitives";
import { PaginationBar } from "@/components/ui/pagination";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import { parsePage } from "@/features/clientes/clientes-utils";
import { isUuid } from "@/features/calendario/calendar-utils";
import { ApproveRequestDialog, RejectRequestDialog } from "./request-actions";
import { RequestDetailSheet } from "./request-detail";
import { canApproveRequest, canRejectRequest } from "./request-detail-logic";
import { CancelRequestDialog, EditRequestDialog, NewRequestDialog } from "./request-form";
import { isEditableRequest } from "./request-form-logic";

/**
 * «Cambio propuesto» (MODIFICATION_REQUESTED) tiene pestaña propia y no va en «Esperando»: el propietario ya
 * respondió y ahora le toca a una persona del equipo coordinar con el cliente.
 */
const TABS: ReadonlyArray<{ value: RequestTab; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "esperando", label: "Esperando" },
  { value: "cambio", label: "Cambio propuesto" },
  { value: "aceptadas", label: "Aceptadas" },
  { value: "rechazadas", label: "Rechazadas" },
];
const TAB_VALUES = TABS.map((t) => t.value);

const PAGE_SIZE = 50;

const linkButton = "cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand hover:underline";
const COLUMNS = "grid-cols-[150px_minmax(150px,1.3fr)_150px_70px_minmax(130px,1.1fr)_150px_150px]";
/** Con permiso de editar, cancelar o decidir se añade la columna de acciones (hasta cuatro botones, en dos filas). */
const COLUMNS_WITH_ACTIONS = "grid-cols-[150px_minmax(150px,1.3fr)_150px_70px_minmax(130px,1.1fr)_150px_150px_170px]";
/** Columnas mínimas + huecos + relleno (1058 px; 1240 px con acciones): por debajo, la tabla se desplaza. */
const TABLE_MIN_WIDTH = "min-w-265";
const TABLE_MIN_WIDTH_WITH_ACTIONS = "min-w-310";

const SUBTITLE =
  "Llegan de Samanta, de la web o del equipo. Las de Samanta y la web se envían al WhatsApp del propietario; cuando las acepta, la reserva entra al calendario.";

/** Total de solicitudes en un estado (lectura barata: limit=1 y se usa `total`). */
function useStatusCount(status: ReservationRequestStatus) {
  return useQuery({
    queryKey: qk.requests({ count: status }),
    queryFn: () => requestsApi.list({ status, limit: 1 }).then((r) => r.pagination.total),
    staleTime: 30_000,
  });
}

interface KpiQuery {
  data?: number;
  isError: boolean;
  isPaused: boolean;
}

/**
 * Sin datos todavía: cargando, sin conexión ("…") o error ("—"); nunca un 0 inventado. Con datos, se
 * muestran aunque falle una actualización en segundo plano.
 */
function KpiValue({ query }: { query: KpiQuery }) {
  if (query.data === undefined) {
    if (query.isError) return <span title="No se pudo cargar">—</span>;
    return (
      <span className="text-faint" title={query.isPaused ? "Sin conexión" : undefined}>
        …
      </span>
    );
  }
  return <span title={query.isError ? "No se pudo actualizar: es el último dato cargado" : undefined}>{query.data}</span>;
}

export function SolicitudesView() {
  const url = useUrlParams();
  const tab = pickOption(url.get("tab"), TAB_VALUES, "todas");
  // Entero de 1 a 1 000 000: con decimales o más grande, el backend responde 400.
  const page = parsePage(url.get("pagina"));
  const statuses = REQUEST_TAB_STATUSES[tab];
  const session = useSession();
  const canEdit = session.can("request.edit");
  const canCancel = session.can("request.cancel");
  const canDecide = session.can("request.approve");
  const withActions = canEdit || canCancel || canDecide;
  const columns = withActions ? COLUMNS_WITH_ACTIONS : COLUMNS;
  // Detalle abierto: `solicitud` en la URL, para poder enlazarlo.
  const detailParam = url.get("solicitud");
  const detailId = isUuid(detailParam) ? detailParam : null;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ReservationRequest | null>(null);
  const [cancelling, setCancelling] = useState<ReservationRequest | null>(null);
  const [approving, setApproving] = useState<ReservationRequest | null>(null);
  const [rejecting, setRejecting] = useState<ReservationRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const openDetail = (id: string | null) => url.set({ solicitud: id });

  const sent = useStatusCount("SENT_TO_OWNER");
  const waiting = useStatusCount("WAITING_RESPONSE");
  const proposed = useStatusCount("MODIFICATION_REQUESTED");
  const accepted = useStatusCount("ACCEPTED");
  const rejected = useStatusCount("REJECTED");
  const waitingTotal: KpiQuery = {
    data: sent.data === undefined || waiting.data === undefined ? undefined : sent.data + waiting.data,
    isError: sent.isError || waiting.isError,
    isPaused: sent.isPaused || waiting.isPaused,
  };

  const list = useQuery({
    queryKey: qk.requests({ tab, page }),
    // El backend cambia los estados solo (envío al propietario y sus respuestas): se refresca con polling.
    queryFn: async () => {
      if (statuses === null || statuses.length === 1) {
        return requestsApi.list({ page, limit: PAGE_SIZE, ...(statuses ? { status: statuses[0] } : {}) });
      }
      // "Esperando" abarca dos estados y el backend filtra uno a la vez: se combinan ambos.
      const parts = await Promise.all(
        statuses.map((status) => collectPages((p, limit) => requestsApi.list({ status, page: p, limit }), 5)),
      );
      const rows = parts.flatMap((p) => p.rows).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        data: rows,
        pagination: { page: 1, limit: rows.length, total: rows.length, totalPages: 1 },
        truncated: parts.some((p) => p.truncated),
      };
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  // Regla de la app: "no se pudo consultar" o "sin conexión" nunca se muestran como "no hay solicitudes".
  const rows = list.data?.data ?? [];
  let state: ReactNode = null;
  if (list.data === undefined) {
    state = list.isError ? (
      <ErrorState error={list.error} subject="las solicitudes" onRetry={() => void list.refetch()} className="border-t border-line-2" />
    ) : (
      <LoadingState
        label={list.isPaused ? "Sin conexión. Se cargará al recuperar la red." : "Cargando solicitudes…"}
        className="border-t border-line-2"
      />
    );
  } else if (rows.length === 0 && list.data.pagination.total > 0) {
    // La URL pide una página que ya no existe: no es "sin solicitudes".
    state = (
      <EmptyState className="border-t border-line-2">
        No hay solicitudes en esta página.{" "}
        <button type="button" onClick={() => url.set({ pagina: null })} className={linkButton}>
          Ir a la primera página
        </button>
      </EmptyState>
    );
  } else if (rows.length === 0) {
    state = <EmptyState className="border-t border-line-2">No hay solicitudes en esta pestaña.</EmptyState>;
  }

  return (
    <Panel className="flex h-full flex-col gap-5.5 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <PageHeader
        title="Solicitudes"
        subtitle={SUBTITLE}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              ariaLabel="Filtrar solicitudes por estado"
              options={TABS}
              value={tab}
              onChange={(value) => url.set({ tab: value === "todas" ? null : value, pagina: null })}
            />
            {canEdit ? (
              <Button className="h-9 px-4" onClick={() => setCreating(true)}>
                Nueva solicitud
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Esperando al propietario"
          value={<KpiValue query={waitingTotal} />}
          valueColor="#b14a0b"
          sub="Enviadas a su WhatsApp"
        />
        <KpiCard label="Cambio propuesto" value={<KpiValue query={proposed} />} valueColor="#9a3a06" sub="Necesitan a una persona del equipo" />
        <KpiCard label="Aceptadas" value={<KpiValue query={accepted} />} valueColor="#14753f" sub="Con reserva en el calendario" />
        <KpiCard label="Rechazadas" value={<KpiValue query={rejected} />} valueColor="#b42323" sub="Sin reserva" />
      </div>

      {proposed.data && tab !== "cambio" ? (
        <InlineNotice tone="warning">
          {proposed.data === 1
            ? "1 solicitud tiene un cambio propuesto por el propietario"
            : `${proposed.data} solicitudes tienen un cambio propuesto por el propietario`}
          : coordina el cambio con el cliente.{" "}
          <button type="button" onClick={() => url.set({ tab: "cambio", pagina: null })} className={linkButton}>
            Ver
          </button>
        </InlineNotice>
      ) : null}

      {notice ? (
        <InlineNotice>
          {notice}{" "}
          <button type="button" onClick={() => setNotice(null)} className={linkButton}>
            Ocultar aviso
          </button>
        </InlineNotice>
      ) : null}

      {list.data && "truncated" in list.data && list.data.truncated ? (
        <InlineNotice tone="warning">Se muestran las primeras 500 solicitudes de cada estado.</InlineNotice>
      ) : null}

      {list.isError && list.data !== undefined ? (
        // Falló una actualización en segundo plano: se conservan los últimos datos en vez de vaciar la tabla.
        <InlineNotice tone="warning">
          No se pudo actualizar la lista; se muestran los últimos datos cargados.{" "}
          <button type="button" onClick={() => void list.refetch()} className={linkButton}>
            Reintentar
          </button>
        </InlineNotice>
      ) : null}

      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-card transition-opacity",
          list.isPlaceholderData && "opacity-60",
        )}
      >
        {/* En pantallas estrechas la tabla se desplaza en horizontal dentro del recuadro (no la página). */}
        <div className="relative overflow-x-auto">
        <div
          role="table"
          aria-label="Solicitudes de reserva"
          aria-busy={list.isPlaceholderData || undefined}
          className={withActions ? TABLE_MIN_WIDTH_WITH_ACTIONS : TABLE_MIN_WIDTH}
        >
          <div role="row" className={`grid ${columns} gap-3 bg-surface px-4.5 py-3 text-[11px] font-bold tracking-[.06em] text-subtle`}>
            <span role="columnheader">ID</span>
            <span role="columnheader">CLIENTE</span>
            <span role="columnheader">FECHA</span>
            <span role="columnheader">PERS.</span>
            <span role="columnheader">SERVICIO</span>
            <span role="columnheader">ESTADO</span>
            <span role="columnheader">ÚLTIMO CAMBIO</span>
            {withActions ? (
              <span role="columnheader">
                <span className="sr-only">Acciones</span>
              </span>
            ) : null}
          </div>
          {rows.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              columns={columns}
              actions={withActions}
              onOpen={() => openDetail(r.id)}
              onEdit={canEdit ? () => setEditing(r) : undefined}
              onCancel={canCancel ? () => setCancelling(r) : undefined}
              onApprove={canDecide ? () => setApproving(r) : undefined}
              onReject={canDecide ? () => setRejecting(r) : undefined}
            />
          ))}
        </div>
        </div>
        {state}
        {list.data && rows.length > 0 ? (
          <PaginationBar pagination={list.data.pagination} onPage={(p) => url.set({ pagina: p > 1 ? String(p) : null })} />
        ) : null}
      </div>

      <NewRequestDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(r) => setNotice(`Se creó la solicitud ${r.code} («${REQUEST_STATUS[r.status].label}»).`)}
      />
      <EditRequestDialog
        request={editing}
        onClose={() => setEditing(null)}
        onSaved={(r) => setNotice(`Se guardó la solicitud ${r.code}: ahora está «${REQUEST_STATUS[r.status].label}».`)}
      />
      <CancelRequestDialog
        request={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={(r) => setNotice(`Se canceló la solicitud ${r.code}.`)}
      />
      <ApproveRequestDialog
        request={approving}
        onClose={() => setApproving(null)}
        onApproved={({ request, reservation }) =>
          setNotice(
            `Se aprobó la solicitud ${request.code}: la reserva ${reservation.code} ya está en el calendario. Avísale al cliente por la Bandeja.`,
          )
        }
      />
      <RejectRequestDialog
        request={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={(r) => setNotice(`Se rechazó la solicitud ${r.code}. Avísale al cliente por la Bandeja.`)}
      />
      <RequestDetailSheet
        requestId={detailId}
        onClose={() => openDetail(null)}
        actions={{
          onApprove: canDecide ? setApproving : undefined,
          onReject: canDecide ? setRejecting : undefined,
          onEdit: canEdit ? setEditing : undefined,
          onCancel: canCancel ? setCancelling : undefined,
        }}
      />
    </Panel>
  );
}

const rowButton =
  "h-7 cursor-pointer whitespace-nowrap rounded-lg border border-button bg-white px-2.5 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-60";

function RequestRow({
  request: r,
  columns,
  actions,
  onOpen,
  onEdit,
  onCancel,
  onApprove,
  onReject,
}: {
  request: ReservationRequest;
  columns: string;
  /** La tabla tiene columna de acciones (permiso de editar, cancelar o decidir). */
  actions: boolean;
  onOpen: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const { timeZone } = useRestaurant();
  const now = useNow();
  const chat = useOpenChat();
  const status = requestStatusView(r.status);
  const name = customerName(r.customer, r.sourceChannel);
  // Editar y cancelar solo en «Negociando» y «Lista para enviar» (en otro estado el backend responde 409).
  const editable = isEditableRequest(r.status);
  const attention = r.status === "MODIFICATION_REQUESTED";

  return (
    <div
      role="row"
      className={cn(
        `grid ${columns} items-center gap-3 border-t border-line-2 px-4.5 py-3.5 text-[13.5px]`,
        // «Cambio propuesto» necesita a una persona: la fila se destaca.
        attention && "bg-[#fff7f0] shadow-[inset_3px_0_0_#f26a1b]",
      )}
    >
      <span role="cell">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Ver la solicitud ${r.code}`}
          className="cursor-pointer border-0 bg-transparent p-0 text-left font-bold text-ink hover:text-brand hover:underline"
        >
          {r.code}
        </button>
        {r.externalReference ? <span className="block text-[11.5px] text-subtle">Web {r.externalReference}</span> : null}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-2">
        <ChannelDot channel={r.sourceChannel} />
        <span className="truncate">{name}</span>
      </span>
      <span role="cell">{r.reservationAt ? formatDayTime(r.reservationAt, timeZone) : <span className="text-subtle">Por definir</span>}</span>
      <span role="cell">{r.numberOfPeople ?? "—"}</span>
      <span role="cell" className="text-slate">
        {itemName(r.commercialItem)}
      </span>
      <span role="cell">
        <Pill tone={status.tone}>{status.label}</Pill>
      </span>
      <span role="cell" className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-muted" title={new Date(r.updatedAt).toLocaleString("es-PE", { timeZone })}>
          {chat.notFound === r.customerId ? "Sin conversación" : chat.failed === r.customerId ? "No se pudo abrir" : formatAgoLong(r.updatedAt, now, timeZone)}
        </span>
        <button
          type="button"
          onClick={() => void chat.open(r.customerId, r.sourceChannel)}
          disabled={chat.pendingId === r.customerId}
          aria-label={`Abrir la conversación de ${name}`}
          className={rowButton}
        >
          {chat.pendingId === r.customerId ? "…" : "Chat"}
        </button>
      </span>
      {actions ? (
        <span role="cell" className="flex flex-wrap justify-end gap-1.5">
          {onApprove && canApproveRequest(r.status) ? (
            <button type="button" onClick={onApprove} aria-label={`Aprobar la solicitud ${r.code}`} className={rowButton}>
              Aprobar
            </button>
          ) : null}
          {onReject && canRejectRequest(r.status) ? (
            <button type="button" onClick={onReject} aria-label={`Rechazar la solicitud ${r.code}`} className={rowButton}>
              Rechazar
            </button>
          ) : null}
          {editable && onEdit ? (
            <button type="button" onClick={onEdit} aria-label={`Editar la solicitud ${r.code}`} className={rowButton}>
              Editar
            </button>
          ) : null}
          {editable && onCancel ? (
            <button type="button" onClick={onCancel} aria-label={`Cancelar la solicitud ${r.code}`} className={rowButton}>
              Cancelar
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
