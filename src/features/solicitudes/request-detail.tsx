"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, ChannelDot, DetailList, Pill, SectionLabel } from "@/components/ui/primitives";
import { ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import { ApiError } from "@/lib/api/client";
import { requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ReservationRequest, ReservationRequestDetail } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta } from "@/lib/domain/channels";
import { customerName, itemName } from "@/lib/domain/conversation";
import { RESERVATION_STATUS, requestStatusView } from "@/lib/domain/statuses";
import { formatDayTime } from "@/lib/format/dates";
import { cn, plural } from "@/lib/format/text";
import { useOpenChat } from "@/lib/hooks/use-open-chat";
import { useRestaurant } from "@/lib/restaurant";
import {
  CUSTOMER_NOTICE_ERROR_TEXT,
  actorLabel,
  calendarHref,
  canApproveRequest,
  canRejectRequest,
  commentLines,
  decidedWithoutNotice,
  detailRefetchMs,
  noticeMessageView,
  ownerMessageView,
  type MessageTone,
} from "./request-detail-logic";
import { isEditableRequest } from "./request-form-logic";

const linkClass = "font-semibold text-brand hover:underline";

const TONE_CLASS: Record<MessageTone | "none", string> = {
  ok: "text-[#14753f]",
  pending: "text-[#b14a0b]",
  error: "text-[#b42323]",
  none: "text-muted",
};

export interface RequestDetailActions {
  onApprove?: (request: ReservationRequest) => void;
  onReject?: (request: ReservationRequest) => void;
  onEdit?: (request: ReservationRequest) => void;
  onCancel?: (request: ReservationRequest) => void;
}

/**
 * Detalle de una solicitud (GET /reservation-requests/:id, qk.request(id)) en un panel lateral, con polling:
 * el envío al propietario, su respuesta y el aviso al cliente cambian el estado sin acción del usuario.
 */
export function RequestDetailSheet({
  requestId,
  onClose,
  actions,
}: {
  requestId: string | null;
  onClose: () => void;
  actions: RequestDetailActions;
}) {
  return (
    <Dialog open={requestId !== null} onClose={onClose} title="Solicitud de reserva" placement="right" size="lg">
      {requestId ? <RequestDetailBody key={requestId} id={requestId} actions={actions} /> : null}
    </Dialog>
  );
}

function RequestDetailBody({ id, actions }: { id: string; actions: RequestDetailActions }) {
  const detail = useQuery({
    queryKey: qk.request(id),
    queryFn: () => requestsApi.get(id),
    refetchInterval: (query) => detailRefetchMs(query.state.data?.status),
  });

  if (detail.isPending) return <LoadingState label="Cargando la solicitud…" />;
  if (!detail.data) {
    const missing = detail.error instanceof ApiError && (detail.error.isNotFound || detail.error.status === 400);
    return missing ? (
      <p className="m-0 text-[13.5px] text-muted">No se encontró la solicitud. Puede que el enlace no sea válido.</p>
    ) : (
      <ErrorState error={detail.error} subject="la solicitud" onRetry={() => void detail.refetch()} />
    );
  }
  return <RequestDetailContent request={detail.data} actions={actions} stale={detail.isError} />;
}

function RequestDetailContent({
  request: r,
  actions,
  stale,
}: {
  request: ReservationRequestDetail;
  actions: RequestDetailActions;
  stale: boolean;
}) {
  const { timeZone } = useRestaurant();
  const session = useSession();
  const status = requestStatusView(r.status);
  const name = customerName(r.customer, r.sourceChannel);
  const canDecide = session.can("request.approve");
  const editable = isEditableRequest(r.status);
  const buttons = [
    canDecide && canApproveRequest(r.status) && actions.onApprove ? (
      <Button key="approve" className="h-8.5 px-3.5" onClick={() => actions.onApprove?.(r)}>
        Aprobar
      </Button>
    ) : null,
    canDecide && canRejectRequest(r.status) && actions.onReject ? (
      <Button key="reject" variant="outline" className="h-8.5 px-3.5" onClick={() => actions.onReject?.(r)}>
        Rechazar
      </Button>
    ) : null,
    editable && session.can("request.edit") && actions.onEdit ? (
      <Button key="edit" variant="outline" className="h-8.5 px-3.5" onClick={() => actions.onEdit?.(r)}>
        Editar
      </Button>
    ) : null,
    editable && session.can("request.cancel") && actions.onCancel ? (
      <Button key="cancel" variant="outline" className="h-8.5 px-3.5" onClick={() => actions.onCancel?.(r)}>
        Cancelar
      </Button>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-5 text-[13.5px] leading-normal">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-base font-bold">{r.code}</span>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <div className="flex items-center gap-2 text-muted">
          <ChannelDot channel={r.sourceChannel} />
          <span>
            {name} · {channelMeta(r.sourceChannel).label}
            {r.externalReference ? ` · Código web ${r.externalReference}` : ""}
          </span>
        </div>
        {buttons.length > 0 ? <div className="flex flex-wrap gap-2">{buttons}</div> : null}
        {stale ? <InlineNotice tone="warning">No se pudo actualizar: se muestran los últimos datos cargados.</InlineNotice> : null}
      </header>

      {r.status === "MODIFICATION_REQUESTED" ? (
        <InlineNotice tone="warning">
          El propietario propuso un cambio. Lee su propuesta en los comentarios y coordínala con el cliente por la Bandeja: la
          solicitud no cambia de estado desde el CRM.
        </InlineNotice>
      ) : null}

      {r.customerNoticeError ? <NoticeAlert request={r} /> : null}

      <Section title="DATOS">
        <DetailList
          rows={[
            { label: "Fecha", value: r.reservationAt ? formatDayTime(r.reservationAt, timeZone) : "Por definir", strong: true },
            { label: "Personas", value: r.numberOfPeople ? plural(r.numberOfPeople, "persona") : "Por definir", strong: true },
            { label: "Servicio", value: itemName(r.commercialItem) },
            { label: "Requerimientos", value: r.specialRequirements ?? "—" },
          ]}
        />
        <Comments comments={r.comments} />
      </Section>

      <Section title="PROPIETARIO Y CLIENTE">
        <DetailList rows={[{ label: "Mensaje al propietario", value: <OwnerMessage request={r} /> }, ...noticeRows(r)]} />
      </Section>

      {r.reservation ? (
        <Section title="RESERVA CREADA">
          <DetailList
            rows={[
              { label: "Código", value: r.reservation.code, strong: true },
              { label: "Estado", value: RESERVATION_STATUS[r.reservation.status].label },
              { label: "Fecha", value: formatDayTime(r.reservation.reservationAt, timeZone) },
            ]}
          />
          <Link href={calendarHref(r.reservation, timeZone)} className={cn(linkClass, "text-[13px]")}>
            Ver en el calendario
          </Link>
        </Section>
      ) : null}

      <Section title="HISTORIAL DE ESTADOS">
        <History request={r} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0">
        <SectionLabel>{title}</SectionLabel>
      </h3>
      {children}
    </section>
  );
}

/** `comments` con sus saltos de línea; las líneas «CRM: …» (notas internas) se destacan. */
function Comments({ comments }: { comments: string | null }) {
  const lines = commentLines(comments);
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-surface px-3 py-2.5" aria-label="Comentarios">
      {lines.map((line, i) =>
        line.crm ? (
          <p key={i} className="m-0 rounded-md bg-[#fff1e6] px-2 py-1 text-[12.5px] font-semibold text-[#9a3a06]">
            {line.text}
          </p>
        ) : (
          <p key={i} className="m-0 whitespace-pre-wrap text-slate">
            {line.text || " "}
          </p>
        ),
      )}
    </div>
  );
}

function OwnerMessage({ request }: { request: ReservationRequestDetail }) {
  const view = ownerMessageView(request.ownerMessage);
  return (
    <span className={TONE_CLASS[view.tone]}>
      {view.label}
      {view.detail ? <span className="text-muted"> ({view.detail})</span> : null}
    </span>
  );
}

function noticeRows(r: ReservationRequestDetail) {
  if (r.customerNoticeMessage) {
    const view = noticeMessageView(r.customerNoticeMessage);
    return [
      {
        label: "Aviso al cliente",
        value: (
          <span className={TONE_CLASS[view.tone]}>
            {view.label}
            {view.detail ? <span className="text-muted"> ({view.detail})</span> : null}
            <span className="text-muted">
              {" "}
              · por {view.channel}
              {view.template ? " · con plantilla" : ""}
            </span>
          </span>
        ),
      },
    ];
  }
  if (r.customerNoticeError) {
    return [{ label: "Aviso al cliente", value: <span className={TONE_CLASS.error}>No se pudo avisar</span> }];
  }
  if (decidedWithoutNotice(r)) {
    return [{ label: "Aviso al cliente", value: "Decidida en el CRM; el cliente no fue avisado automáticamente." }];
  }
  return [{ label: "Aviso al cliente", value: <span className="text-muted">Pendiente de la decisión del propietario</span> }];
}

/** Alerta «Avisar al cliente» con el motivo y un botón para abrir su chat. */
function NoticeAlert({ request }: { request: ReservationRequestDetail }) {
  const router = useRouter();
  const chat = useOpenChat();
  const reason = request.customerNoticeError ? CUSTOMER_NOTICE_ERROR_TEXT[request.customerNoticeError] : "";
  const openChat = () => {
    if (request.conversationId) router.push(`/bandeja?c=${request.conversationId}`);
    else void chat.open(request.customerId, request.sourceChannel);
  };
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[10px] bg-[#fdecec] px-3 py-2.5 text-[13px] text-[#b42323]">
      <strong>Avisar al cliente</strong>
      <span>No se le pudo avisar automáticamente la decisión del propietario: {reason}</span>
      <div>
        <Button variant="outline" className="h-8 px-3" onClick={openChat} disabled={chat.pendingId === request.customerId}>
          {chat.pendingId === request.customerId ? "Abriendo…" : "Abrir el chat del cliente"}
        </Button>
        {chat.notFound === request.customerId ? <span className="ml-2">El cliente no tiene conversación.</span> : null}
        {chat.failed === request.customerId ? <span className="ml-2">No se pudo abrir el chat.</span> : null}
      </div>
    </div>
  );
}

function History({ request }: { request: ReservationRequestDetail }) {
  const { timeZone } = useRestaurant();
  if (request.statusHistory.length === 0) {
    return <p className="m-0 text-[13px] text-subtle">Sin cambios de estado registrados.</p>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Historial de estados">
      {request.statusHistory.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5 rounded-[10px] border border-line px-3 py-2">
          <span className="font-semibold">
            {requestStatusView(entry.previousStatus).label} → {requestStatusView(entry.newStatus).label}
          </span>
          <span className="text-xs text-muted">
            {actorLabel(entry)} · {formatDayTime(entry.createdAt, timeZone)}
          </span>
          {entry.reason ? <span className="whitespace-pre-wrap text-[12.5px] text-slate">{entry.reason}</span> : null}
        </li>
      ))}
    </ol>
  );
}
