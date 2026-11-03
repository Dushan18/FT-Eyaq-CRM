import type { CommercialItemSummary, Conversation, CustomerSummary, Message, OutboundMessageStatus } from "@/lib/api/types";
import { personName } from "@/lib/format/text";

/** Nombre visible de un cliente: nombre y apellido, o teléfono, o correo. */
export function customerName(c: Pick<CustomerSummary, "firstName" | "lastName" | "phone" | "email"> | null | undefined): string {
  if (!c) return "Cliente";
  const name = personName(c.firstName, c.lastName, "");
  return name || c.phone || c.email || "Cliente sin nombre";
}

/** Nombre visible de un servicio del catálogo. */
export function itemName(item: Pick<CommercialItemSummary, "nameEs" | "nameEn"> | null | undefined): string {
  return item?.nameEs ?? item?.nameEn ?? "—";
}

// ---------------------------------------------------------------- modo de atención

/**
 * Modo de la píldora del chat, derivado de la pausa y la asignación (el backend no tiene un campo "modo").
 * - samanta: el asistente no está en pausa.
 * - operador: en pausa y con un responsable humano.
 * - pausa: en pausa y sin responsable.
 */
export type ConversationMode = "samanta" | "pausa" | "operador";

export function conversationMode(c: Pick<Conversation, "isAssistantPaused" | "assignedUserId">): ConversationMode {
  if (!c.isAssistantPaused) return "samanta";
  return c.assignedUserId ? "operador" : "pausa";
}

export const MODE_META: Record<ConversationMode, { label: string; bg: string; fg: string; dot: string }> = {
  operador: { label: "Operador", bg: "#fff1e6", fg: "#b14a0b", dot: "#f26a1b" },
  pausa: { label: "En pausa", bg: "#f0f2f5", fg: "#4a5368", dot: "#8a92a5" },
  samanta: { label: "Samanta", bg: "#e8f6ee", fg: "#14753f", dot: "#1f9d55" },
};

// ---------------------------------------------------------------- mensajes

export type MessageAuthor = "cliente" | "samanta" | "operador";

/** INBOUND = cliente; OUTBOUND sin autor = automático (Samanta); OUTBOUND con autor = operador. */
export function messageAuthor(m: Pick<Message, "direction" | "authorUserId">): MessageAuthor {
  if (m.direction === "INBOUND") return "cliente";
  return m.authorUserId ? "operador" : "samanta";
}

/** Texto visible del mensaje; los adjuntos solo traen metadatos (no hay descarga en el backend). */
export function messageText(m: Pick<Message, "type" | "content" | "attachments">): string {
  const attachment = m.attachments[0];
  const label =
    m.type === "IMAGE"
      ? "[Imagen]"
      : m.type === "FILE"
        ? `[Archivo${attachment?.fileName ? `: ${attachment.fileName}` : ""}]`
        : null;
  if (label && m.content) return `${label} ${m.content}`;
  return label ?? m.content ?? "";
}

/** Prefijo de la vista previa en la lista ("Samanta: ", "Tú: "). */
export function previewPrefix(m: Pick<Message, "direction" | "authorUserId">, currentUserId: string | null): string {
  const author = messageAuthor(m);
  if (author === "samanta") return "Samanta: ";
  if (author === "operador") return m.authorUserId === currentUserId ? "Tú: " : "Operador: ";
  return "";
}

export const OUTBOUND_STATUS_LABEL: Record<OutboundMessageStatus, string> = {
  QUEUED: "En cola",
  SENDING: "Enviando",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  READ: "Leído",
  UNKNOWN: "Estado incierto",
  FAILED: "No se envió",
};

export function isOutboundProblem(status: Message["status"]): boolean {
  return status === "FAILED" || status === "UNKNOWN";
}
