"use client";

import type { ReactNode } from "react";
import type { Reservation } from "@/lib/api/types";
import { customerName, itemName } from "@/lib/domain/conversation";
import { PREPARED_STATUS } from "@/lib/domain/statuses";
import { WEEK_DAYS_SHORT, formatTime } from "@/lib/format/dates";
import { cn, orDash, plural } from "@/lib/format/text";
import { LoadingState } from "@/components/ui/state";
import { dayTitle, toDayKey, type CivilDate, type MonthCell } from "./calendar-utils";

/*
 * Las grillas usan `leading-[normal]` porque el mockup no fija interlineado: así las tarjetas y celdas
 * conservan la altura del diseño aprobado.
 */

interface ReservationGridProps {
  byDay: ReadonlyMap<string, Reservation[]>;
  selectedId: string | null;
  timeZone: string;
  /** Se muestran los datos del periodo anterior mientras llegan los del nuevo (keepPreviousData). */
  updating: boolean;
  onSelect: (id: string) => void;
}

/** Colores de tarjeta del mockup: seleccionada, preparada o normal (hover: borde azul). */
function cardTone(selected: boolean, prepared: boolean): string {
  if (selected) return "border-brand bg-brand-soft";
  if (prepared) return "border-bubble bg-[#f3faf6]";
  return "border-bubble bg-white";
}

function EmptyBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-dashed-line p-[30px] text-center text-[13.5px] text-subtle", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- semana

export function WeekGrid({
  days,
  selectedDayKey,
  todayKey,
  onOpenDay,
  byDay,
  selectedId,
  timeZone,
  updating,
  onSelect,
}: ReservationGridProps & {
  days: CivilDate[];
  /** Día de `fecha`: su encabezado va resaltado. */
  selectedDayKey: string;
  todayKey: string;
  onOpenDay: (date: CivilDate) => void;
}) {
  const total = days.reduce((sum, d) => sum + (byDay.get(toDayKey(d))?.length ?? 0), 0);

  return (
    <div
      aria-busy={updating || undefined}
      className={cn("grid flex-1 grid-cols-7 content-start gap-2 leading-[normal] transition-opacity", updating && "opacity-60")}
    >
      {days.map((date, i) => {
        const key = toDayKey(date);
        const items = byDay.get(key) ?? [];
        const selected = key === selectedDayKey;
        const isToday = key === todayKey;
        return (
          <div key={key} role="group" aria-label={dayTitle(date)} className="flex min-w-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => onOpenDay(date)}
              title={`Ver el ${dayTitle(date).toLowerCase()}`}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-px rounded-xl border-0 py-2",
                selected ? "bg-brand text-white" : isToday ? "bg-brand-tint text-ink" : "bg-[#f5f6f9] text-ink",
              )}
            >
              <span className="text-[11.5px] font-semibold">{WEEK_DAYS_SHORT[i]}</span>
              <span className="text-[18px] font-bold">{date.day}</span>
            </button>
            {items.map((r) => (
              <WeekCard key={r.id} reservation={r} selected={r.id === selectedId} timeZone={timeZone} onSelect={onSelect} />
            ))}
          </div>
        );
      })}
      {total === 0 && !updating ? <EmptyBox className="col-span-7">Sin reservas aceptadas esta semana.</EmptyBox> : null}
    </div>
  );
}

function WeekCard({
  reservation: r,
  selected,
  timeZone,
  onSelect,
}: {
  reservation: Reservation;
  selected: boolean;
  timeZone: string;
  onSelect: (id: string) => void;
}) {
  const prepared = r.status === PREPARED_STATUS;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(r.id)}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-[10px] border-[1.5px] px-[9px] py-2 text-left transition-colors hover:border-brand",
        cardTone(selected, prepared),
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="text-[12.5px] font-bold">{formatTime(r.reservationAt, timeZone)}</span>
        {prepared ? <span role="img" aria-label="Preparada" title="Preparada" className="size-2 shrink-0 rounded-full bg-[#1f9d55]" /> : null}
      </span>
      <span className="truncate text-[12.5px] font-semibold">{customerName(r.customer)}</span>
      <span className="truncate text-[11.5px] text-muted">
        {r.numberOfPeople} pers · {itemName(r.commercialItem)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- día

export function DayList({ date, byDay, selectedId, timeZone, updating, onSelect }: ReservationGridProps & { date: CivilDate }) {
  const items = byDay.get(toDayKey(date)) ?? [];

  return (
    <div className="flex flex-col gap-2 leading-[normal]">
      <h2 className="m-0 text-[15px] font-bold">{dayTitle(date)}</h2>
      {items.length === 0 ? (
        updating ? (
          <LoadingState label="Cargando reservas…" />
        ) : (
          <EmptyBox>Sin reservas aceptadas este día.</EmptyBox>
        )
      ) : (
        <ul
          role="list"
          aria-busy={updating || undefined}
          className={cn("m-0 flex list-none flex-col gap-2 p-0 transition-opacity", updating && "opacity-60")}
        >
          {items.map((r) => {
            const selected = r.id === selectedId;
            const prepared = r.status === PREPARED_STATUS;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[70px_minmax(0,1fr)_120px_160px_minmax(0,1fr)] items-center gap-3.5 rounded-xl border-[1.5px] px-4 py-3.5 text-left text-[13.5px] transition-colors hover:border-brand",
                    cardTone(selected, prepared),
                  )}
                >
                  <span className="text-[15px] font-bold">{formatTime(r.reservationAt, timeZone)}</span>
                  <span className="min-w-0 wrap-break-word font-semibold">
                    {customerName(r.customer)}
                    {prepared ? <span className="sr-only"> (preparada)</span> : null}
                  </span>
                  <span>{plural(r.numberOfPeople, "persona")}</span>
                  <span className="min-w-0 wrap-break-word text-slate">{itemName(r.commercialItem)}</span>
                  <span className="min-w-0 wrap-break-word text-muted">{orDash(r.notes)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- mes

export function MonthGrid({
  cells,
  byDay,
  todayKey,
  updating,
  onOpenDay,
}: {
  cells: MonthCell[];
  byDay: ReadonlyMap<string, Reservation[]>;
  todayKey: string;
  updating: boolean;
  onOpenDay: (date: CivilDate) => void;
}) {
  // Solo se consultan los días del mes: las celdas de otros meses no muestran cantidades.
  const total = cells.reduce((sum, c) => sum + (c.inMonth ? (byDay.get(c.key)?.length ?? 0) : 0), 0);

  return (
    <>
      <div
        aria-busy={updating || undefined}
        className={cn("grid grid-cols-7 gap-1.5 leading-[normal] transition-opacity", updating && "opacity-60")}
      >
        {WEEK_DAYS_SHORT.map((label) => (
          <div key={label} aria-hidden="true" className="py-1 text-center text-[11px] font-bold tracking-[.06em] text-subtle">
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const count = cell.inMonth ? (byDay.get(cell.key)?.length ?? 0) : 0;
          const isToday = cell.key === todayKey;
          const title = dayTitle(cell.date);
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onOpenDay(cell.date)}
              aria-label={cell.inMonth ? `${title}: ${count > 0 ? plural(count, "reserva") : "sin reservas"}` : title}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex h-[78px] cursor-pointer flex-col items-start justify-between rounded-xl border px-2.5 py-2 text-left transition-colors hover:border-brand",
                isToday ? "border-brand" : "border-card",
                cell.inMonth ? "bg-white" : "bg-surface opacity-35",
              )}
            >
              <span className={cn("text-[13.5px] font-bold", isToday ? "text-brand" : "text-ink")}>{cell.date.day}</span>
              {count > 0 ? (
                <span className="rounded-[6px] bg-brand-bubble px-[7px] py-0.5 text-[11.5px] font-semibold text-brand">
                  {plural(count, "reserva")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {total === 0 && !updating ? <EmptyBox>Sin reservas aceptadas este mes.</EmptyBox> : null}
    </>
  );
}
