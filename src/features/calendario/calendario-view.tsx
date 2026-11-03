"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { collectPages } from "@/lib/api/client";
import { reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import { useSession } from "@/lib/auth/session";
import { useNow } from "@/lib/hooks/use-now";
import { pickOption, useUrlParams } from "@/lib/hooks/use-url-state";
import { useRestaurant } from "@/lib/restaurant";
import { PageHeader, Panel, Segmented } from "@/components/ui/primitives";
import { ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import { DayList, MonthGrid, WeekGrid } from "./calendar-grids";
import {
  CALENDAR_VIEWS,
  DEFAULT_CALENDAR_VIEW,
  civilDateOf,
  groupByDay,
  isUuid,
  monthGrid,
  parseDayKey,
  periodRange,
  periodSubtitle,
  reservationsPageQuery,
  shiftAnchor,
  toDayKey,
  weekDays,
  type CalendarView,
  type CivilDate,
} from "./calendar-utils";
import { ReservationDetailPanel } from "./reservation-detail";

const VIEW_OPTIONS: ReadonlyArray<{ value: CalendarView; label: string }> = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

const NAV_LABELS: Record<CalendarView, { prev: string; next: string }> = {
  dia: { prev: "Día anterior", next: "Día siguiente" },
  semana: { prev: "Semana anterior", next: "Semana siguiente" },
  mes: { prev: "Mes anterior", next: "Mes siguiente" },
};

/** Páginas de 100 reservas que se leen como máximo por periodo. */
const MAX_PAGES = 20;

const navButtonClass =
  "grid h-8 cursor-pointer place-items-center rounded-[9px] border border-button bg-white font-semibold text-ink-2 transition-colors hover:bg-[#f5f7fa]";

/**
 * Calendario de reservas aceptadas. Estado en la URL: `vista` (dia | semana | mes), `fecha` (YYYY-MM-DD en
 * la zona del restaurante; por defecto hoy) y `reserva` (id seleccionado).
 */
export function CalendarioView() {
  const url = useUrlParams();
  const session = useSession();
  // El marco monta la vista (oculta) mientras carga la sesión: no se consulta hasta saber que el rol puede
  // leer reservas (SUPPORT recibiría 403).
  const canRead = session.status === "ready" && session.canView("calendario");
  const { timeZone } = useRestaurant();
  const now = useNow();
  const today = civilDateOf(now, timeZone);
  const todayKey = toDayKey(today);
  const view = pickOption(url.get("vista"), CALENDAR_VIEWS, DEFAULT_CALENDAR_VIEW);
  const anchor = parseDayKey(url.get("fecha")) ?? today;
  const reservaParam = url.get("reserva");
  const selectedId = isUuid(reservaParam) ? reservaParam : null;

  const range = periodRange(view, anchor, timeZone);
  const list = useQuery({
    queryKey: qk.reservations({ scope: "calendario", dateFrom: range.dateFrom, dateTo: range.dateTo }),
    queryFn: () => collectPages((page, limit) => reservationsApi.list(reservationsPageQuery(range, page, limit)), MAX_PAGES),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    enabled: canRead,
  });

  const rows = list.data?.rows;
  const byDay = useMemo(() => groupByDay(rows ?? [], timeZone), [rows, timeZone]);
  const selectedRow = selectedId ? rows?.find((r) => r.id === selectedId) : undefined;

  // Hoy es el valor por defecto de `fecha`: no se escribe en la URL.
  const fechaParam = (date: CivilDate) => (toDayKey(date) === todayKey ? null : toDayKey(date));
  const goTo = (date: CivilDate) => url.set({ fecha: fechaParam(date) });
  const openDay = (date: CivilDate) => url.set({ vista: "dia", fecha: fechaParam(date) });
  const select = (id: string) => url.set({ reserva: id });

  let body: ReactNode;
  if (list.isPending) {
    body = <LoadingState label="Cargando reservas…" />;
  } else if (!list.data) {
    body = <ErrorState error={list.error} subject="las reservas" onRetry={() => void list.refetch()} />;
  } else {
    const grid = { byDay, selectedId, timeZone, updating: list.isPlaceholderData, onSelect: select };
    body =
      view === "semana" ? (
        <WeekGrid days={weekDays(anchor)} selectedDayKey={toDayKey(anchor)} todayKey={todayKey} onOpenDay={openDay} {...grid} />
      ) : view === "dia" ? (
        <DayList date={anchor} {...grid} />
      ) : (
        <MonthGrid cells={monthGrid(anchor)} byDay={byDay} todayKey={todayKey} updating={list.isPlaceholderData} onOpenDay={openDay} />
      );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)] gap-3">
      <Panel className="flex flex-col gap-[22px] overflow-y-auto px-8 py-7">
        <PageHeader
          title="Calendario"
          subtitle={`Solo reservas aceptadas por el dueño. ${periodSubtitle(view, anchor)}`.trim()}
          actions={
            <div className="flex items-center gap-3">
              <div role="group" aria-label="Cambiar de periodo" className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={NAV_LABELS[view].prev}
                  title={NAV_LABELS[view].prev}
                  onClick={() => goTo(shiftAnchor(anchor, view, -1))}
                  className={`${navButtonClass} w-8 text-[17px] leading-none`}
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  title="Ir a hoy"
                  onClick={() => url.set({ fecha: null })}
                  className={`${navButtonClass} px-3 text-[13px]`}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  aria-label={NAV_LABELS[view].next}
                  title={NAV_LABELS[view].next}
                  onClick={() => goTo(shiftAnchor(anchor, view, 1))}
                  className={`${navButtonClass} w-8 text-[17px] leading-none`}
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
              <Segmented
                ariaLabel="Vista del calendario"
                options={VIEW_OPTIONS}
                value={view}
                onChange={(value) => url.set({ vista: value === DEFAULT_CALENDAR_VIEW ? null : value })}
              />
            </div>
          }
        />

        {list.data?.truncated ? (
          <InlineNotice tone="warning">Se muestran las primeras {list.data.rows.length} reservas de este periodo.</InlineNotice>
        ) : null}
        {list.isError && list.data ? (
          <InlineNotice tone="warning">
            No se pudo actualizar el calendario; se muestran los últimos datos cargados.{" "}
            <button
              type="button"
              onClick={() => void list.refetch()}
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold underline"
            >
              Reintentar
            </button>
          </InlineNotice>
        ) : null}

        {body}
      </Panel>

      <ReservationDetailPanel reservationId={selectedId} listRow={selectedRow} enabled={canRead} />
    </div>
  );
}
