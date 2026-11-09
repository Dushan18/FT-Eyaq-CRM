/**
 * Lógica pura de la Bandeja (sin React). Todo lo que se deriva aquí sale de los datos reales del
 * backend; lo que el backend no tiene (eventos de sistema, vista previa, modo) se calcula o se omite.
 */
import { ApiError } from "@/lib/api/client";
import type {
  ContactChannel,
  Conversation,
  Message,
  Reservation,
  ReservationRequest,
} from "@/lib/api/types";
import { isSendableChannel } from "@/lib/api/types";
import { isConnectionError, isDisabledInServer } from "@/lib/api/errors";
import {
  outboundErrorKind,
  outboundErrorText,
  sendChannelName,
  windowClosedText,
} from "./channel-utils";
import type { RoleCode } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { channelMeta } from "@/lib/domain/channels";
import { conversationMode, messageAuthor } from "@/lib/domain/conversation";
import { RESERVATION_STATUS, requestStatusView } from "@/lib/domain/statuses";
import { TONES, type Tone } from "@/lib/domain/tones";
import { personName } from "@/lib/format/text";

// ---------------------------------------------------------------- parámetros de la URL

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El backend responde 400 a un :id que no es UUID: se valida antes de consultar. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

const CHANNEL_SLUGS = {
  whatsapp: "WHATSAPP",
  facebook: "FACEBOOK",
  instagram: "INSTAGRAM",
  web: "WEBSITE",
} as const satisfies Record<string, ContactChannel>;

export function channelFromSlug(
  slug: string | null,
): ContactChannel | undefined {
  return slug && slug in CHANNEL_SLUGS
    ? CHANNEL_SLUGS[slug as keyof typeof CHANNEL_SLUGS]
    : undefined;
}

export function slugFromChannel(
  channel: ContactChannel | undefined,
): string | null {
  if (!channel) return null;
  const entry = Object.entries(CHANNEL_SLUGS).find(
    ([, value]) => value === channel,
  );
  return entry ? entry[0] : null;
}

// ---------------------------------------------------------------- mensajes

/**
 * Une la página reciente (sondeada) con las páginas anteriores cargadas a pedido.
 * Deduplica por id (la paginación por desplazamiento se corre cuando llegan mensajes nuevos),
 * prefiere la versión reciente (trae el último estado de entrega) y ordena por `sequence`.
 */
export function mergeMessages(
  recent: readonly Message[],
  older: readonly Message[],
): Message[] {
  const byId = new Map<string, Message>();
  for (const m of older) byId.set(m.id, m);
  for (const m of recent) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

/** Hora que se muestra en la burbuja: la del proveedor para entrantes y la de envío para salientes. */
export function messageTimestamp(m: Message): string {
  if (m.direction === "INBOUND")
    return m.occurredAt ?? m.receivedAt ?? m.createdAt;
  return m.sentAt ?? m.createdAt;
}

/** Último mensaje del cliente entre los cargados (ms), o null si no hay. */
export function lastInboundAt(messages: readonly Message[]): number | null {
  let last: number | null = null;
  for (const m of messages) {
    if (m.direction !== "INBOUND") continue;
    const at = Date.parse(messageTimestamp(m));
    if (!Number.isNaN(at) && (last === null || at > last)) last = at;
  }
  return last;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Estimación de la ventana de 24 h de WhatsApp, Messenger e Instagram (el backend no la expone). Usa la misma regla
 * que el backend: el último mensaje entrante con `occurredAt` en las últimas 24 h. El backend puede ser más
 * estricto (teléfono, PSID o número/página del negocio distintos), nunca más permisivo; su respuesta manda.
 */
export function estimateReplyWindow(
  messages: readonly Message[],
  now: number,
): { open: boolean; closesAt: number | null } {
  let last = 0;
  for (const m of messages) {
    if (m.direction !== "INBOUND" || !m.occurredAt) continue;
    last = Math.max(last, Date.parse(m.occurredAt));
  }
  if (!last) return { open: false, closesAt: null };
  const closesAt = last + WINDOW_MS;
  return { open: closesAt > now, closesAt };
}

export type StatusTone = "muted" | "warning" | "error";

/**
 * Estado de entrega visible de un mensaje saliente (WhatsApp y Messenger). Lo normal es silencioso: para los
 * mensajes de Samanta solo se muestran problemas o envíos en curso; para los del equipo, además, los checks.
 * `*_RATE_LIMITED` llega en QUEUED y también en el SENDING del reintento. Messenger nunca llega a READ.
 */
export function outboundStatusView(
  m: Message,
  isSamanta = false,
): { text: string; tone: StatusTone } | null {
  if (m.direction !== "OUTBOUND") return null;
  const byTeam = !isSamanta;
  switch (m.status) {
    case "QUEUED":
    case "SENDING":
      return {
        text:
          outboundErrorKind(m.errorCode) === "RATE_LIMITED"
            ? "Reintentando…"
            : "Enviando…",
        tone: "muted",
      };
    case "SENT":
      return byTeam ? { text: "✓ Enviado", tone: "muted" } : null;
    case "DELIVERED":
      return byTeam ? { text: "✓✓ Entregado", tone: "muted" } : null;
    case "READ":
      return byTeam ? { text: "✓✓ Leído", tone: "muted" } : null;
    case "FAILED":
      return {
        text: outboundErrorText(m.errorCode) ?? "No se envió",
        tone: "error",
      };
    case "UNKNOWN":
      return {
        text: "Estado incierto: verifica antes de reenviar",
        tone: "warning",
      };
    default:
      return null;
  }
}

/**
 * Etiqueta de quien escribió una burbuja saliente: «Samanta · IA» si salió de un borrador aprobado,
 * «Tú», el nombre del responsable si fue él, o «Equipo» (OWNER y OPERATOR no pueden traducir otros ids
 * a nombres: GET /users es solo para ADMIN).
 */
export function outboundAuthorLabel(
  m: Pick<Message, "id" | "direction" | "authorUserId">,
  meId: string | null,
  assignee: Conversation["assignedUser"],
  samantaIds?: ReadonlySet<string>,
): string {
  if (messageAuthor(m, samantaIds) === "samanta") return "Samanta · IA";
  if (m.authorUserId && m.authorUserId === meId) return "Tú";
  if (assignee && m.authorUserId === assignee.id)
    return personName(assignee.firstName, assignee.lastName, "Equipo");
  return "Equipo";
}

// ---------------------------------------------------------------- lista

/** Última solicitud de cada cliente a partir de un listado ordenado por creación descendente. */
export function latestRequestByCustomer(
  requests: readonly ReservationRequest[],
): Map<string, ReservationRequest> {
  const map = new Map<string, ReservationRequest>();
  for (const r of requests) {
    const current = map.get(r.customerId);
    if (!current || r.createdAt > current.createdAt) map.set(r.customerId, r);
  }
  return map;
}

/**
 * Etiqueta de la fila (mockup): el estado de la última solicitud del cliente; si no hay solicitud,
 * "Requiere humano" cuando Samanta está en pausa y "Consulta" en otro caso.
 */
export function conversationTag(
  conversation: Pick<Conversation, "isAssistantPaused">,
  latest: ReservationRequest | null | undefined,
): { label: string; tone: Tone } {
  if (latest) {
    const view = requestStatusView(latest.status);
    return { label: view.label, tone: view.tone };
  }
  if (conversation.isAssistantPaused)
    return { label: "Requiere humano", tone: TONES.amber };
  return { label: "Consulta", tone: TONES.gray };
}

// ---------------------------------------------------------------- control de la conversación

function assigneeName(
  conversation: Pick<Conversation, "assignedUser">,
): string {
  const u = conversation.assignedUser;
  return u
    ? personName(u.firstName, u.lastName, "Otra persona")
    : "Otra persona";
}

type ControlConversation = Pick<
  Conversation,
  "isAssistantPaused" | "assignedUserId" | "assignedUser"
>;

export interface ConversationControls {
  /** Botón Pausar/Reanudar (el mockup lo oculta cuando atiende un operador). */
  pause: { visible: boolean; paused: boolean };
  /** Botón "Pasar a humano" / "Devolver a Samanta". */
  transfer: {
    visible: boolean;
    kind: "take" | "release";
    enabled: boolean;
    reason: string | null;
  };
}

/**
 * Qué controles ve el usuario. Reglas del backend: ADMIN asigna a cualquiera; OPERATOR solo toma
 * conversaciones libres o suelta las suyas (403 en otro caso); OWNER y SUPPORT no modifican nada.
 */
export function conversationControls(
  conversation: ControlConversation,
  meId: string | null,
  roles: readonly RoleCode[],
): ConversationControls {
  const mode = conversationMode(conversation);
  const isAdmin = roles.includes("ADMIN");
  const assignedToOther =
    conversation.assignedUserId !== null &&
    conversation.assignedUserId !== meId;
  const canAssign =
    can(roles, "conversation.assign") && can(roles, "conversation.pause");

  const pause = {
    visible: can(roles, "conversation.pause") && mode !== "operador",
    paused: conversation.isAssistantPaused,
  };

  if (mode === "operador") {
    const enabled = canAssign && (isAdmin || !assignedToOther);
    return {
      pause,
      transfer: {
        visible: canAssign,
        kind: "release",
        enabled,
        reason: enabled
          ? null
          : `${assigneeName(conversation)} atiende esta conversación. Solo esa persona o un administrador puede devolverla a Samanta.`,
      },
    };
  }
  const enabled = canAssign && (isAdmin || !assignedToOther);
  return {
    pause,
    transfer: {
      visible: canAssign,
      kind: "take",
      enabled,
      reason: enabled
        ? null
        : `${assigneeName(conversation)} tiene asignada esta conversación.`,
    },
  };
}

type ComposerConversation = ControlConversation &
  Pick<Conversation, "channel" | "customer">;

export type ComposerState =
  | {
      enabled: true;
      notice: string | null;
      /** Pasos que se ejecutan al enviar para que quien escribe tome el control (regla 7 del flujo). */
      plan: { pause: boolean; assign: boolean };
    }
  | { enabled: false; reason: string };

/**
 * Estado del cuadro de texto. Regla 7: quien escribe toma el control (se pausa a Samanta y la
 * conversación se le asigna). El backend no lo hace solo: el frontend lo orquesta al enviar.
 */
export function composerState(
  conversation: ComposerConversation,
  meId: string | null,
  roles: readonly RoleCode[],
  replyWindow: { open: boolean } | null,
): ComposerState {
  if (!can(roles, "conversation.send")) {
    return {
      enabled: false,
      reason: "Tu rol puede leer esta conversación, pero no responder.",
    };
  }
  if (!isSendableChannel(conversation.channel)) {
    return {
      enabled: false,
      reason: `El envío por ${channelMeta(conversation.channel).label} aún no está disponible: hoy solo WhatsApp, Messenger e Instagram tienen integración.`,
    };
  }
  // En Messenger e Instagram no hay teléfono: el backend resuelve el destinatario con el identificador del canal.
  if (conversation.channel === "WHATSAPP" && !conversation.customer.phone) {
    return {
      enabled: false,
      reason: "El cliente no tiene un teléfono de WhatsApp registrado.",
    };
  }
  const assignedToOther =
    conversation.assignedUserId !== null &&
    conversation.assignedUserId !== meId;
  if (assignedToOther && !roles.includes("ADMIN")) {
    return {
      enabled: false,
      reason: `${assigneeName(conversation)} atiende esta conversación. Solo esa persona o un administrador puede responder.`,
    };
  }
  if (replyWindow && !replyWindow.open) {
    return { enabled: false, reason: windowClosedText(conversation.channel) };
  }
  const pause = !conversation.isAssistantPaused;
  if (assignedToOther) {
    return {
      enabled: true,
      notice: `${assigneeName(conversation)} atiende esta conversación. Tu mensaje se enviará sin cambiar el responsable.`,
      plan: { pause, assign: false },
    };
  }
  const assign = conversation.assignedUserId === null;
  const notice = pause
    ? "Samanta está activa. Si escribes, queda en pausa y la conversación pasa a tu cargo."
    : assign
      ? "Samanta está en pausa. Si escribes, la conversación pasa a tu cargo."
      : null;
  return { enabled: true, notice, plan: { pause, assign } };
}

/**
 * Mensaje claro para un envío fallido, según el canal. Con la misma clave de idempotencia se puede reintentar
 * sin duplicar. Un 503 sin `code` es el canal apagado en el servidor, no una falta de conexión.
 */
export function sendErrorText(
  error: unknown,
  channel: ContactChannel = "WHATSAPP",
): string {
  if (error instanceof ApiError) {
    const text = error.messages.join(" ");
    if (isConnectionError(error)) {
      return "No se pudo confirmar el envío por un problema de conexión. Puedes reintentar: el mensaje no se duplicará.";
    }
    if (isDisabledInServer(error))
      return `El envío por ${sendChannelName(channel)} no está habilitado en el servidor.`;
    if (error.status === 409 && /ventana/i.test(text))
      return windowClosedText(channel);
    if (error.status === 409 && /Idempotency/i.test(text)) {
      return "Este envío ya se había registrado con otro texto. Vuelve a enviarlo.";
    }
    if (error.status === 400 && /destinatario/i.test(text)) {
      return channel === "FACEBOOK" || channel === "INSTAGRAM"
        ? `No se puede responder a este cliente por ${sendChannelName(channel)}: no tiene un destinatario habilitado.`
        : "El cliente no tiene un número de WhatsApp válido.";
    }
    if (error.isForbidden)
      return "Tu rol no puede enviar mensajes en esta conversación.";
    return text;
  }
  return error instanceof Error
    ? error.message
    : "No se pudo enviar el mensaje.";
}

// ---------------------------------------------------------------- panel del cliente

export interface HistoryItem {
  key: string;
  code: string;
  at: string;
  label: string;
  tone: Tone;
}

/**
 * Historial del cliente (mockup): reservas y solicitudes anteriores, sin repetir la solicitud que ya
 * se muestra arriba ni la reserva que nació de ella, y sin duplicar una solicitud aceptada con su reserva.
 */
export function buildHistory(
  requests: readonly ReservationRequest[],
  reservations: readonly Reservation[],
  currentRequestId: string | null,
  max = 6,
): HistoryItem[] {
  const fromRequests = new Set(
    reservations.map((r) => r.reservationRequestId).filter(Boolean),
  );
  const items: HistoryItem[] = [];
  for (const r of reservations) {
    if (currentRequestId && r.reservationRequestId === currentRequestId)
      continue;
    const status = RESERVATION_STATUS[r.status];
    items.push({
      key: `res-${r.id}`,
      code: r.code,
      at: r.reservationAt,
      label: status.label,
      tone: status.tone,
    });
  }
  for (const r of requests) {
    if (r.id === currentRequestId || fromRequests.has(r.id)) continue;
    const view = requestStatusView(r.status);
    items.push({
      key: `req-${r.id}`,
      code: r.code,
      at: r.reservationAt ?? r.createdAt,
      label: view.label,
      tone: view.tone,
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
}
