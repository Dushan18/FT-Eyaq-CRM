"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import { reservationsApi, usersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { AssignReservationBody, Reservation } from "@/lib/api/types";
import { personName } from "@/lib/format/text";
import { Button, SectionLabel } from "@/components/ui/primitives";
import { SelectField } from "@/components/ui/fields";
import { InlineNotice } from "@/components/ui/state";
import { storeReservation } from "./reservation-cache";
import { actionErrorText, assignBody, assigneeAction, eligibleAssignees, shouldRefreshAfter, type Viewer } from "./reservation-actions";

/**
 * Responsable de la reserva (PATCH /reservations/:id/assignee). ADMIN elige entre los usuarios activos con
 * ADMIN u OPERATOR; un OPERATOR sin ADMIN solo puede «Tomar» una reserva libre o «Liberar» la suya.
 */
export function AssigneeSection({
  reservation,
  viewer,
  onSaved,
}: {
  reservation: Reservation;
  viewer: Viewer;
  onSaved: (updated: Reservation) => void;
}) {
  const queryClient = useQueryClient();
  const action = assigneeAction(reservation, viewer);
  const assigned = reservation.assignedUser;
  const name = assigned ? personName(assigned.firstName, assigned.lastName) : null;
  const isAdmin = viewer.roles.includes("ADMIN");

  const mutation = useMutation({
    mutationFn: (body: AssignReservationBody) => reservationsApi.assign(reservation.id, body),
    onSuccess: (updated) => {
      storeReservation(queryClient, updated, { stats: false });
      onSaved(updated);
    },
    // 403 (otro operador la tomó antes) o 409 (ya finalizó): se refresca para mostrar el responsable actual.
    onError: (error) => {
      if (shouldRefreshAfter(error)) void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
    },
  });
  const { reset } = mutation;
  useLayoutEffect(() => () => reset(), [reset]);

  const assign = (body: AssignReservationBody) => mutation.mutate(body);

  return (
    <section aria-label="Responsable" className="flex flex-col gap-2">
      <SectionLabel>Responsable</SectionLabel>
      <span className="text-[13.5px] font-semibold">{name ?? <span className="font-normal text-muted">Sin responsable</span>}</span>
      {assigned && !assigned.isEligible ? (
        <InlineNotice tone="warning">
          {name} ya no puede atender reservas: está inactivo o ya no tiene rol de administrador u operador.{" "}
          {isAdmin ? "Elige otro responsable." : "Un administrador puede reasignarla."}
        </InlineNotice>
      ) : null}

      {action === "select" ? (
        <AdminAssigneePicker
          // Al cambiar el responsable (guardado o leído de nuevo), el selector vuelve al valor actual.
          key={reservation.assignedUserId ?? "none"}
          reservation={reservation}
          pending={mutation.isPending}
          onAssign={assign}
        />
      ) : action === "take" && viewer.userId ? (
        <Button
          variant="link"
          className="h-9 px-3.5"
          disabled={mutation.isPending}
          onClick={() => assign({ assignedUserId: viewer.userId })}
        >
          {mutation.isPending ? "Guardando…" : "Tomar"}
        </Button>
      ) : action === "release" ? (
        <Button variant="outline" className="h-9 px-3.5" disabled={mutation.isPending} onClick={() => assign({ assignedUserId: null })}>
          {mutation.isPending ? "Guardando…" : "Liberar"}
        </Button>
      ) : null}

      {mutation.isError ? <InlineNotice tone="error">{actionErrorText("No se pudo cambiar el responsable.", mutation.error)}</InlineNotice> : null}
    </section>
  );
}

function AdminAssigneePicker({
  reservation,
  pending,
  onAssign,
}: {
  reservation: Reservation;
  pending: boolean;
  onAssign: (body: AssignReservationBody) => void;
}) {
  // GET /users es solo para ADMIN: este selector solo se monta para ADMIN.
  const users = useQuery({ queryKey: qk.users, queryFn: usersApi.list, staleTime: 60_000 });
  const current = reservation.assignedUserId ?? "";
  const [selected, setSelected] = useState(current);
  const candidates = eligibleAssignees(users.data ?? []);
  const currentMissing = current !== "" && !candidates.some((u) => u.id === current);
  const assigned = reservation.assignedUser;

  const hint = users.isError ? (
    <span>
      No se pudieron cargar los usuarios.{" "}
      <button
        type="button"
        onClick={() => void users.refetch()}
        className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-brand hover:underline"
      >
        Reintentar
      </button>
    </span>
  ) : users.isPending ? (
    "Cargando usuarios…"
  ) : candidates.length === 0 ? (
    "No hay usuarios activos con rol de administrador u operador."
  ) : undefined;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected !== current && !pending) onAssign(assignBody(selected));
      }}
    >
      <SelectField
        label="Cambiar responsable"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        disabled={pending || !users.data}
        hint={hint}
      >
        <option value="">Sin responsable</option>
        {currentMissing && assigned ? (
          // Reenviar un responsable que ya no es elegible responde 400: se muestra, pero no se puede elegir.
          <option value={current} disabled>
            {personName(assigned.firstName, assigned.lastName)}
            {users.data ? " (no disponible)" : ""}
          </option>
        ) : null}
        {candidates.map((u) => (
          <option key={u.id} value={u.id}>
            {personName(u.firstName, u.lastName)}
          </option>
        ))}
      </SelectField>
      <Button type="submit" variant="link" className="h-9 px-3.5" disabled={pending || selected === current}>
        {pending ? "Guardando…" : selected === "" && current !== "" ? "Quitar responsable" : "Asignar"}
      </Button>
    </form>
  );
}
