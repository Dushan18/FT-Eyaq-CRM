"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { TextAreaField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";
import { ApiError } from "@/lib/api/client";
import { requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import { REQUEST_REASON_MAX_LENGTH, type Reservation, type ReservationRequest } from "@/lib/api/types";
import { customerName, itemName } from "@/lib/domain/conversation";
import { formatDayTime } from "@/lib/format/dates";
import { plural } from "@/lib/format/text";
import { serverFormErrors } from "@/lib/forms/server-errors";
import { useRestaurant } from "@/lib/restaurant";
import { CRM_DECISION_NOTICE, reasonError, reasonValue } from "./request-detail-logic";

type RequestLike = Pick<
  ReservationRequest,
  "id" | "code" | "customer" | "sourceChannel" | "reservationAt" | "numberOfPeople" | "commercialItem"
>;

/** Texto de un error de aprobar o rechazar: los de negocio llegan en español y se muestran tal cual. */
function decisionError(error: unknown): string {
  return serverFormErrors(error, []).form ?? "Inténtalo de nuevo.";
}

/**
 * Tras una decisión se releen las solicitudes (lista, KPI, detalle con su historial) y Estadísticas; al
 * aprobar, también el calendario. La respuesta no se guarda en qk.request(id): no trae statusHistory.
 */
function useDecisionInvalidation() {
  const queryClient = useQueryClient();
  return (withReservations: boolean) => {
    void queryClient.invalidateQueries({ queryKey: qk.requestsAll });
    void queryClient.invalidateQueries({ queryKey: qk.statsAll });
    if (withReservations) void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
  };
}

function RequestSummary({ request }: { request: RequestLike }) {
  const { timeZone } = useRestaurant();
  return (
    <p className="m-0">
      {customerName(request.customer, request.sourceChannel)} ·{" "}
      {request.reservationAt ? formatDayTime(request.reservationAt, timeZone) : "fecha por definir"} ·{" "}
      {request.numberOfPeople ? plural(request.numberOfPeople, "persona") : "personas por definir"}
      {request.commercialItem ? ` · ${itemName(request.commercialItem)}` : ""}
    </p>
  );
}

// ---------------------------------------------------------------- aprobar

/** Confirmación de POST …/approve: crea la reserva CONFIRMED y la solicitud pasa a «Aceptada». */
export function ApproveRequestDialog({
  request,
  onClose,
  onApproved,
}: {
  request: RequestLike | null;
  onClose: () => void;
  onApproved?: (result: { request: ReservationRequest; reservation: Reservation }) => void;
}) {
  return request ? <ApproveBody key={request.id} request={request} onClose={onClose} onApproved={onApproved} /> : null;
}

function ApproveBody({
  request,
  onClose,
  onApproved,
}: {
  request: RequestLike;
  onClose: () => void;
  onApproved?: (result: { request: ReservationRequest; reservation: Reservation }) => void;
}) {
  const invalidate = useDecisionInvalidation();
  const approve = useMutation({
    mutationFn: () => requestsApi.approve(request.id),
    onSuccess: (result) => {
      invalidate(true);
      onApproved?.(result);
      onClose();
    },
    onError: (error) => {
      // Otra persona (o el propietario por WhatsApp) ya la decidió: se relee.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) invalidate(true);
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="¿Aprobar la solicitud?"
      description={request.code}
      busy={approve.isPending}
      size="sm"
      footer={
        <>
          <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={approve.isPending} data-autofocus>
            Volver
          </Button>
          <Button className="h-9 px-4" onClick={() => approve.mutate()} disabled={approve.isPending}>
            {approve.isPending ? "Aprobando…" : "Aprobar y crear la reserva"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13.5px]">
        <RequestSummary request={request} />
        <p className="m-0">
          Se crea la reserva confirmada en el calendario y la solicitud pasa a «Aceptada». No se puede deshacer: para anularla,
          cancela la reserva en el calendario.
        </p>
        <InlineNotice tone="warning">{CRM_DECISION_NOTICE}</InlineNotice>
        {approve.isError ? <InlineNotice tone="error">No se pudo aprobar. {decisionError(approve.error)}</InlineNotice> : null}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- rechazar

/** Confirmación de POST …/reject, con motivo opcional (1–1000 caracteres) que queda en el historial. */
export function RejectRequestDialog({
  request,
  onClose,
  onRejected,
}: {
  request: RequestLike | null;
  onClose: () => void;
  onRejected?: (request: ReservationRequest) => void;
}) {
  return request ? <RejectBody key={request.id} request={request} onClose={onClose} onRejected={onRejected} /> : null;
}

function RejectBody({
  request,
  onClose,
  onRejected,
}: {
  request: RequestLike;
  onClose: () => void;
  onRejected?: (request: ReservationRequest) => void;
}) {
  const invalidate = useDecisionInvalidation();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const fieldError = touched ? reasonError(reason) : undefined;
  const reject = useMutation({
    mutationFn: (text: string | null) => requestsApi.reject(request.id, text ?? undefined),
    onSuccess: (saved) => {
      invalidate(false);
      onRejected?.(saved);
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) invalidate(false);
    },
  });

  function submit() {
    setTouched(true);
    if (reasonError(reason) || reject.isPending) return;
    reject.mutate(reasonValue(reason));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="¿Rechazar la solicitud?"
      description={request.code}
      busy={reject.isPending}
      size="sm"
      footer={
        <>
          <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={reject.isPending}>
            Volver
          </Button>
          <Button className="h-9 px-4" onClick={submit} disabled={reject.isPending}>
            {reject.isPending ? "Rechazando…" : "Rechazar solicitud"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13.5px]">
        <RequestSummary request={request} />
        <p className="m-0">La solicitud pasa a «Rechazada» y no se crea ninguna reserva. Es un estado final.</p>
        <TextAreaField
          label="Motivo (opcional)"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={REQUEST_REASON_MAX_LENGTH}
          error={fieldError}
          hint="Queda en el historial de la solicitud."
          data-autofocus
        />
        <InlineNotice tone="warning">{CRM_DECISION_NOTICE}</InlineNotice>
        {reject.isError ? <InlineNotice tone="error">No se pudo rechazar. {decisionError(reject.error)}</InlineNotice> : null}
      </div>
    </Dialog>
  );
}
