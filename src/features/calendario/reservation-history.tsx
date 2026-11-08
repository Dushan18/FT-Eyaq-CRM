"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import { isConnectionError } from "@/lib/api/errors";
import { reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ReservationNote, ReservationRescheduleEntry } from "@/lib/api/types";
import { formatDayTime } from "@/lib/format/dates";
import { personName } from "@/lib/format/text";
import { Button, SectionLabel } from "@/components/ui/primitives";
import { TextAreaField } from "@/components/ui/fields";
import { storeReservationNote } from "./reservation-cache";
import { TEXT_MAX, reservationFormErrors, shouldRefreshAfter, validateNote } from "./reservation-actions";

const NOTE_UNCERTAIN = "No se pudo confirmar si la observación se guardó. Revisa la lista antes de intentarlo de nuevo.";

/**
 * Observaciones con autor (POST /reservations/:id/notes). Se pueden agregar en cualquier estado, también en
 * los finales. Son independientes del campo general «Notas» de la reserva. `notes` es null mientras el
 * detalle no ha llegado (el listado no trae historiales).
 */
export function NotesSection({
  reservationId,
  notes,
  canAdd,
  timeZone,
}: {
  reservationId: string;
  notes: readonly ReservationNote[] | null;
  canAdd: boolean;
  timeZone: string;
}) {
  return (
    <section aria-label="Observaciones" className="flex flex-col gap-2">
      <SectionLabel>Observaciones</SectionLabel>
      {notes === null ? (
        <span className="text-[12.5px] text-faint">Cargando observaciones…</span>
      ) : notes.length === 0 ? (
        <span className="text-[12.5px] text-muted">Sin observaciones.</span>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 rounded-[10px] bg-surface px-3 py-2">
              <span className="whitespace-pre-wrap wrap-break-word text-[13px] leading-normal">{note.content}</span>
              <span className="text-[11.5px] text-subtle">
                {personName(note.author.firstName, note.author.lastName)} · {formatDayTime(note.createdAt, timeZone)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {canAdd ? <NoteForm reservationId={reservationId} /> : null}
    </section>
  );
}

function NoteForm({ reservationId }: { reservationId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (content: string) => reservationsApi.addNote(reservationId, content),
    onSuccess: (note) => {
      storeReservationNote(queryClient, note);
      setText("");
      setError(null);
    },
    onError: (failure) => {
      const result = reservationFormErrors(failure, ["content"] as const, { uncertain: NOTE_UNCERTAIN });
      setError(result.fields.content ?? result.form);
      // No es idempotente: tras un error de conexión se relee la lista antes de que se repita.
      if (isConnectionError(failure) || shouldRefreshAfter(failure)) {
        void queryClient.invalidateQueries({ queryKey: qk.reservation(reservationId) });
      }
    },
  });
  const { reset } = mutation;
  useLayoutEffect(() => () => reset(), [reset]);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        const result = validateNote(text);
        if (result.error !== null) {
          setError(result.error);
          return;
        }
        setError(null);
        mutation.mutate(result.content);
      }}
    >
      <TextAreaField
        label="Nueva observación"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError(null);
        }}
        maxLength={TEXT_MAX}
        rows={2}
        disabled={mutation.isPending}
        error={error}
        placeholder="Ej.: pidió mesa junto a la ventana"
      />
      <Button type="submit" variant="link" className="h-9 px-3.5" disabled={mutation.isPending || text.trim() === ""}>
        {mutation.isPending ? "Guardando…" : "Agregar observación"}
      </Button>
    </form>
  );
}

/** Cambios de fecha (rescheduleHistory), del más antiguo al más reciente, como los devuelve bk-crm. */
export function RescheduleHistory({ entries, timeZone }: { entries: readonly ReservationRescheduleEntry[]; timeZone: string }) {
  if (entries.length === 0) return null;
  return (
    <section aria-label="Cambios de fecha" className="flex flex-col gap-2">
      <SectionLabel>Cambios de fecha</SectionLabel>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-1 rounded-[10px] bg-surface px-3 py-2 text-[13px] leading-normal">
            <span className="font-semibold">
              {formatDayTime(entry.previousReservationAt, timeZone)} <span aria-hidden="true">→</span>
              <span className="sr-only"> a </span> {formatDayTime(entry.newReservationAt, timeZone)}
            </span>
            {entry.reason ? <span className="whitespace-pre-wrap wrap-break-word">{entry.reason}</span> : null}
            <span className="text-[11.5px] text-subtle">
              {personName(entry.changedBy.firstName, entry.changedBy.lastName)} · {formatDayTime(entry.createdAt, timeZone)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
