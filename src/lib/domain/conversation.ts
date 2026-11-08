import type { CommercialItemSummary, ContactChannel, Conversation, CustomerSummary, Message, OutboundMessageStatus } from "@/lib/api/types";
import { initials, personName } from "@/lib/format/text";

/** Respaldo de los canales cuyos clientes llegan sin teléfono ni correo (identidades del proveedor). */
const UNNAMED_BY_CHANNEL: Partial<Record<ContactChannel, string>> = {
  FACEBOOK: "Cliente de Messenger",
  INSTAGRAM: "Cliente de Instagram",
};

/**
 * Nombre visible de un cliente: nombre y apellido, o teléfono, o correo. Si no hay nada, un respaldo según
 * el canal. Los clientes de Messenger (FACEBOOK) y de Instagram no tienen teléfono ni correo, y bk-crm llena
 * `firstName` con el nombre del perfil cuando Meta lo da: puede tardar unos segundos tras el primer mensaje
 * o faltar si Meta falla. En Instagram, sin nombre en el perfil, `firstName` es el usuario con arroba
 * («@dushan1812») y se muestra tal cual.
 */
export function customerName(
  c: Pick<CustomerSummary, "firstName" | "lastName" | "phone" | "email"> | null | undefined,
  channel?: ContactChannel | null,
): string {
  if (!c) return "Cliente";
  const name = personName(c.firstName, c.lastName, "");
  return name || c.phone || c.email || (channel ? UNNAMED_BY_CHANNEL[channel] : undefined) || "Cliente sin nombre";
}

/**
 * Iniciales del avatar, solo de un nombre real. Sin nombre devuelve «?», como la lista de Clientes: las
 * iniciales del respaldo («Cliente de Messenger» → «CD») o de un teléfono («+») no dicen nada.
 */
export function customerInitials(c: Pick<CustomerSummary, "firstName" | "lastName"> | null | undefined): string {
  const name = c ? personName(c.firstName, c.lastName, "") : "";
  return name ? initials(name) : "?";
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

/**
 * INBOUND = cliente. OUTBOUND = equipo, salvo que haya salido de un borrador de Samanta aprobado:
 * en bk-crm todo saliente tiene autor (quien lo envió o quien aprobó el borrador), así que la única forma
 * de reconocer a Samanta es cruzar el id con `outboundMessageId` de los borradores APPROVED (`samantaIds`).
 */
export function messageAuthor(m: Pick<Message, "id" | "direction">, samantaIds?: ReadonlySet<string>): MessageAuthor {
  if (m.direction === "INBOUND") return "cliente";
  return samantaIds?.has(m.id) ? "samanta" : "operador";
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

/**
 * Prefijo de la vista previa en la lista ("Tú: ", "Equipo: "). La lista no consulta los borradores de cada
 * conversación, así que un mensaje aprobado desde Samanta se muestra como del equipo.
 */
export function previewPrefix(m: Pick<Message, "direction" | "authorUserId">, currentUserId: string | null): string {
  if (m.direction === "INBOUND") return "";
  return m.authorUserId && m.authorUserId === currentUserId ? "Tú: " : "Equipo: ";
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
