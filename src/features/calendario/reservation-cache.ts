/**
 * Caché de reservas tras cada mutación (docs/frontend-api-completo.md, Parte 05, «Mapa de invalidaciones»).
 * Las respuestas de los PATCH no traen `noteHistory` ni `rescheduleHistory`: se mezclan con el detalle en
 * caché para no perderlos, y la invalidación de `qk.reservationsAll` vuelve a leer el detalle y el calendario.
 */
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/query-keys";
import type { Reservation, ReservationDetail, ReservationNote } from "@/lib/api/types";

/**
 * Mezcla la respuesta de un PATCH (sin historiales) con el detalle e invalida lo que depende de la reserva.
 * `stats`: editar, cambiar el estado y reprogramar cambian Estadísticas; asignar no.
 */
export function storeReservation(queryClient: QueryClient, updated: Reservation, options: { stats: boolean }) {
  queryClient.setQueryData<ReservationDetail>(qk.reservation(updated.id), (old) => (old ? { ...old, ...updated } : old));
  void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
  if (options.stats) void queryClient.invalidateQueries({ queryKey: qk.statsAll });
}

/**
 * Agrega la observación nueva al final de noteHistory (ordenado por createdAt ascendente). Si el detalle
 * aún no estaba en caché, lo vuelve a pedir. El listado no cambia.
 */
export function storeReservationNote(queryClient: QueryClient, note: ReservationNote) {
  const key = qk.reservation(note.reservationId);
  if (!queryClient.getQueryData<ReservationDetail>(key)) {
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData<ReservationDetail>(key, (old) =>
    old ? { ...old, noteHistory: old.noteHistory.some((n) => n.id === note.id) ? old.noteHistory : [...old.noteHistory, note] } : old,
  );
}

/** Tras POST /reservations: la reserva nueva no tiene observaciones ni cambios de fecha. */
export function storeCreatedReservation(queryClient: QueryClient, created: Reservation) {
  queryClient.setQueryData<ReservationDetail>(qk.reservation(created.id), { ...created, noteHistory: [], rescheduleHistory: [] });
  void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
  void queryClient.invalidateQueries({ queryKey: qk.statsAll });
}
