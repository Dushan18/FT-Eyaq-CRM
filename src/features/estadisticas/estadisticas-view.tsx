"use client";

import { useQuery, type FetchStatus } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { collectPages } from "@/lib/api/client";
import { conversationsApi, requestsApi, reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import { MAX_PAGE_SIZE } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { CHANNELS } from "@/lib/domain/channels";
import { DEFAULT_TIME_ZONE } from "@/lib/format/dates";
import { plural } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { pickOption, useUrlParams } from "@/lib/hooks/use-url-state";
import { useRestaurant } from "@/lib/restaurant";
import { KpiCard, PageHeader, Panel, Segmented } from "@/components/ui/primitives";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import {
  STATS_PERIODS,
  barHeight,
  barPercent,
  channelStats,
  collectConversationsSince,
  formatPercent,
  periodRange,
  reservationsByDay,
  reservationsByMonthWeek,
  summarizeRequests,
  topServices,
  type Bucket,
  type ChannelStat,
  type ServiceCount,
  type StatsPeriod,
} from "./stats-utils";

const PERIODS: ReadonlyArray<{ value: StatsPeriod; label: string }> = [
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

/** Páginas que se leen como máximo por fuente (100 registros cada una). */
const MAX_PAGES = 20;
const STALE_TIME = 60_000;

/** Lo que una tarjeta necesita saber de cada consulta para mostrar carga o error. */
interface SourceQuery {
  data: unknown;
  error: unknown;
  isError: boolean;
  fetchStatus: FetchStatus;
  refetch: () => unknown;
}

export function EstadisticasView() {
  const url = useUrlParams();
  const period = pickOption(url.get("periodo"), STATS_PERIODS, "semana");
  const session = useSession();
  const restaurant = useRestaurant();
  const { timeZone } = restaurant;
  const now = useNow(60_000);
  const range = periodRange(period, now, timeZone);
  // Se consulta solo con la sesión lista y un rol con acceso (la vista se monta oculta mientras carga la
  // sesión), y con la zona del restaurante conocida o sabiendo que no se pudo leer, para no pedir un
  // periodo calculado en otra zona. `restaurant.isLoading` no basta: antes de la sesión esa consulta ni empezó.
  const zoneKnown = restaurant.config !== null || restaurant.missing || Boolean(restaurant.error);
  const enabled = session.status === "ready" && session.canView("estadisticas") && zoneKnown;
  const key = (source: string) => [...qk.stats(period, range.fromIso), range.toIso, source];

  const reservations = useQuery({
    queryKey: key("reservations"),
    queryFn: () =>
      collectPages(
        (page, limit) =>
          reservationsApi.list({ dateFrom: range.fromIso, dateTo: range.toIso, excludeCancelled: true, page, limit }),
        MAX_PAGES,
      ),
    staleTime: STALE_TIME,
    enabled,
  });

  const requests = useQuery({
    queryKey: key("requests"),
    queryFn: () =>
      collectPages((page, limit) => requestsApi.list({ dateFrom: range.fromIso, dateTo: range.toIso, page, limit }), MAX_PAGES),
    staleTime: STALE_TIME,
    enabled,
  });

  const conversations = useQuery({
    queryKey: key("conversations"),
    queryFn: () => collectConversationsSince((page, limit) => conversationsApi.list({ page, limit }), range.start, MAX_PAGES),
    staleTime: STALE_TIME,
    enabled,
  });

  const summary = requests.data ? summarizeRequests(requests.data.rows) : null;
  const channels = requests.data && conversations.data ? channelStats(conversations.data.rows, requests.data.rows, range) : null;
  const services = requests.data ? topServices(requests.data.rows) : null;
  const buckets = reservations.data
    ? period === "semana"
      ? reservationsByDay(reservations.data.rows, range, timeZone)
      : reservationsByMonthWeek(reservations.data.rows, range, timeZone)
    : null;

  const truncated = [
    reservations.data?.truncated ? "reservas" : null,
    requests.data?.truncated ? "solicitudes" : null,
    conversations.data?.truncated ? "conversaciones" : null,
  ].filter((source): source is string => source !== null);

  // Falló una actualización en segundo plano: se conservan las cifras ya calculadas y se avisa.
  const outdated = [reservations, requests, conversations].filter((q) => q.isError && q.data !== undefined);

  const requestsFailed = "No se pudieron cargar las solicitudes";

  return (
    <Panel className="flex h-full flex-col gap-[22px] overflow-y-auto px-8 py-7">
      <div className="flex flex-col gap-2">
        <PageHeader
          title="Estadísticas"
          subtitle="Rendimiento de reservas, canales y servicios."
          actions={
            <Segmented
              ariaLabel="Periodo de las estadísticas"
              options={PERIODS}
              value={period}
              onChange={(value) => url.set({ periodo: value === "semana" ? null : value })}
            />
          }
        />
        <p className="m-0 text-xs text-subtle">Calculado con los registros del CRM para {range.label}.</p>
      </div>

      {restaurant.missing || restaurant.error ? (
        <InlineNotice tone="warning">
          No se pudo leer la zona horaria del restaurante: los periodos se calculan con {DEFAULT_TIME_ZONE}.
        </InlineNotice>
      ) : null}

      {truncated.length > 0 ? (
        <InlineNotice tone="warning">
          Lectura parcial: solo se leyeron los primeros {MAX_PAGES * MAX_PAGE_SIZE} registros de {joinWithY(truncated)}. Algunas
          cifras pueden ser menores que las reales.
        </InlineNotice>
      ) : null}

      {outdated.length > 0 ? (
        <InlineNotice tone="warning">
          No se pudieron actualizar las cifras; se muestran las últimas calculadas.{" "}
          <button
            type="button"
            onClick={() => {
              for (const source of outdated) void source.refetch();
            }}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand hover:underline"
          >
            Reintentar
          </button>
        </InlineNotice>
      ) : null}

      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          size="lg"
          label="Reservas"
          value={metric(reservations, (d) => d.total)}
          sub={
            requests.data
              ? `de ${plural(requests.data.total, "solicitud", "solicitudes")}`
              : requests.isError
                ? requestsFailed
                : "de … solicitudes"
          }
        />
        <KpiCard
          size="lg"
          label="Rechazadas"
          value={metric(requests, () => summary?.rejected ?? 0)}
          sub={summary ? `${summary.renegotiating} en renegociación` : requests.isError ? requestsFailed : "… en renegociación"}
        />
        <KpiCard
          size="lg"
          label="Tasa de aceptación"
          value={metric(requests, () =>
            summary && summary.acceptanceRate !== null ? (
              formatPercent(summary.acceptanceRate)
            ) : (
              <span title="Aún no hay solicitudes aceptadas ni rechazadas en este periodo">—</span>
            ),
          )}
          sub="Respuesta media del dueño: sin registro"
        />
        <KpiCard
          size="lg"
          label="Resueltas por Samanta"
          value={<span title="El backend aún no integra a Samanta">—</span>}
          sub="Disponible cuando Samanta esté integrada"
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
        <StatCard title="Canales" aside={<ChannelLegend />}>
          <SourceState sources={[conversations, requests]} subject={sourceSubject(conversations, requests)}>
            {channels ? <ChannelRows rows={channels} /> : null}
          </SourceState>
        </StatCard>
        <StatCard title="Servicios más solicitados">
          <SourceState sources={[requests]} subject="la lista de solicitudes">
            {services ? <ServiceRows rows={services} /> : null}
          </SourceState>
        </StatCard>
      </div>

      <StatCard title={period === "semana" ? "Reservas por día" : "Reservas por semana"}>
        <SourceState sources={[reservations]} subject="la lista de reservas">
          {buckets ? <ReservationBars buckets={buckets} /> : null}
        </SourceState>
      </StatCard>
    </Panel>
  );
}

/** Valor de un indicador: "…" mientras carga y "—" si la consulta falló (nunca un número inventado). */
function metric<T>(query: { data: T | undefined; isError: boolean }, render: (data: T) => ReactNode): ReactNode {
  if (query.data !== undefined) return render(query.data);
  if (query.isError) return <span title="No se pudo cargar">—</span>;
  return <span className="text-faint">…</span>;
}

function joinWithY(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

/** Sujeto de "No se pudo cargar …" (en singular para que la frase de `ErrorState` concuerde). */
function sourceSubject(conversations: SourceQuery, requests: SourceQuery): string {
  if (conversations.isError && requests.isError) return "la información de canales";
  return conversations.isError ? "la lista de conversaciones" : "la lista de solicitudes";
}

function StatCard({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  );
}

/**
 * Carga y error por fuente: si una consulta no se pudo leer, la tarjeta muestra el error en vez de cifras
 * parciales. Si lo que falló fue una actualización, se mantienen las cifras ya calculadas (con aviso arriba).
 */
function SourceState({ sources, subject, children }: { sources: SourceQuery[]; subject: string; children: ReactNode }) {
  const failed = sources.filter((s) => s.isError && s.data === undefined);
  if (failed.length > 0) {
    return (
      <ErrorState
        error={failed[0]!.error}
        subject={subject}
        onRetry={() => {
          for (const source of failed) void source.refetch();
        }}
      />
    );
  }
  if (sources.some((s) => s.data === undefined)) {
    const offline = sources.some((s) => s.fetchStatus === "paused");
    return <LoadingState label={offline ? "Sin conexión. Se calculará al recuperar la red." : "Calculando…"} />;
  }
  return <>{children}</>;
}

function ChannelLegend() {
  return (
    <div className="flex gap-3 text-[11.5px] text-muted">
      <span className="flex items-center gap-[5px]">
        <span className="size-2 rounded-[2px] bg-brand-bar" aria-hidden="true" />
        Conversaciones
      </span>
      <span className="flex items-center gap-[5px]">
        <span className="size-2 rounded-[2px] bg-brand" aria-hidden="true" />
        Solicitudes
      </span>
    </div>
  );
}

function Bar({ percent, className }: { percent: number; className: string }) {
  return <div className={`h-2.5 rounded ${className}`} style={{ width: `${percent}%`, minWidth: percent > 0 ? 2 : 0 }} />;
}

function ChannelRows({ rows }: { rows: ChannelStat[] }) {
  const maxConversations = Math.max(0, ...rows.map((r) => r.conversations));
  const maxRequests = Math.max(0, ...rows.map((r) => r.requests));
  return (
    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
      {rows.map((r) => (
        <li key={r.channel} className="grid grid-cols-[90px_minmax(0,1fr)_70px] items-center gap-3">
          <span className="text-[13px] font-semibold">{CHANNELS[r.channel].label}</span>
          <div className="flex flex-col gap-1" aria-hidden="true">
            <Bar className="bg-brand-bar" percent={barPercent(r.conversations, maxConversations)} />
            <Bar className="bg-brand" percent={barPercent(r.requests, maxRequests, 60)} />
          </div>
          <span className="text-right text-xs text-muted">
            <span aria-hidden="true">
              {r.conversations} / {r.requests}
            </span>
            <span className="sr-only">
              {plural(r.conversations, "conversación", "conversaciones")} y {plural(r.requests, "solicitud", "solicitudes")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ServiceRows({ rows }: { rows: ServiceCount[] }) {
  if (rows.length === 0) return <EmptyState>Sin solicitudes con servicio en este periodo.</EmptyState>;
  const max = rows[0]!.count;
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
      {rows.map((s) => (
        <li key={s.name} className="flex flex-col gap-[5px]">
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold">{s.name}</span>
            <span className="shrink-0 text-muted">
              <span aria-hidden="true">{s.count}</span>
              <span className="sr-only">{plural(s.count, "solicitud", "solicitudes")}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-[3px] bg-segment" aria-hidden="true">
            <div className="h-1.5 rounded-[3px] bg-orange" style={{ width: `${barPercent(s.count, max)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function ReservationBars({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(0, ...buckets.map((b) => b.value));
  return (
    <ol className="m-0 flex h-40 list-none items-end gap-2.5 p-0">
      {buckets.map((b) => (
        <li
          key={b.key}
          title={`${b.detail}: ${plural(b.value, "reserva")}`}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
        >
          <span className="text-[11.5px] font-semibold text-slate" aria-hidden="true">
            {b.value}
          </span>
          <div
            className="w-full max-w-12 rounded-[6px_6px_2px_2px] bg-brand"
            style={{ height: barHeight(b.value, max) }}
            aria-hidden="true"
          />
          <span className="text-[11.5px] text-subtle" aria-hidden="true">
            {b.label}
          </span>
          <span className="sr-only">
            {b.detail}: {plural(b.value, "reserva")}
          </span>
        </li>
      ))}
    </ol>
  );
}
