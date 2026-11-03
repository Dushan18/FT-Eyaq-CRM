"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { collectPages } from "@/lib/api/client";
import { requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ReservationRequest, ReservationRequestStatus } from "@/lib/api/types";
import { channelMeta } from "@/lib/domain/channels";
import { customerName, itemName } from "@/lib/domain/conversation";
import { REQUEST_TAB_STATUSES, requestStatusView, type RequestTab } from "@/lib/domain/statuses";
import { formatAgoLong, formatDayTime } from "@/lib/format/dates";
import { useNow } from "@/lib/hooks/use-now";
import { useOpenChat } from "@/lib/hooks/use-open-chat";
import { pickOption, useUrlParams } from "@/lib/hooks/use-url-state";
import { useRestaurant } from "@/lib/restaurant";
import { ChannelDot, KpiCard, PageHeader, Panel, Pill, Segmented } from "@/components/ui/primitives";
import { PaginationBar } from "@/components/ui/pagination";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";

const TABS: ReadonlyArray<{ value: RequestTab; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "esperando", label: "Esperando" },
  { value: "aceptadas", label: "Aceptadas" },
  { value: "rechazadas", label: "Rechazadas" },
];

const PAGE_SIZE = 50;
const COLUMNS = "grid-cols-[150px_minmax(150px,1.3fr)_150px_70px_minmax(130px,1.1fr)_150px_150px]";

/** Total de solicitudes en un estado (lectura barata: limit=1 y se usa `total`). */
function useStatusCount(status: ReservationRequestStatus) {
  return useQuery({
    queryKey: qk.requests({ count: status }),
    queryFn: () => requestsApi.list({ status, limit: 1 }).then((r) => r.pagination.total),
    staleTime: 30_000,
  });
}

function KpiValue({ query }: { query: { data?: number; isError: boolean; isLoading: boolean } }) {
  if (query.isLoading) return <span className="text-faint">…</span>;
  if (query.isError) return <span title="No se pudo cargar">—</span>;
  return <>{query.data ?? 0}</>;
}

export function SolicitudesView() {
  const url = useUrlParams();
  const tab = pickOption(url.get("tab"), ["todas", "esperando", "aceptadas", "rechazadas"] as const, "todas");
  const page = Math.max(1, Number(url.get("pagina")) || 1);
  const statuses = REQUEST_TAB_STATUSES[tab];

  const sent = useStatusCount("SENT_TO_OWNER");
  const waiting = useStatusCount("WAITING_RESPONSE");
  const accepted = useStatusCount("ACCEPTED");
  const rejected = useStatusCount("REJECTED");
  const waitingTotal = {
    data: (sent.data ?? 0) + (waiting.data ?? 0),
    isError: sent.isError || waiting.isError,
    isLoading: sent.isLoading || waiting.isLoading,
  };

  const list = useQuery({
    queryKey: qk.requests({ tab, page }),
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

  return (
    <Panel className="flex h-full flex-col gap-[22px] overflow-y-auto px-8 py-7">
      <PageHeader
        title="Solicitudes"
        subtitle="Samanta envía cada solicitud al WhatsApp del dueño. Solo las aceptadas pasan al calendario."
        actions={
          <Segmented
            ariaLabel="Filtrar solicitudes por estado"
            options={TABS}
            value={tab}
            onChange={(value) => url.set({ tab: value === "todas" ? null : value, pagina: null })}
          />
        }
      />

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Esperando al dueño" value={<KpiValue query={waitingTotal} />} valueColor="#b14a0b" />
        <KpiCard label="Aceptadas" value={<KpiValue query={accepted} />} valueColor="#14753f" />
        <KpiCard label="Rechazadas" value={<KpiValue query={rejected} />} valueColor="#b42323" />
        <KpiCard
          label="Respuesta media"
          value={<span title="El backend aún no registra cuándo responde el dueño">—</span>}
          sub="Sin registro de respuesta del dueño"
        />
      </div>

      {list.data && "truncated" in list.data && list.data.truncated ? (
        <InlineNotice tone="warning">Se muestran las primeras 500 solicitudes de cada estado.</InlineNotice>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-card" role="table" aria-label="Solicitudes de reserva">
        <div role="row" className={`grid ${COLUMNS} gap-3 bg-surface px-[18px] py-3 text-[11px] font-bold tracking-[.06em] text-subtle`}>
          <span role="columnheader">ID</span>
          <span role="columnheader">CLIENTE</span>
          <span role="columnheader">FECHA</span>
          <span role="columnheader">PERS.</span>
          <span role="columnheader">SERVICIO</span>
          <span role="columnheader">ESTADO</span>
          <span role="columnheader">ÚLTIMO CAMBIO</span>
        </div>
        {list.isLoading ? (
          <LoadingState label="Cargando solicitudes…" className="border-t border-line-2" />
        ) : list.isError ? (
          <ErrorState error={list.error} subject="las solicitudes" onRetry={() => void list.refetch()} className="border-t border-line-2" />
        ) : list.data && list.data.data.length > 0 ? (
          <>
            {list.data.data.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
            <PaginationBar pagination={list.data.pagination} onPage={(p) => url.set({ pagina: p > 1 ? String(p) : null })} />
          </>
        ) : (
          <EmptyState className="border-t border-line-2">No hay solicitudes en esta pestaña.</EmptyState>
        )}
      </div>
    </Panel>
  );
}

function RequestRow({ request: r }: { request: ReservationRequest }) {
  const { timeZone } = useRestaurant();
  const now = useNow();
  const chat = useOpenChat();
  const status = requestStatusView(r.status);
  const ch = channelMeta(r.sourceChannel);
  const name = customerName(r.customer);

  return (
    <div role="row" className={`grid ${COLUMNS} items-center gap-3 border-t border-line-2 px-[18px] py-3.5 text-[13.5px]`}>
      <span role="cell" className="font-bold">
        {r.code}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-2">
        <ChannelDot color={ch.color} short={ch.short} label={ch.label} />
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
          className="h-7 cursor-pointer whitespace-nowrap rounded-lg border border-button bg-white px-2.5 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-60"
        >
          {chat.pendingId === r.customerId ? "…" : "Chat"}
        </button>
      </span>
    </div>
  );
}
