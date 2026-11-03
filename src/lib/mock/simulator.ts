/**
 * Simulador de canales (solo modo mock). Permite probar el flujo central sin Meta ni IA:
 * mensajes entrantes de clientes, lo que haría Samanta (responder y crear la solicitud) y la
 * respuesta del dueño (ACEPTAR / RECHAZAR) a una solicitud.
 *
 * Los estados que produce (WAITING_RESPONSE → ACCEPTED/REJECTED, mensajes salientes sin autor)
 * existen en el esquema de bk-crm, pero hoy el backend aún no los genera por HTTP.
 */
import { TZDate } from "@date-fns/tz";
import type { ContactChannel, Message } from "@/lib/api/types";
import { formatDayTime } from "@/lib/format/dates";
import { buildSeed } from "./seed";
import { mockStore } from "./server";
import { iso, resetStore, uuid, type MockConversation, type MockCustomer, type MockRequest, type MockReservation } from "./store";

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
    }
  | { accion: "dueno"; requestId: string; decision: "ACEPTAR" | "RECHAZAR" }
  | { accion: "reiniciar" };

export class SimulatorError extends Error {}

const SAMANTA_TEXT = {
  sent: "Listo, envié tu solicitud al restaurante. Te aviso apenas la confirme.",
  transfer: "Para grupos de más de 20 personas un asesor del restaurante prepara la propuesta. Te transfiero ahora.",
  rejected: "El restaurante no puede recibir tu reserva en ese horario. ¿Te propongo otra fecha u hora?",
} as const;

function nextSequence(conversationId: string) {
  return mockStore().messages.filter((m) => m.conversationId === conversationId).reduce((max, m) => Math.max(max, m.sequence), 0) + 1;
}

function baseMessage(conv: MockConversation, now: number): Message {
  return {
    id: uuid(),
    conversationId: conv.id,
    channel: conv.channel,
    sequence: nextSequence(conv.id),
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

/** Mensaje automático de Samanta (OUTBOUND sin autor). No escribe si la conversación está en pausa. */
function samantaSays(conv: MockConversation, text: string, now: number): Message | null {
  if (conv.isAssistantPaused) return null;
  const store = mockStore();
  const message: Message = {
    ...baseMessage(conv, now),
    direction: "OUTBOUND",
    status: "DELIVERED",
    content: text,
    sentAt: iso(now),
    deliveredAt: iso(now + 1500),
  };
  store.messages.push(message);
  conv.lastMessageAt = iso(now);
  conv.updatedAt = iso(now);
  return message;
}

function findConversation(id: string): MockConversation {
  const conv = mockStore().conversations.find((c) => c.id === id);
  if (!conv) throw new SimulatorError("Conversación no encontrada");
  return conv;
}

/** Servicios que Samanta puede ofrecer: activos, aprobados y de una categoría activa (regla 2). */
function offerableItems() {
  const store = mockStore();
  return store.items.filter(
    (i) => i.isActive && i.approvalStatus === "APPROVED" && store.categories.find((c) => c.id === i.categoryId)?.isActive,
  );
}

export function runSimulator(action: SimulatorAction) {
  const store = mockStore();
  const now = Date.now();

  if (action.accion === "reiniciar") {
    resetStore(() => buildSeed());
    return { ok: true, detalle: "Datos de ejemplo restaurados." };
  }

  if (action.accion === "entrante") {
    const text = action.texto?.trim();
    if (!text) throw new SimulatorError("texto es obligatorio");
    let conv = action.conversationId ? findConversation(action.conversationId) : undefined;
    if (!conv) {
      const channel = action.canal ?? "WHATSAPP";
      const [first, ...rest] = (action.nombre ?? "").trim().split(/\s+/).filter(Boolean);
      const customer: MockCustomer = {
        id: uuid(),
        firstName: first ?? null,
        lastName: rest.length ? rest.join(" ") : null,
        phone: `+519${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`,
        phoneCountry: null,
        email: null,
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

  if (action.accion === "samanta") {
    const conv = findConversation(action.conversationId);
    const text = action.texto?.trim();
    if (!text) throw new SimulatorError("texto es obligatorio");
    const message = samantaSays(conv, text, now);
    if (!message) throw new SimulatorError("Samanta está en pausa en esta conversación: la atiende una persona.");
    return { ok: true, conversationId: conv.id, messageId: message.id };
  }

  if (action.accion === "solicitud") {
    const conv = findConversation(action.conversationId);
    if (conv.isAssistantPaused) throw new SimulatorError("Samanta está en pausa en esta conversación: la atiende una persona.");
    const people = action.personas;
    if (!Number.isInteger(people) || people < 1) throw new SimulatorError("personas debe ser un entero mayor que 0");

    // Regla 8: grupos grandes pasan a una persona (Samanta se pausa y no crea la solicitud).
    if (people > MAX_GROUP_FOR_SAMANTA) {
      samantaSays(conv, SAMANTA_TEXT.transfer, now);
      conv.isAssistantPaused = true;
      conv.updatedAt = iso(now);
      return { ok: true, conversationId: conv.id, transferidaAHumano: true };
    }

    const at = Date.parse(action.fecha ?? "");
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(action.fecha ?? "") || Number.isNaN(at)) {
      throw new SimulatorError("fecha debe ser ISO con zona, por ejemplo 2026-10-16T20:00:00-05:00");
    }
    if (at <= now) throw new SimulatorError("La fecha de la reserva debe ser futura.");

    // Regla 2: solo servicios activos y precios registrados.
    let item = null;
    if (action.servicioId) {
      item = offerableItems().find((i) => i.id === action.servicioId) ?? null;
      if (!item) throw new SimulatorError("El servicio no existe o no está activo y aprobado: Samanta no puede ofrecerlo.");
    }

    const timeZone = store.config?.timeZone ?? "America/Lima";
    store.sequences.request += 1;
    const request: MockRequest = {
      id: uuid(),
      code: `RES-${new TZDate(now, timeZone).getFullYear()}-${String(store.sequences.request).padStart(6, "0")}`,
      customerId: conv.customerId,
      commercialItemId: item?.id ?? null,
      sourceChannel: conv.channel,
      reservationAt: iso(at),
      numberOfPeople: people,
      quotedPrice: item?.basePrice ?? null,
      currency: item?.basePrice ? (store.config?.currency ?? "PEN") : null,
      comments: action.notas?.trim() || null,
      specialRequirements: null,
      // Regla 3: al confirmar, la solicitud queda esperando al dueño (enviada a su WhatsApp personal).
      status: "WAITING_RESPONSE",
      createdAt: iso(now),
      updatedAt: iso(now),
    };
    store.requests.push(request);
    samantaSays(conv, SAMANTA_TEXT.sent, now);
    return { ok: true, requestId: request.id, code: request.code, status: request.status };
  }

  // Respuesta del dueño por WhatsApp (reglas 4 a 6).
  const req = store.requests.find((r) => r.id === action.requestId);
  if (!req) throw new SimulatorError("Solicitud no encontrada");
  if (req.status !== "SENT_TO_OWNER" && req.status !== "WAITING_RESPONSE") {
    throw new SimulatorError(`La solicitud está en ${req.status}; solo se responde una solicitud enviada al dueño.`);
  }
  if (action.decision !== "ACEPTAR" && action.decision !== "RECHAZAR") {
    throw new SimulatorError('decision debe ser "ACEPTAR" o "RECHAZAR"');
  }
  const conv = store.conversations.find((c) => c.customerId === req.customerId && c.channel === req.sourceChannel);
  req.updatedAt = iso(now);

  if (action.decision === "RECHAZAR") {
    req.status = "REJECTED";
    // Regla 6: Samanta propone otra fecha u hora.
    if (conv) samantaSays(conv, SAMANTA_TEXT.rejected, now);
    return { ok: true, requestId: req.id, status: req.status };
  }

  if (!req.reservationAt || !req.numberOfPeople) throw new SimulatorError("La solicitud no tiene fecha o personas.");
  // Regla 5: solo las aceptadas entran al calendario.
  req.status = "ACCEPTED";
  store.sequences.reservation += 1;
  const reservation: MockReservation = {
    id: uuid(),
    code: `R-${new TZDate(now, store.config?.timeZone ?? "America/Lima").getFullYear()}-${String(store.sequences.reservation).padStart(6, "0")}`,
    reservationRequestId: req.id,
    customerId: req.customerId,
    commercialItemId: req.commercialItemId,
    reservationAt: req.reservationAt,
    numberOfPeople: req.numberOfPeople,
    status: "CONFIRMED",
    notes: req.comments,
    assignedUserId: null,
    createdAt: iso(now),
    updatedAt: iso(now),
    noteHistory: [],
    rescheduleHistory: [],
  };
  store.reservations.push(reservation);
  if (conv) {
    const when = formatDayTime(req.reservationAt, store.config?.timeZone ?? "America/Lima");
    samantaSays(conv, `¡Confirmado! Te esperamos el ${when} para ${req.numberOfPeople} ${req.numberOfPeople === 1 ? "persona" : "personas"}.`, now);
  }
  return { ok: true, requestId: req.id, status: req.status, reservationId: reservation.id, reservationCode: reservation.code };
}

/** Resumen para elegir ids al probar el simulador. */
export function simulatorSnapshot() {
  const store = mockStore();
  return {
    conversaciones: store.conversations.map((c) => {
      const cu = store.customers.find((x) => x.id === c.customerId);
      return {
        id: c.id,
        canal: c.channel,
        cliente: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.phone,
        samantaEnPausa: c.isAssistantPaused,
      };
    }),
    solicitudesEsperandoAlDueno: store.requests
      .filter((r) => r.status === "SENT_TO_OWNER" || r.status === "WAITING_RESPONSE")
      .map((r) => ({ id: r.id, code: r.code, status: r.status })),
    serviciosQueSamantaPuedeOfrecer: offerableItems().map((i) => ({ id: i.id, nombre: i.nameEs ?? i.nameEn, precio: i.basePrice })),
  };
}
