"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { collectPages } from "@/lib/api/client";
import { reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { Reservation } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { BREAKPOINTS, useMediaQuery } from "@/lib/hooks/use-media-query";
import { useNow } from "@/lib/hooks/use-now";
import { pickOption, useUrlParams } from "@/lib/hooks/use-url-state";
import { useRestaurant } from "@/lib/restaurant";
import { Button, PageHeader, Panel, Segmented } from "@/components/ui/primitives";
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
import { ReservationDetailPanel, ReservationDetailSheet } from "./reservation-detail";
import { NewReservationDialog } from "./reservation-dialogs";

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
 * Calendario de reservas (sin las canceladas). Estado en la URL: `vista` (dia | semana | mes), `fecha`
 * (YYYY-MM-DD en la zona del restaurante; por defecto hoy) y `reserva` (id seleccionado).
 *
 * En bk-crm las reservas solo se crean con «Nueva reserva» (POST /reservations, solo ADMIN): todavía no
 * existe el paso «solicitud aceptada → reserva». El modo simulado sí crea reservas desde solicitudes.
 */
export function CalendarioView() {
  const url = useUrlParams();
  const session = useSession();
  // El marco monta la vista (oculta) mientras carga la sesión: no se consulta hasta saber que el rol puede
  // leer reservas (SUPPORT recibiría 403).
  const canRead = session.status === "ready" && session.canView("calendario");
  const canCreate = session.status === "ready" && session.can("reservation.create");
  const [creating, setCreating] = useState(false);
  // Al ocultarse la vista (Activity) no queda abierto el diálogo.
  useLayoutEffect(() => () => setCreating(false), []);
  const { timeZone } = useRestaurant();
  const now = useNow();
  const today = civilDateOf(now, timeZone);
  const todayKey = toDayKey(today);
  const view = pickOption(url.get("vista"), CALENDAR_VIEWS, DEFAULT_CALENDAR_VIEW);
  const anchor = parseDayKey(url.get("fecha")) ?? today;
  const reservaParam = url.get("reserva");
  const selectedId = isUuid(reservaParam) ? reservaParam : null;
  const detailColumn = useMediaQuery(BREAKPOINTS.xl);

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
  // Tras crearla se abre su día (conservando la vista) y su detalle.
  const created = (reservation: Reservation) => {
    setCreating(false);
    url.set({ reserva: reservation.id, fecha: fechaParam(civilDateOf(reservation.reservationAt, timeZone)) });
  };
  const anchorKey = toDayKey(anchor);

  const emptyHint = (
    <div className="mt-2 flex flex-col items-center gap-3 text-[12.5px] leading-normal text-muted">
      <p className="m-0 max-w-md text-pretty">
        {canCreate
          ? "Las reservas se registran con «Nueva reserva»: elige al cliente, la fecha y la hora, y cuántas personas vienen."
          : "Las reservas las registra un administrador con «Nueva reserva». Aparecerán aquí en cuanto haya alguna en este periodo."}
      </p>
      {canCreate ? (
        <Button className="h-9 px-4" onClick={() => setCreating(true)}>
          Nueva reserva
        </Button>
      ) : null}
    </div>
  );

  let body: ReactNode;
  if (list.isPending) {
    body = <LoadingState label="Cargando reservas…" />;
  } else if (!list.data) {
    body = <ErrorState error={list.error} subject="las reservas" onRetry={() => void list.refetch()} />;
  } else {
    const grid = { byDay, emptyHint, selectedId, timeZone, updating: list.isPlaceholderData, onSelect: select };
    body =
      view === "semana" ? (
        <WeekGrid days={weekDays(anchor)} selectedDayKey={anchorKey} todayKey={todayKey} onOpenDay={openDay} {...grid} />
      ) : view === "dia" ? (
        <DayList date={anchor} {...grid} />
      ) : (
        <MonthGrid
          cells={monthGrid(anchor)}
          byDay={byDay}
          emptyHint={emptyHint}
          todayKey={todayKey}
          updating={list.isPlaceholderData}
          onOpenDay={openDay}
        />
      );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Panel className="flex flex-col gap-5.5 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <PageHeader
          title="Calendario"
          subtitle={`Reservas registradas, sin las canceladas. ${periodSubtitle(view, anchor)}`.trim()}
          actions={
            <div className="flex flex-wrap items-center gap-3">
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
              {canCreate ? (
                <Button className="h-8 px-3.5" onClick={() => setCreating(true)}>
                  Nueva reserva
                </Button>
              ) : null}
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

      {/* Desde xl, columna derecha; más estrecho, panel lateral que se abre al elegir una reserva. */}
      {detailColumn ? (
        <ReservationDetailPanel reservationId={selectedId} listRow={selectedRow} enabled={canRead} />
      ) : (
        <ReservationDetailSheet
          reservationId={selectedId}
          listRow={selectedRow}
          enabled={canRead}
          onClose={() => url.set({ reserva: null })}
        />
      )}

      {creating && canCreate ? (
        <NewReservationDialog
          initialDay={anchorKey >= todayKey ? anchorKey : todayKey}
          onClose={() => setCreating(false)}
          onCreated={created}
        />
      ) : null}
    </div>
  );
}
