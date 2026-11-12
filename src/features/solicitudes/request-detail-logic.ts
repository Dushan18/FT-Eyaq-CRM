/**
 * Textos y reglas del detalle de una solicitud (GET /reservation-requests/:id) y de sus acciones de aprobar
 * y rechazar. Contrato: bk-crm/docs/frontend-api/03-clientes-reservas.md («Ver detalle», «Aprobar»,
 * «Rechazar», «Envío al WhatsApp del propietario», «Respuestas del propietario», «Aviso al cliente»).
 */
import type {
  CustomerNoticeError,
  ReservationRequestDetail,
  ReservationRequestStatus,
  ReservationRequestStatusEntry,
  RequestMessageStatus,
} from "@/lib/api/types";
import { REQUEST_REASON_MAX_LENGTH } from "@/lib/api/types";
import {
  APPROVABLE_REQUEST_STATUSES,
  DECIDED_REQUEST_STATUSES,
  REJECTABLE_REQUEST_STATUSES,
} from "@/lib/domain/statuses";
import { dayKey } from "@/lib/format/dates";
import { personName } from "@/lib/format/text";

export const canApproveRequest = (status: ReservationRequestStatus) => APPROVABLE_REQUEST_STATUSES.includes(status);
export const canRejectRequest = (status: ReservationRequestStatus) => REJECTABLE_REQUEST_STATUSES.includes(status);

/** Aprobar o rechazar desde el CRM no dispara el aviso automático (solo lo hacen las respuestas del propietario). */
export const CRM_DECISION_NOTICE = "Aprobar o rechazar desde el CRM no avisa al cliente: avísale por la Bandeja.";

/** Polling del detalle: más rápido mientras el backend envía la solicitud o espera al propietario. */
export function detailRefetchMs(status: ReservationRequestStatus | undefined): number {
  return status === "SENT_TO_OWNER" || status === "WAITING_RESPONSE" ? 5_000 : 15_000;
}

// ---------------------------------------------------------------- motivo del rechazo o la cancelación

/** null = sin motivo (se omite en el body); string = motivo recortado. */
export function reasonValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function reasonError(raw: string): string | undefined {
  return raw.trim().length > REQUEST_REASON_MAX_LENGTH ? `Escribe como máximo ${REQUEST_REASON_MAX_LENGTH} caracteres.` : undefined;
}

// ---------------------------------------------------------------- historial

/** Quién hizo el cambio: el propietario (con su nombre), Samanta, el sistema o el usuario del CRM. */
export function actorLabel(entry: Pick<ReservationRequestStatusEntry, "actorType" | "actor">): string {
  const name = entry.actor ? personName(entry.actor.firstName, entry.actor.lastName, "") : "";
  switch (entry.actorType) {
    case "OWNER":
      return name ? `Propietario · ${name}` : "Propietario";
    case "SAMANTA":
      return "Samanta";
    case "SYSTEM":
      return "Sistema";
    case "USER":
      return name || "Usuario del CRM";
  }
}

// ---------------------------------------------------------------- mensajes al propietario y al cliente

const OWNER_MESSAGE_LABEL: Record<RequestMessageStatus, string> = {
  QUEUED: "En cola",
  SENDING: "Enviando",
  SENT: "Enviada",
  DELIVERED: "Entregada",
  READ: "Leída",
  UNKNOWN: "Estado incierto",
  FAILED: "Falló",
};

const NOTICE_LABEL: Record<RequestMessageStatus, string> = {
  QUEUED: "En cola",
  SENDING: "Enviando",
  SENT: "Cliente avisado",
  DELIVERED: "Entregado",
  READ: "Leído",
  UNKNOWN: "Estado incierto",
  FAILED: "Falló",
};

export type MessageTone = "ok" | "pending" | "error";

function messageTone(status: RequestMessageStatus): MessageTone {
  if (status === "FAILED" || status === "UNKNOWN") return "error";
  if (status === "QUEUED" || status === "SENDING") return "pending";
  return "ok";
}

/** «Mensaje al propietario»: Enviada, Entregada, Leída o Falló (con su código); «No enviada» si es null. */
export function ownerMessageView(message: ReservationRequestDetail["ownerMessage"]): { label: string; tone: MessageTone | "none"; detail: string | null } {
  if (!message) return { label: "No enviada", tone: "none", detail: null };
  return { label: OWNER_MESSAGE_LABEL[message.status], tone: messageTone(message.status), detail: message.errorCode };
}

const CHANNEL_NAME: Record<"WHATSAPP" | "FACEBOOK" | "INSTAGRAM", string> = {
  WHATSAPP: "WhatsApp",
  FACEBOOK: "Messenger",
  INSTAGRAM: "Instagram",
};

/** «Aviso al cliente»: estado, canal y si salió como plantilla (ventana de 24 h cerrada). */
export function noticeMessageView(message: NonNullable<ReservationRequestDetail["customerNoticeMessage"]>): {
  label: string;
  tone: MessageTone;
  channel: string;
  template: boolean;
  detail: string | null;
} {
  return {
    label: NOTICE_LABEL[message.status],
    tone: messageTone(message.status),
    channel: CHANNEL_NAME[message.channel],
    template: message.templateName !== null,
    detail: message.errorCode,
  };
}

/** Motivo en español de `customerNoticeError` (tabla de «Aviso al cliente de la decisión»). */
export const CUSTOMER_NOTICE_ERROR_TEXT: Record<CustomerNoticeError, string> = {
  NO_CONSENT: "El cliente no nos escribió por WhatsApp ni dio su WhatsApp en el formulario.",
  PERSON_ATTENDING: "Una persona atiende su conversación.",
  WINDOW_CLOSED: "Pasaron más de 24 h desde su último mensaje, en un canal sin plantillas (Messenger o Instagram).",
  TEMPLATES_OFF: "Pasaron más de 24 h desde su último mensaje y las plantillas de aviso están desactivadas.",
  INCOMPLETE_FOR_TEMPLATE: "Faltan la fecha, la hora o las personas para enviar la plantilla.",
  CHANNEL_DISABLED: "El canal está desactivado en el servidor.",
  NO_RECIPIENT: "El canal no acepta su contacto.",
  OWNER_NUMBER: "El teléfono del cliente es el del propietario.",
};

/** Ya decidida y sin aviso ni error: se decidió en el CRM (sin aviso automático) o antes de M9.3. */
export function decidedWithoutNotice(
  detail: Pick<ReservationRequestDetail, "status" | "customerNoticeMessage" | "customerNoticeError">,
): boolean {
  return DECIDED_REQUEST_STATUSES.includes(detail.status) && detail.customerNoticeMessage === null && detail.customerNoticeError === null;
}

// ---------------------------------------------------------------- comentarios y enlaces

export interface CommentLine {
  text: string;
  /** Nota interna del backend o del equipo («CRM: …»): Samanta no la ve. */
  crm: boolean;
}

/** `comments` línea a línea; las que empiezan con «CRM: » se destacan. */
export function commentLines(comments: string | null): CommentLine[] {
  if (!comments) return [];
  return comments.split(/\r?\n/).map((text) => ({ text, crm: text.startsWith("CRM: ") }));
}

/** Calendario en el día de la reserva, con la reserva abierta. */
export function calendarHref(reservation: { id: string; reservationAt: string }, timeZone: string): string {
  const params = new URLSearchParams({ vista: "dia", fecha: dayKey(reservation.reservationAt, timeZone), reserva: reservation.id });
  return `/calendario?${params.toString()}`;
}
