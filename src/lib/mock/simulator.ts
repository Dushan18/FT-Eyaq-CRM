/**
 * Simulador de canales (solo modo mock, `POST /api/dev/simulador`). Permite probar el flujo central sin Meta
 * ni IA: mensajes entrantes de clientes, lo que haría Samanta (responder y registrar la solicitud), el envío
 * al WhatsApp del propietario (M9.1), sus respuestas (M9.2) y el aviso al cliente de la decisión (M9.3).
 * Usa la misma lógica que las rutas (./requests), así que los estados, el historial (`statusHistory`), la
 * conversación del «Propietario» y los avisos quedan como los deja bk-crm.
 *
 * Acciones (body JSON):
 * - `{ "accion": "entrante", "texto": "Hola", "canal"?: "WHATSAPP", "nombre"?: "Ana Ríos", "conversationId"?: "…" }`
 *   Mensaje de un cliente (sin conversationId crea cliente y conversación).
 * - `{ "accion": "samanta", "conversationId": "…", "texto": "…" }`
 *   Respuesta de Samanta desde un borrador MANUAL aprobado (autor: el responsable o el primer ADMIN).
 * - `{ "accion": "solicitud", "conversationId": "…", "fecha": "2026-11-20T20:00:00-05:00", "personas": 4,
 *     "servicioId"?: "…", "notas"?: "Terraza", "enviarAlDueno"?: true }`
 *   Samanta automática (autor SAMANTA_USER_ID): envía el resumen (PROPOSED), el cliente responde «Sí» y registra
 *   la solicitud READY_TO_SEND (conversationId, nota `CRM: registrada por Samanta…`, `notas` →
 *   specialRequirements) con la respuesta CREATED. Con enviarAlDueno (por defecto) la envía al propietario como
 *   el poller del backend: SENT_TO_OWNER → WAITING_RESPONSE. Más de 20 personas: pasa a una persona
 *   (pausa SAMANTA_HANDOFF) y no crea nada.
 * - `{ "accion": "enviar_dueno", "requestId": "…", "aceptado"?: true }`
 *   Envía una READY_TO_SEND al propietario (una sola vez). aceptado=false la deja en SENT_TO_OWNER (plantilla en cola).
 * - `{ "accion": "fallo_dueno", "requestId": "…", "estado"?: "FAILED" | "UNKNOWN", "errorCode"?: "WHATSAPP_SEND_REJECTED" }`
 *   La plantilla al propietario falla o queda en duda: vuelve a READY_TO_SEND y no se reenvía.
 * - `{ "accion": "dueno", "requestId": "…", "decision": "ACEPTAR" | "RECHAZAR" | "PROPONER CAMBIO", "propuesta"?: "…" }`
 *   El propietario pulsa un botón de la plantilla: ACCEPTED con reserva CONFIRMED (lógica de approve), REJECTED
 *   («Rechazada por el propietario por WhatsApp.») o MODIFICATION_REQUESTED (pausa SAMANTA_HANDOFF en la
 *   conversación del cliente). Entradas OWNER con actorId = approvalResponsibleId, aviso al cliente (o
 *   customerNoticeError) y respuesta del backend al propietario. Una solicitud ya resuelta responde ALREADY_RESOLVED.
 * - `{ "accion": "dueno_propuesta", "requestId": "…", "texto": "Mejor a las 21:30" }`
 *   Texto del propietario tras «Proponer cambio»: nota `CRM: propuesta del propietario (dd/mm hh:mm): …`.
 * - `{ "accion": "cliente_confirma", "requestId": "…" }`
 *   El cliente vuelve a responder «Sí» al resumen: Samanta repite la decisión (ALREADY_DECIDED) o que ya está
 *   registrada (ALREADY_REGISTERED). No responde si la conversación está en pausa.
 * - `{ "accion": "reiniciar" }` Restaura los datos de ejemplo.
 *
 * Simplificaciones: los mensajes salen ya enviados o entregados (sin outbox) y se suponen activos
 * OWNER_APPROVAL_ENABLED, CUSTOMER_DECISION_TEMPLATES_ENABLED y WhatsApp.
 */
import type { ContactChannel, Message, MessageErrorCode, SamantaReservationOutcome, SamantaReservationProposal } from "@/lib/api/types";
import { RESERVED_IDEMPOTENCY_PREFIX, SAMANTA_USER_ID } from "@/lib/api/types";
import { HttpError, isEligibleAssignee } from "./http";
import {
  FlowError,
  SAMANTA_REQUEST_NOTE,
  alreadyDecidedText,
  dayAndTime,
  inboundText,
  nextCode,
  ownerMessageAccepted,
  ownerMessageFailed,
  ownerProposal,
  ownerReply,
  pause,
  samantaTexts,
  sendToOwner,
  type OwnerDecision,
} from "./requests";
import { approvedDraft, autoDraft, knowledgeHash } from "./samanta";
import { buildSeed } from "./seed";
import { mockStore } from "./server";
import { iso, lastSequence, resetStore, uuid, type MockConversation, type MockCustomer, type MockRequest } from "./store";

/** Regla 8 del flujo: los grupos de más de 20 personas los atiende una persona. */
export const MAX_GROUP_FOR_SAMANTA = 20;

export type SimulatorAction =
  | { accion: "entrante"; conversationId?: string; texto: string; canal?: ContactChannel; nombre?: string }
  | { accion: "samanta"; conversationId: string; texto: string }
  | {
      accion: "solicitud";
      conversationId: string;
      /** ISO con zona, p. ej. "2026-10-16T20:00:00-05:00". */
      fecha: string;
      personas: number;
      servicioId?: string;
      notas?: string;
      /** Por defecto true: el backend la envía sola al propietario. */
      enviarAlDueno?: boolean;
    }
  | { accion: "enviar_dueno"; requestId: string; aceptado?: boolean }
  | { accion: "fallo_dueno"; requestId: string; estado?: "FAILED" | "UNKNOWN"; errorCode?: MessageErrorCode }
  | { accion: "dueno"; requestId: string; decision: OwnerDecision; propuesta?: string }
  | { accion: "dueno_propuesta"; requestId: string; texto: string }
  | { accion: "cliente_confirma"; requestId: string }
  | { accion: "reiniciar" };

export class SimulatorError extends Error {}

const TRANSFER_TEXT = "Para grupos de más de 20 personas un asesor del restaurante prepara la propuesta. Te transfiero ahora.";
const DECISIONS: readonly OwnerDecision[] = ["ACEPTAR", "RECHAZAR", "PROPONER CAMBIO"];

function baseMessage(conv: MockConversation, now: number): Message {
  return {
    id: uuid(),
    conversationId: conv.id,
    channel: conv.channel,
    sequence: lastSequence(mockStore(), conv.id) + 1,
    externalMessageId: `mock-sim-${Math.random().toString(36).slice(2, 10)}`,
    direction: "INBOUND",
    status: "PROCESSED",
    type: "TEXT",
    content: null,
    authorUserId: null,
    occurredAt: null,
    receivedAt: null,
    processedAt: null,
    sentAt: null,
    deliveredAt: null,
    providerReadAt: null,
    failedAt: null,
    readAt: null,
    errorCode: null,
    createdAt: iso(now),
    updatedAt: iso(now),
    attachments: [],
  };
}

/** Quien aprueba lo que escribe Samanta: el responsable de la conversación si es elegible; si no, el primer ADMIN activo. */
function samantaReviewer(conv: MockConversation): string {
  const store = mockStore();
  const assignee = store.users.find((u) => u.id === conv.assignedUserId);
  if (assignee && isEligibleAssignee(assignee)) return assignee.id;
  const admin = store.users.find((u) => u.isActive && u.roles.includes("ADMIN"));
  if (!admin) throw new SimulatorError("No hay un ADMIN activo que apruebe el borrador de Samanta.");
  return admin.id;
}

function outboundOf(conv: MockConversation, text: string, authorUserId: string, now: number): Message {
  const store = mockStore();
  const message: Message = {
    ...baseMessage(conv, now),
    direction: "OUTBOUND",
    status: "DELIVERED",
    content: text,
    authorUserId,
    externalMessageId: `${conv.channel === "FACEBOOK" ? "mock-mid" : conv.channel === "INSTAGRAM" ? "mock-igmid" : "mock-wamid"}-${Math.random().toString(36).slice(2, 10)}`,
    sentAt: iso(now),
    deliveredAt: iso(now + 1500),
  };
  store.messages.push(message);
  conv.lastMessageAt = iso(now);
  conv.updatedAt = iso(now);
  return message;
}

function lastInbound(conv: MockConversation): Message | undefined {
  return mockStore()
    .messages.filter((m) => m.conversationId === conv.id && m.direction === "INBOUND")
    .sort((a, b) => b.sequence - a.sequence)[0];
}

/**
 * Mensaje de Samanta desde un borrador MANUAL: un borrador APPROVED y su OUTBOUND con autor (quien lo
 * aprobó), ya entregado. No escribe si la conversación está en pausa.
 */
function samantaSays(conv: MockConversation, text: string, now: number): Message | null {
  if (conv.isAssistantPaused) return null;
  const store = mockStore();
  const reviewerId = samantaReviewer(conv);
  const source = lastInbound(conv) ?? store.messages.filter((m) => m.conversationId === conv.id).sort((a, b) => b.sequence - a.sequence)[0];
  const message = outboundOf(conv, text, reviewerId, now);
  if (source) {
    const draft = approvedDraft({
      source,
      outbound: message,
      reviewerId,
      businessName: store.config?.businessName ?? "el restaurante",
      knowledgeHash: knowledgeHash(store),
      requestedAt: now - 5_000,
      approvedAt: now,
    });
    store.drafts.push(draft);
    store.idempotency.set(`${conv.id}:${RESERVED_IDEMPOTENCY_PREFIX}${draft.id}`, { messageId: message.id, authorUserId: reviewerId, content: text });
  }
  return message;
}

/** Respuesta de Samanta automática (borrador AUTO APPROVED por SAMANTA_USER_ID, que es el autor). */
function samantaAutoSays(
  conv: MockConversation,
  text: string,
  now: number,
  extra: { outcome?: SamantaReservationOutcome; proposal?: SamantaReservationProposal; requiresHuman?: boolean } = {},
) {
  if (conv.isAssistantPaused) return null;
  const store = mockStore();
  const source = lastInbound(conv);
  const message = outboundOf(conv, text, SAMANTA_USER_ID, now);
  const draft = source
    ? autoDraft({
        source,
        outbound: message,
        knowledgeHash: knowledgeHash(store),
        reservationOutcome: extra.outcome ?? null,
        reservationProposal: extra.proposal ?? null,
        requiresHuman: extra.requiresHuman,
      })
    : null;
  if (draft) store.drafts.push(draft);
  return { message, draft };
}

function findConversation(id: string): MockConversation {
  const conv = mockStore().conversations.find((c) => c.id === id);
  if (!conv) throw new SimulatorError("Conversación no encontrada");
  return conv;
}

function findRequest(id: string): MockRequest {
  const req = mockStore().requests.find((r) => r.id === id);
  if (!req) throw new SimulatorError("Solicitud no encontrada");
  return req;
}

/** Servicios que Samanta puede ofrecer: activos, aprobados y de una categoría activa (regla 2). */
function offerableItems() {
  const store = mockStore();
  return store.items.filter(
    (i) => i.isActive && i.approvalStatus === "APPROVED" && store.categories.find((c) => c.id === i.categoryId)?.isActive,
  );
}

function localDate(at: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function noticeSummary(notice: ReturnType<typeof ownerReply>["notice"]) {
  if (!notice) return null;
  return "messageId" in notice ? { messageId: notice.messageId, canal: notice.channel, plantilla: notice.template } : { error: notice.error };
}

export function runSimulator(action: SimulatorAction) {
  try {
    return run(action);
  } catch (error) {
    // Los errores de la lógica compartida llegan como SimulatorError (400 en la ruta del simulador).
    if (error instanceof FlowError || error instanceof HttpError) throw new SimulatorError(error.message);
    throw error;
  }
}

function run(action: SimulatorAction) {
  const store = mockStore();
  const now = Date.now();

  switch (action.accion) {
    case "reiniciar":
      resetStore(() => buildSeed());
      return { ok: true, detalle: "Datos de ejemplo restaurados." };

    case "entrante": {
      const text = action.texto?.trim();
      if (!text) throw new SimulatorError("texto es obligatorio");
      let conv = action.conversationId ? findConversation(action.conversationId) : undefined;
      if (!conv) {
        const channel = action.canal ?? "WHATSAPP";
        const fullName = (action.nombre ?? "").trim().replace(/\s+/g, " ");
        const [first, ...rest] = fullName.split(" ").filter(Boolean);
        // Messenger, como el webhook de bk-crm: nombre del perfil entero en firstName, sin teléfono ni correo
        // y con identidad de Messenger (PSID), que es el destinatario de las respuestas.
        const messenger = channel === "FACEBOOK";
        const customer: MockCustomer = {
          id: uuid(),
          firstName: messenger ? fullName || null : (first ?? null),
          lastName: messenger ? null : rest.length ? rest.join(" ") : null,
          phone: messenger ? null : `+519${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`,
          phoneCountry: null,
          email: null,
          messengerPsid: messenger ? String(Math.floor(1e15 + Math.random() * 8e15)) : null,
          sourceChannel: channel,
          status: "NEW",
          firstContactAt: iso(now),
          lastContactAt: iso(now),
          notes: null,
          createdAt: iso(now),
          updatedAt: iso(now),
          interests: [],
        };
        store.customers.push(customer);
        conv = {
          id: uuid(),
          customerId: customer.id,
          channel,
          isAssistantPaused: false,
          assistantPauseReason: null,
          assistantPausedAt: null,
          assignedUserId: null,
          lastMessageAt: null,
          createdAt: iso(now),
          updatedAt: iso(now),
        };
        store.conversations.push(conv);
      }
      const message = { ...baseMessage(conv, now), content: text, occurredAt: iso(now - 1000), receivedAt: iso(now), processedAt: iso(now) };
      store.messages.push(message);
      conv.lastMessageAt = iso(now);
      conv.updatedAt = iso(now);
      const customer = store.customers.find((c) => c.id === conv.customerId);
      if (customer) customer.lastContactAt = iso(now);
      return { ok: true, conversationId: conv.id, messageId: message.id };
    }

    case "samanta": {
      const conv = findConversation(action.conversationId);
      const text = action.texto?.trim();
      if (!text) throw new SimulatorError("texto es obligatorio");
      const message = samantaSays(conv, text, now);
      if (!message) throw new SimulatorError("Samanta está en pausa en esta conversación: la atiende una persona.");
      return { ok: true, conversationId: conv.id, messageId: message.id };
    }

    case "solicitud": {
      const conv = findConversation(action.conversationId);
      if (conv.isAssistantPaused) throw new SimulatorError("Samanta está en pausa en esta conversación: la atiende una persona.");
      const people = action.personas;
      if (!Number.isInteger(people) || people < 1) throw new SimulatorError("personas debe ser un entero mayor que 0");

      // Regla 8: grupos grandes pasan a una persona (Samanta se pausa y no crea la solicitud).
      if (people > MAX_GROUP_FOR_SAMANTA) {
        samantaAutoSays(conv, TRANSFER_TEXT, now, { requiresHuman: true });
        pause(conv, "SAMANTA_HANDOFF", now);
        return { ok: true, conversationId: conv.id, transferidaAHumano: true };
      }

      const at = Date.parse(action.fecha ?? "");
      if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(action.fecha ?? "") || Number.isNaN(at)) {
        throw new SimulatorError("fecha debe ser ISO con zona, por ejemplo 2026-10-16T20:00:00-05:00");
      }
      if (at <= now) throw new SimulatorError("La fecha de la reserva debe ser futura.");

      // Regla 2: solo servicios activos y aprobados.
      let item = null;
      if (action.servicioId) {
        item = offerableItems().find((i) => i.id === action.servicioId) ?? null;
        if (!item) throw new SimulatorError("El servicio no existe o no está activo y aprobado: Samanta no puede ofrecerlo.");
      }
      const timeZone = store.config?.timeZone ?? "America/Lima";
      const special = action.notas?.trim() || null;
      const { date, time } = dayAndTime(iso(at), timeZone);

      // 1. Resumen (PROPOSED) → 2. el cliente confirma → 3. Samanta registra la solicitud (CREATED).
      const summary = samantaAutoSays(conv, samantaTexts.proposal({ date, time, people, service: item?.nameEs ?? null, specialRequirements: special }), now, {
        outcome: "PROPOSED",
        proposal: { date: localDate(at, timeZone), time, people, commercialItemId: item?.id ?? null, service: item?.nameEs ?? null, specialRequirements: special, language: "es" },
      });
      inboundText(store, conv, "Sí", now + 1);
      const request: MockRequest = {
        id: uuid(),
        code: nextCode(store, "request", now),
        externalReference: null,
        customerId: conv.customerId,
        commercialItemId: item?.id ?? null,
        conversationId: conv.id,
        sourceChannel: conv.channel,
        reservationAt: iso(at),
        numberOfPeople: people,
        quotedPrice: null,
        currency: null,
        comments: SAMANTA_REQUEST_NOTE,
        specialRequirements: special,
        status: "READY_TO_SEND",
        createdAt: iso(now),
        updatedAt: iso(now),
        statusHistory: [],
        ownerMessageId: null,
        customerNoticeMessageId: null,
        customerNoticeError: null,
      };
      store.requests.push(request);
      if (summary?.draft) summary.draft.reservationRequestId = request.id;
      samantaAutoSays(conv, samantaTexts.created(request.code, { date, time, people }), now + 2, { outcome: "CREATED" });
      const customer = store.customers.find((c) => c.id === conv.customerId);
      if (customer && ["NEW", "INTERESTED", "IN_CONVERSATION"].includes(customer.status)) {
        customer.status = "REQUESTED_RESERVATION";
        customer.updatedAt = iso(now);
      }
      // Como el poller del backend: las de Samanta se envían solas al propietario.
      if (action.enviarAlDueno ?? true) sendToOwner(store, request, now + 3);
      return { ok: true, requestId: request.id, code: request.code, status: request.status };
    }

    case "enviar_dueno": {
      const req = findRequest(action.requestId);
      sendToOwner(store, req, now, { accepted: action.aceptado ?? true });
      return { ok: true, requestId: req.id, status: req.status, ownerMessageId: req.ownerMessageId };
    }

    case "fallo_dueno": {
      const req = findRequest(action.requestId);
      const estado = action.estado ?? "FAILED";
      if (estado !== "FAILED" && estado !== "UNKNOWN") throw new SimulatorError('estado debe ser "FAILED" o "UNKNOWN"');
      ownerMessageFailed(store, req, estado, action.errorCode ?? (estado === "FAILED" ? "WHATSAPP_SEND_REJECTED" : "WHATSAPP_SEND_UNKNOWN"), now);
      return { ok: true, requestId: req.id, status: req.status };
    }

    case "dueno": {
      const req = findRequest(action.requestId);
      if (!DECISIONS.includes(action.decision)) throw new SimulatorError('decision debe ser "ACEPTAR", "RECHAZAR" o "PROPONER CAMBIO"');
      // Si la plantilla quedó en cola, la respuesta del propietario demuestra que le llegó.
      if (req.status === "SENT_TO_OWNER" && req.ownerMessageId) ownerMessageAccepted(store, req, "DELIVERED", now);
      const result = ownerReply(store, req, action.decision, now);
      const proposal = action.propuesta?.trim() ? ownerProposal(store, req, action.propuesta.trim(), now + 5) : null;
      return {
        ok: true,
        requestId: req.id,
        status: req.status,
        outcome: result.outcome,
        respuestaAlPropietario: result.reply,
        ...(result.reservation ? { reservationId: result.reservation.id, reservationCode: result.reservation.code } : {}),
        avisoAlCliente: noticeSummary(result.notice),
        ...(proposal ? { propuesta: proposal.outcome } : {}),
      };
    }

    case "dueno_propuesta": {
      const req = findRequest(action.requestId);
      const text = action.texto?.trim();
      if (!text) throw new SimulatorError("texto es obligatorio");
      const result = ownerProposal(store, req, text, now);
      return { ok: true, requestId: req.id, status: req.status, outcome: result.outcome };
    }

    case "cliente_confirma": {
      const req = findRequest(action.requestId);
      if (!req.conversationId) throw new SimulatorError("La solicitud no está vinculada a una conversación.");
      const conv = findConversation(req.conversationId);
      inboundText(store, conv, "Sí", now);
      const decided = alreadyDecidedText(store, req);
      const outcome: SamantaReservationOutcome = decided ? "ALREADY_DECIDED" : "ALREADY_REGISTERED";
      const text = decided?.text ?? `Tu solicitud ${req.code} ya está registrada y pendiente de aprobación del restaurante. Te avisaremos por aquí cuando la revisen.`;
      const said = samantaAutoSays(conv, text, now + 1, { outcome });
      if (said && decided?.handOff) pause(conv, "SAMANTA_HANDOFF", now);
      return { ok: true, requestId: req.id, respondio: said !== null, outcome: said ? outcome : null };
    }

    default:
      throw new SimulatorError(
        'accion debe ser "entrante", "samanta", "solicitud", "enviar_dueno", "fallo_dueno", "dueno", "dueno_propuesta", "cliente_confirma" o "reiniciar"',
      );
  }
}

/** Resumen para elegir ids al probar el simulador. */
export function simulatorSnapshot() {
  const store = mockStore();
  const owner = store.config?.ownerWhatsappNumber ? ownerConversationId() : null;
  return {
    conversaciones: store.conversations.map((c) => {
      const cu = store.customers.find((x) => x.id === c.customerId);
      return {
        id: c.id,
        canal: c.channel,
        cliente: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.phone,
        samantaEnPausa: c.isAssistantPaused,
        motivoPausa: c.assistantPauseReason,
      };
    }),
    conversacionDelPropietario: owner,
    solicitudesListasParaEnviar: store.requests
      .filter((r) => r.status === "READY_TO_SEND")
      .map((r) => ({ id: r.id, code: r.code, enviadaAlPropietario: r.ownerMessageId !== null })),
    solicitudesEsperandoAlDueno: store.requests
      .filter((r) => r.status === "SENT_TO_OWNER" || r.status === "WAITING_RESPONSE")
      .map((r) => ({ id: r.id, code: r.code, status: r.status })),
    serviciosQueSamantaPuedeOfrecer: offerableItems().map((i) => ({ id: i.id, nombre: i.nameEs ?? i.nameEn, precio: i.basePrice })),
  };
}

function ownerConversationId(): string | null {
  const store = mockStore();
  const number = store.config?.ownerWhatsappNumber;
  const conv = store.conversations.find((c) => {
    const cu = store.customers.find((x) => x.id === c.customerId);
    return c.channel === "WHATSAPP" && cu?.phone === number;
  });
  return conv?.id ?? null;
}
