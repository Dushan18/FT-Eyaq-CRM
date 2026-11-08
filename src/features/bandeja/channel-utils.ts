/**
 * Reglas de envío por canal (WhatsApp y Messenger). Ver docs/frontend-api-completo.md, Parte 04
 * («Enviar un mensaje de texto», «Estados y transiciones») y Parte 05 («Bandeja»).
 */
import {
  isSendableChannel,
  OUTBOUND_TEXT_MAX_LENGTH,
  type ContactChannel,
  type Message,
  type OutboundMessageErrorCode,
} from "@/lib/api/types";

/** Tope de content.length del cuadro de texto, o null si el canal no tiene envío. */
export function replyMaxLength(channel: ContactChannel): number | null {
  return isSendableChannel(channel) ? OUTBOUND_TEXT_MAX_LENGTH[channel] : null;
}

/** Nombre del canal en los textos de envío. */
export function sendChannelName(channel: ContactChannel): string {
  return channel === "FACEBOOK" ? "Messenger" : "WhatsApp";
}

type Suffix<T> = T extends `${"WHATSAPP" | "MESSENGER"}_${infer S}` ? S : never;
/** "RATE_LIMITED" | "SEND_UNKNOWN" | "SEND_INVALID" | "WINDOW_CLOSED" | "SEND_REJECTED" | "DELIVERY_FAILED" */
export type OutboundErrorKind = Suffix<OutboundMessageErrorCode>;

/** Tipo de fallo de un saliente, sin el prefijo del canal; null si el código no es de envío. */
export function outboundErrorKind(code: Message["errorCode"]): OutboundErrorKind | null {
  const kind = code?.replace(/^(?:WHATSAPP|MESSENGER)_/, "");
  return kind && kind in OUTBOUND_ERROR_TEXT ? (kind as OutboundErrorKind) : null;
}

/** Textos de fallo, válidos para los dos canales (Parte 04, «Estados y transiciones»). */
export const OUTBOUND_ERROR_TEXT: Record<OutboundErrorKind, string> = {
  RATE_LIMITED: "Reintentando…",
  SEND_UNKNOWN: "Estado incierto: verifica antes de reenviar",
  SEND_INVALID: "No se envió",
  WINDOW_CLOSED: "No se envió: pasaron más de 24 h desde el último mensaje del cliente",
  SEND_REJECTED: "No se envió: el canal lo rechazó",
  DELIVERY_FAILED: "No se pudo entregar",
};

export function outboundErrorText(code: Message["errorCode"]): string | null {
  const kind = outboundErrorKind(code);
  return kind ? OUTBOUND_ERROR_TEXT[kind] : null;
}

/** Texto de la ventana de 24 h cerrada, según el canal. */
export function windowClosedText(channel: ContactChannel): string {
  return channel === "FACEBOOK"
    ? "Pasaron más de 24 h desde el último mensaje del cliente en Messenger: podrás responder cuando vuelva a escribir."
    : "La ventana de 24 h de WhatsApp está cerrada: podrás responder cuando el cliente vuelva a escribir.";
}
