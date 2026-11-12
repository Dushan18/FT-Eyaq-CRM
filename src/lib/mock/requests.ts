/**
 * Lógica de las solicitudes de reserva del backend simulado, compartida por las rutas, el seed y el simulador:
 * historial de estados, aprobar y rechazar (M8.3), envío al WhatsApp del propietario (M9.1), sus respuestas
 * (M9.2) y el aviso al cliente de la decisión (M9.3). Todas las funciones reciben `now` para que el seed pueda
 * reproducir escenarios en el pasado con el mismo código que usan las rutas.
 */
import { TZDate } from "@date-fns/tz";
import type {
  CommercialItem,
  ContactChannel,
  CustomerNoticeError,
  Message,
  MessageErrorCode,
  OutboundMessageStatus,
  ReservationRequestActorType,
  ReservationRequestStatus,
} from "@/lib/api/types";
import { SAMANTA_USER_ID } from "@/lib/api/types";
import { fail, HttpError } from "./http";
import { normalizedPhone } from "./phone";
import { iso, lastSequence, uuid, type MockConversation, type MockRequest, type MockReservation, type MockStore } from "./store";

const DAY_MS = 24 * 60 * 60 * 1000;

export const NO_CONFIG = "Configura el restaurante antes de crear solicitudes o reservas";
export const REQUEST_NOT_EDITABLE = "La solicitud no admite modificaciones en su estado actual";
export const ITEM_NOT_BOOKABLE = "El elemento comercial debe estar activo y aprobado";
/** Línea interna del CRM en `comments` (Samanta y el propietario no la ven). */
export const CRM_NOTE = "CRM: ";
export const SAMANTA_REQUEST_NOTE = "CRM: registrada por Samanta con la confirmación del cliente en la conversación.";

/** Plantillas aprobadas en Meta (nombres por defecto de bk-crm). */
export const OWNER_TEMPLATE = "aprobacion_reserva_propietario";
export const DECISION_TEMPLATES = {
  ACCEPTED: "reserva_aprobada",
  REJECTED: "reserva_no_aprobada",
  MODIFICATION_REQUESTED: "reserva_cambio_propuesto",
} as const;

// ---------------------------------------------------------------------------- utilidades

export class FlowError extends Error {}

export interface RequestActor {
  type: ReservationRequestActorType;
  /** null solo con SYSTEM. */
  id: string | null;
}

export const SYSTEM_ACTOR: RequestActor = { type: "SYSTEM", id: null };

/** Código RES-<año>-<secuencia> o R-<año>-<secuencia>, con el año de la zona del restaurante. */
export function nextCode(store: MockStore, kind: "request" | "reservation", now: number = Date.now()) {
  store.sequences[kind] += 1;
  const year = new TZDate(now, store.config?.timeZone ?? "America/Lima").getFullYear();
  return `${kind === "request" ? "RES" : "R"}-${year}-${String(store.sequences[kind]).padStart(6, "0")}`;
}

/** Elemento elegible para solicitudes y reservas: existe, activo y APPROVED (la categoría no cuenta). */
export function requireBookableItem(store: MockStore, id: string): CommercialItem {
  const item = store.items.find((i) => i.id === id);
  if (!item) fail(404, "Elemento comercial no encontrado");
  if (!item.isActive || item.approvalStatus !== "APPROVED") fail(400, ITEM_NOT_BOOKABLE);
  return item;
}

/** Cambia el estado y deja la entrada del historial, solo si el estado cambia de verdad. */
export function changeStatus(r: MockRequest, to: ReservationRequestStatus, actor: RequestActor, reason: string | null, now: number): boolean {
  if (r.status === to) return false;
  const previous = r.statusHistory.at(-1);
  const at = previous ? Math.max(now, Date.parse(previous.createdAt) + 1) : now;
  r.statusHistory.push({
    id: uuid(),
    previousStatus: r.status,
    newStatus: to,
    actorType: actor.type,
    actorId: actor.id,
    reason: reason === null ? null : reason.slice(0, 1000),
    // Estrictamente posterior a la anterior: dos cambios en el mismo milisegundo conservan su orden.
    createdAt: iso(at),
  });
  r.status = to;
  r.updatedAt = iso(at);
  return true;
}

export function linkedReservation(store: MockStore, r: MockRequest): MockReservation | undefined {
  return store.reservations.find((x) => x.reservationRequestId === r.id);
}

function appendComment(r: MockRequest, line: string) {
  r.comments = r.comments ? `${r.comments}\n${line}` : line;
}

// ---------------------------------------------------------------------------- aprobar y rechazar (M8.3)

const APPROVABLE: ReservationRequestStatus[] = ["READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE"];
const REJECTABLE: ReservationRequestStatus[] = ["INCOMPLETE_DATA", "READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE"];

/**
 * Aprueba como `POST /reservation-requests/:id/approve` (también la respuesta «Aceptar» del propietario):
 * ya ACCEPTED → la misma reserva sin escribir; estado (409) → fecha futura (409) → elemento (404/400) →
 * configuración (409). Crea UNA reserva CONFIRMED con notes = specialRequirements y sin responsable.
 */
export function approveRequest(store: MockStore, r: MockRequest, actor: RequestActor, now: number): { reservation: MockReservation; created: boolean } {
  const existing = linkedReservation(store, r);
  if (r.status === "ACCEPTED" && existing) return { reservation: existing, created: false };
  if (r.status === "INCOMPLETE_DATA") fail(409, "Completa la fecha y el número de personas antes de aprobar la solicitud");
  if (!APPROVABLE.includes(r.status)) fail(409, "La solicitud no se puede aprobar en su estado actual");
  if (!r.reservationAt || !r.numberOfPeople) fail(409, "Completa la fecha y el número de personas antes de aprobar la solicitud");
  if (Date.parse(r.reservationAt) <= now) fail(409, "La fecha de la solicitud ya pasó: edítala antes de aprobarla");
  if (r.commercialItemId) requireBookableItem(store, r.commercialItemId);
  if (!store.config) fail(409, NO_CONFIG);
  if (existing) fail(409, "El código o la solicitud ya están vinculados a una reserva");
  const at = iso(now);
  const reservation: MockReservation = {
    id: uuid(),
    code: nextCode(store, "reservation", now),
    reservationRequestId: r.id,
    customerId: r.customerId,
    commercialItemId: r.commercialItemId,
    reservationAt: r.reservationAt,
    numberOfPeople: r.numberOfPeople,
    status: "CONFIRMED",
    notes: r.specialRequirements,
    assignedUserId: null,
    createdAt: at,
    updatedAt: at,
    noteHistory: [],
    rescheduleHistory: [],
  };
  store.reservations.push(reservation);
  changeStatus(r, "ACCEPTED", actor, null, now);
  return { reservation, created: true };
}

/** Rechaza como `POST /reservation-requests/:id/reject`. Ya REJECTED → sin cambios ni entrada nueva. */
export function rejectRequest(store: MockStore, r: MockRequest, actor: RequestActor, reason: string | null, now: number): boolean {
  void store;
  if (r.status === "REJECTED") return false;
  if (r.status === "ACCEPTED") fail(409, "La solicitud ya fue aprobada: cancela su reserva desde el calendario");
  if (!REJECTABLE.includes(r.status)) fail(409, "La solicitud no se puede rechazar en su estado actual");
  return changeStatus(r, "REJECTED", actor, reason, now);
}

// ---------------------------------------------------------------------------- mensajes

function baseMessage(conv: MockConversation, store: MockStore, now: number): Message {
  return {
    id: uuid(),
    conversationId: conv.id,
    channel: conv.channel,
    sequence: lastSequence(store, conv.id) + 1,
    externalMessageId: null,
    direction: "OUTBOUND",
    status: "QUEUED",
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

const PREFIX: Partial<Record<ContactChannel, string>> = { WHATSAPP: "mock-wamid", FACEBOOK: "mock-mid", INSTAGRAM: "mock-igmid" };

/** Lleva un OUTBOUND al estado indicado, con sus marcas de tiempo (el worker del outbox, al instante). */
export function setOutboundStatus(message: Message, status: OutboundMessageStatus, at: number, errorCode: MessageErrorCode | null = null) {
  message.status = status;
  message.updatedAt = iso(at);
  if (status === "SENT" || status === "DELIVERED" || status === "READ") {
    message.externalMessageId ??= `${PREFIX[message.channel] ?? "mock-out"}-${message.id.slice(0, 8)}`;
    message.sentAt ??= iso(at);
  }
  if (status === "DELIVERED" || status === "READ") message.deliveredAt ??= iso(at + 2_000);
  if (status === "READ") message.providerReadAt ??= iso(at + 60_000);
  if (status === "FAILED") {
    message.failedAt = iso(at);
    message.errorCode = errorCode;
  }
  if (status === "UNKNOWN") message.errorCode = errorCode;
}

/** OUTBOUND del backend (autor SAMANTA_USER_ID): respuestas al propietario, plantillas y avisos al cliente. */
export function systemOutbound(
  store: MockStore,
  conv: MockConversation,
  content: string,
  now: number,
  opts: { status?: OutboundMessageStatus; templateName?: string } = {},
): Message {
  const message: Message = { ...baseMessage(conv, store, now), content, authorUserId: SAMANTA_USER_ID };
  store.messages.push(message);
  setOutboundStatus(message, opts.status ?? "DELIVERED", now);
  if (opts.templateName) store.templates.set(message.id, opts.templateName);
  conv.lastMessageAt = iso(now);
  conv.updatedAt = iso(now);
  return message;
}

/** INBOUND TEXT de un contacto (cliente o propietario). Actualiza lastContactAt del contacto. */
export function inboundText(store: MockStore, conv: MockConversation, content: string, now: number, opts: { read?: boolean } = {}): Message {
  const message: Message = {
    ...baseMessage(conv, store, now),
    direction: "INBOUND",
    status: "PROCESSED",
    content,
    externalMessageId: `mock-in-${uuid().slice(0, 8)}`,
    occurredAt: iso(now - 1_000),
    receivedAt: iso(now),
    processedAt: iso(now + 500),
    readAt: opts.read ? iso(now + 60_000) : null,
  };
  store.messages.push(message);
  conv.lastMessageAt = iso(now);
  conv.updatedAt = iso(now);
  const customer = store.customers.find((c) => c.id === conv.customerId);
  if (customer && Date.parse(customer.lastContactAt) < now) customer.lastContactAt = iso(now);
  return message;
}

/** Ventana de 24 h: un INBOUND de la conversación con occurredAt en las últimas 24 h. */
export function windowOpen(store: MockStore, conv: MockConversation, now: number): boolean {
  const last = store.messages
    .filter((m) => m.conversationId === conv.id && m.direction === "INBOUND" && m.occurredAt && Date.parse(m.occurredAt) <= now)
    .reduce((max, m) => Math.max(max, Date.parse(m.occurredAt!)), 0);
  return now - last <= DAY_MS;
}

/** Destinatario del canal (como `hasRecipient` de la Bandeja). */
function hasRecipient(store: MockStore, conv: MockConversation): boolean {
  const customer = store.customers.find((c) => c.id === conv.customerId);
  if (!customer) return false;
  if (conv.channel === "WHATSAPP") return normalizedPhone(customer.phone, customer.phoneCountry) !== null;
  if (conv.channel === "FACEBOOK") return Boolean(customer.messengerPsid);
  return conv.channel === "INSTAGRAM";
}

export function pause(conv: MockConversation, reason: NonNullable<MockConversation["assistantPauseReason"]>, now: number) {
  conv.isAssistantPaused = true;
  conv.assistantPauseReason = reason;
  conv.assistantPausedAt = iso(now);
  conv.updatedAt = iso(now);
}

// ---------------------------------------------------------------------------- textos

function datePartsEs(at: string, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("es-PE", {
      timeZone,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}

/** «viernes 20/11/2026» y «19:30», como los textos fijos de Samanta y la plantilla del propietario. */
export function dayAndTime(at: string, timeZone: string) {
  const p = datePartsEs(at, timeZone);
  return { date: `${p.weekday} ${p.day}/${p.month}/${p.year}`, time: `${p.hour}:${p.minute}`, short: `${p.day}/${p.month}/${p.year}` };
}

const CHANNEL_LABEL: Record<ContactChannel, string> = {
  WHATSAPP: "WhatsApp",
  FACEBOOK: "Messenger",
  INSTAGRAM: "Instagram",
  WEBSITE: "Página web",
  PHONE: "Teléfono",
  EMAIL: "Correo",
  OTHER: "Otro",
};

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Texto de la plantilla `aprobacion_reserva_propietario` tal como queda en el historial del propietario. */
export function ownerTemplateText(store: MockStore, r: MockRequest): string {
  const timeZone = store.config?.timeZone ?? "America/Lima";
  const customer = store.customers.find((c) => c.id === r.customerId);
  const item = store.items.find((i) => i.id === r.commercialItemId);
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || "Sin nombre";
  const phone = customer?.phone ?? null;
  const { date, time } = dayAndTime(r.reservationAt!, timeZone);
  const notes = [r.specialRequirements, ...(r.comments ?? "").split("\n").filter((l) => l.trim() && !l.startsWith(CRM_NOTE))]
    .filter(Boolean)
    .join(" · ");
  return [
    `Nueva solicitud de reserva ${r.code}`,
    `Cliente: ${clip(phone ? `${name} (${phone})` : name, 80)}`,
    `Fecha: ${date}`,
    `Hora: ${time}`,
    `Personas: ${r.numberOfPeople}`,
    `Servicio: ${clip(item?.nameEs ?? item?.nameEn ?? "", 60) || "-"}`,
    `Observaciones: ${clip(notes, 250) || "-"}`,
    `Origen: ${r.externalReference ? `${CHANNEL_LABEL[r.sourceChannel]} (${r.externalReference})` : CHANNEL_LABEL[r.sourceChannel]}`,
    "Elige una opción. Con «Proponer cambio», escribe luego la nueva fecha, hora o personas.",
  ].join("\n");
}

/** Textos fijos de Samanta para las solicitudes que registra (M8.2 y M9.3). */
export const samantaTexts = {
  proposal: (s: { date: string; time: string; people: number; service?: string | null; specialRequirements?: string | null }) =>
    [
      "Estos son los datos de tu solicitud de reserva:",
      `• Fecha: ${s.date}`,
      `• Hora: ${s.time}`,
      `• Personas: ${s.people}`,
      ...(s.service ? [`• Servicio: ${s.service}`] : []),
      ...(s.specialRequirements ? [`• Requerimientos: ${s.specialRequirements}`] : []),
      "¿Registro la solicitud con estos datos? Responde «sí» para confirmarlos o dime qué quieres cambiar. Después el restaurante revisará la solicitud.",
    ].join("\n"),
  created: (code: string, s: { date: string; time: string; people: number }) =>
    `Listo, registré tu solicitud de reserva ${code} para el ${s.date} a las ${s.time} (${s.people} ${s.people === 1 ? "persona" : "personas"}). Está pendiente de aprobación del restaurante: te avisaremos por aquí cuando la revisen.`,
  approved: (code: string, reservation: string) =>
    `Tu solicitud ${code} ya fue aprobada por el restaurante: tu reserva ${reservation} está confirmada. No necesitas confirmarla otra vez.`,
  notApproved: (code: string) =>
    `Tu solicitud ${code} no fue aprobada por el restaurante, así que no hay una reserva registrada con ella. Si quieres otra fecha u hora, dímela.`,
  changeProposed: (code: string) =>
    `El restaurante propuso un cambio para tu solicitud ${code}. Una persona del equipo te escribirá para coordinarlo; por ahora la reserva no está confirmada.`,
};

// ---------------------------------------------------------------------------- envío al propietario (M9.1)

/** Conversación de WhatsApp con el contacto «Propietario», con Samanta en pausa MANUAL. Se crea al primer envío. */
export function ownerConversation(store: MockStore, now: number): MockConversation {
  const number = store.config?.ownerWhatsappNumber;
  if (!number) throw new FlowError("Configura ownerWhatsappNumber en el restaurante para enviar solicitudes al propietario.");
  let contact = store.customers.find((c) => normalizedPhone(c.phone, c.phoneCountry) === number);
  if (!contact) {
    contact = {
      id: uuid(),
      firstName: "Propietario",
      lastName: null,
      phone: number,
      phoneCountry: null,
      email: null,
      sourceChannel: "WHATSAPP",
      status: "NEW",
      firstContactAt: iso(now),
      lastContactAt: iso(now),
      notes: `${CRM_NOTE}número del propietario para aprobar reservas por WhatsApp; no es un cliente.`,
      createdAt: iso(now),
      updatedAt: iso(now),
      interests: [],
      messengerPsid: null,
    };
    store.customers.push(contact);
  }
  let conv = store.conversations.find((c) => c.customerId === contact.id && c.channel === "WHATSAPP");
  if (!conv) {
    conv = {
      id: uuid(),
      customerId: contact.id,
      channel: "WHATSAPP",
      isAssistantPaused: true,
      assistantPauseReason: "MANUAL",
      assistantPausedAt: iso(now),
      assignedUserId: null,
      lastMessageAt: null,
      createdAt: iso(now),
      updatedAt: iso(now),
    };
    store.conversations.push(conv);
  }
  return conv;
}

/**
 * Lo que hace el backend cada OWNER_APPROVAL_POLL_SECONDS con una solicitud READY_TO_SEND: encola la plantilla
 * (→ SENT_TO_OWNER) y, si WhatsApp la acepta (`accepted`), → WAITING_RESPONSE. Una sola vez por solicitud.
 */
export function sendToOwner(
  store: MockStore,
  r: MockRequest,
  now: number,
  opts: { accepted?: boolean; finalStatus?: "SENT" | "DELIVERED" | "READ"; acceptedAfterMs?: number } = {},
): Message {
  if (r.status !== "READY_TO_SEND") throw new FlowError(`La solicitud está en ${r.status}; solo se envían al propietario las READY_TO_SEND.`);
  if (r.ownerMessageId) throw new FlowError("La solicitud ya se envió al propietario: no se reenvía (apruébala o recházala a mano).");
  if (!r.reservationAt || !r.numberOfPeople || Date.parse(r.reservationAt) <= now) throw new FlowError("Solo se envían solicitudes con fecha futura y personas.");
  if (!store.config?.approvalResponsibleId) throw new FlowError("Configura approvalResponsibleId (un usuario OWNER) en el restaurante.");
  const conv = ownerConversation(store, now);
  const message = systemOutbound(store, conv, ownerTemplateText(store, r), now, { status: "QUEUED", templateName: OWNER_TEMPLATE });
  r.ownerMessageId = message.id;
  changeStatus(r, "SENT_TO_OWNER", SYSTEM_ACTOR, "Enviada al WhatsApp del propietario para su aprobación.", now);
  // El simulador lo hace al instante (1 ms después, para que el historial conserve el orden); el seed, con segundos.
  if (opts.accepted ?? true) ownerMessageAccepted(store, r, opts.finalStatus ?? "SENT", now + (opts.acceptedAfterMs ?? 1));
  return message;
}

/** WhatsApp aceptó la plantilla (SENT, DELIVERED o READ): SENT_TO_OWNER → WAITING_RESPONSE. */
export function ownerMessageAccepted(store: MockStore, r: MockRequest, status: "SENT" | "DELIVERED" | "READ", now: number) {
  const message = store.messages.find((m) => m.id === r.ownerMessageId);
  if (!message) throw new FlowError("La solicitud no tiene mensaje al propietario.");
  setOutboundStatus(message, status, now);
  if (r.status === "SENT_TO_OWNER") changeStatus(r, "WAITING_RESPONSE", SYSTEM_ACTOR, `WhatsApp aceptó el mensaje al propietario (${status}).`, now);
}

/** La plantilla falló o quedó en duda: vuelve a READY_TO_SEND y no se reenvía. */
export function ownerMessageFailed(store: MockStore, r: MockRequest, status: "FAILED" | "UNKNOWN", errorCode: MessageErrorCode | null, now: number) {
  const message = store.messages.find((m) => m.id === r.ownerMessageId);
  if (!message) throw new FlowError("La solicitud no tiene mensaje al propietario.");
  if (r.status !== "SENT_TO_OWNER" && r.status !== "WAITING_RESPONSE") throw new FlowError(`La solicitud está en ${r.status}; el fallo solo cambia SENT_TO_OWNER o WAITING_RESPONSE.`);
  setOutboundStatus(message, status, now, errorCode);
  const reason =
    status === "UNKNOWN"
      ? `No se sabe si el mensaje llegó al propietario (${errorCode ?? "UNKNOWN"}). No se reenvía: apruébala o recházala a mano.`
      : `No se pudo enviar al propietario (${errorCode ?? "FAILED"}). No se reenvía: apruébala o recházala a mano.`;
  changeStatus(r, "READY_TO_SEND", SYSTEM_ACTOR, reason, now);
}

// ---------------------------------------------------------------------------- aviso al cliente (M9.3)

type Decision = "ACCEPTED" | "REJECTED" | "MODIFICATION_REQUESTED";
export type CustomerNotice = { messageId: string; channel: ContactChannel; template: boolean } | { error: CustomerNoticeError };

const NOT_NOTIFIED: Record<CustomerNoticeError, string> = {
  NO_CONSENT: "no nos escribió por WhatsApp ni dio su WhatsApp en el formulario",
  PERSON_ATTENDING: "una persona del equipo atiende su conversación",
  WINDOW_CLOSED: "pasaron más de 24 h desde su último mensaje y ese canal no admite plantillas",
  TEMPLATES_OFF: "pasaron más de 24 h desde su último mensaje y las plantillas de aviso no están activadas",
  INCOMPLETE_FOR_TEMPLATE: "faltan la fecha, la hora o las personas",
  CHANNEL_DISABLED: "el canal está desactivado en el servidor",
  NO_RECIPIENT: "el canal no acepta su contacto",
  OWNER_NUMBER: "su número es el del propietario",
};
const DECISION_LABEL: Record<Decision, string> = { ACCEPTED: "aceptada", REJECTED: "rechazada", MODIFICATION_REQUESTED: "cambio propuesto" };

function noticeText(store: MockStore, r: MockRequest, decision: Decision): { text: string; complete: boolean } {
  const timeZone = store.config?.timeZone ?? "America/Lima";
  const business = store.config?.businessName ?? "El restaurante";
  const customer = store.customers.find((c) => c.id === r.customerId);
  const name = customer?.firstName?.trim().split(/\s+/).slice(0, 4).join(" ") || "cliente";
  const reservation = linkedReservation(store, r);
  const source = decision === "ACCEPTED" && reservation ? reservation : r;
  const when = source.reservationAt ? dayAndTime(source.reservationAt, timeZone) : null;
  const at = `${when ? ` para el ${when.short}` : ""}${when ? ` a las ${when.time}` : ""}`;
  const people = source.numberOfPeople ? `${source.numberOfPeople} ${source.numberOfPeople === 1 ? "persona" : "personas"}` : null;
  const complete = Boolean(when && (decision !== "ACCEPTED" || people));
  const text =
    decision === "ACCEPTED"
      ? `Hola ${name}, ¡buenas noticias! ${business} aprobó tu solicitud ${r.code}. Tu reserva ${reservation?.code} está confirmada${at}, ${people}. ¡Te esperamos!`
      : decision === "REJECTED"
        ? `Hola ${name}, lo sentimos: ${business} no pudo aprobar tu solicitud de reserva ${r.code}${at}. No se registró ninguna reserva. Si quieres buscar otra opción, responde a este mensaje.`
        : `Hola ${name}, ${business} revisó tu solicitud de reserva ${r.code}${at} y propone un cambio. Una persona del equipo te escribirá por aquí para coordinarlo; por ahora la reserva no está confirmada.`;
  return { text, complete };
}

/**
 * Avisa al cliente de la decisión del propietario, como CustomerNoticeService de bk-crm (sin outbox: el mensaje
 * queda ya entregado). Conversación de Samanta de la solicitud o, si no hay, la de WhatsApp del cliente.
 * Supone CUSTOMER_DECISION_TEMPLATES_ENABLED=true y WhatsApp activo.
 */
export function notifyCustomer(store: MockStore, r: MockRequest, decision: Decision, now: number): CustomerNotice {
  if (r.customerNoticeMessageId) {
    const m = store.messages.find((x) => x.id === r.customerNoticeMessageId)!;
    return { messageId: m.id, channel: m.channel, template: store.templates.has(m.id) };
  }
  if (r.customerNoticeError) return { error: r.customerNoticeError };
  const result = sendNotice(store, r, decision, now);
  if ("messageId" in result) r.customerNoticeMessageId = result.messageId;
  else {
    r.customerNoticeError = result.error;
    appendComment(r, `${CRM_NOTE}no se avisó al cliente la decisión del propietario (${DECISION_LABEL[decision]}): ${NOT_NOTIFIED[result.error]}.`);
  }
  return result;
}

function sendNotice(store: MockStore, r: MockRequest, decision: Decision, now: number): CustomerNotice {
  const customer = store.customers.find((c) => c.id === r.customerId)!;
  const phone = normalizedPhone(customer.phone, customer.phoneCountry);
  const ownerNumber = store.config?.ownerWhatsappNumber ?? null;
  if (ownerNumber && phone === ownerNumber) return { error: "OWNER_NUMBER" };
  let conv = r.conversationId
    ? store.conversations.find((c) => c.id === r.conversationId)
    : store.conversations.find((c) => c.customerId === r.customerId && c.channel === "WHATSAPP");
  // Una persona atiende la conversación: pausa manual o cualquier pausa de las últimas 24 h.
  if (
    conv?.isAssistantPaused &&
    (conv.assistantPauseReason === null ||
      conv.assistantPauseReason === "MANUAL" ||
      (conv.assistantPausedAt !== null && now - Date.parse(conv.assistantPausedAt) < DAY_MS))
  )
    return { error: "PERSON_ATTENDING" };
  const { text, complete } = noticeText(store, r, decision);
  let result: CustomerNotice | null = null;
  if (conv) {
    if (!hasRecipient(store, conv)) return { error: "NO_RECIPIENT" };
    if (windowOpen(store, conv, now)) {
      const m = systemOutbound(store, conv, text, now);
      result = { messageId: m.id, channel: conv.channel, template: false };
    }
  }
  if (!result) {
    if (conv && conv.channel !== "WHATSAPP") return { error: "WINDOW_CLOSED" };
    // Plantilla: solo a un WhatsApp que el cliente nos dio (nos escribió por ahí o vino en el formulario web).
    const wrote = conv ? store.messages.some((m) => m.conversationId === conv!.id && m.direction === "INBOUND") : false;
    const formPhone = r.sourceChannel === "WEBSITE" && r.externalReference !== null;
    if (!phone || !(wrote || formPhone)) return { error: "NO_CONSENT" };
    if (!complete) return { error: "INCOMPLETE_FOR_TEMPLATE" };
    if (!conv) {
      conv = {
        id: uuid(),
        customerId: r.customerId,
        channel: "WHATSAPP",
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
    const m = systemOutbound(store, conv, text, now, { templateName: DECISION_TEMPLATES[decision] });
    result = { messageId: m.id, channel: "WHATSAPP", template: true };
  }
  // Un cambio propuesto lo coordina una persona: Samanta se aparta de la conversación.
  if (decision === "MODIFICATION_REQUESTED" && conv) pause(conv, "SAMANTA_HANDOFF", now);
  return result;
}

// ---------------------------------------------------------------------------- respuestas del propietario (M9.2)

export type OwnerDecision = "ACEPTAR" | "RECHAZAR" | "PROPONER CAMBIO";
export type OwnerReplyOutcome = "ACCEPTED" | "REJECTED" | "MODIFICATION_REQUESTED" | "DETAILS_ADDED" | "ALREADY_RESOLVED" | "NOT_APPLICABLE" | "NOT_CONFIGURED" | "NO_ACTION";

const BUTTON_LABEL: Record<OwnerDecision, string> = { ACEPTAR: "Aceptar", RECHAZAR: "Rechazar", "PROPONER CAMBIO": "Proponer cambio" };
const RESOLVED_LABEL: Partial<Record<ReservationRequestStatus, string>> = {
  ACCEPTED: "aceptada",
  REJECTED: "rechazada",
  CANCELLED: "cancelada",
  MODIFICATION_REQUESTED: "con un cambio propuesto",
  RENEGOTIATING: "en renegociación",
  INCOMPLETE_DATA: "incompleta",
};
const OPEN: ReservationRequestStatus[] = ["READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE"];

function noticeLine(notice: CustomerNotice) {
  return "messageId" in notice
    ? `Le avisamos al cliente por ${CHANNEL_LABEL[notice.channel]}.`
    : `No se pudo avisar al cliente (${NOT_NOTIFIED[notice.error]}); el equipo debe contactarlo.`;
}

/** Mensaje del propietario en su conversación. El backend la vuelve a pausar si alguien le quitó la pausa. */
function ownerSays(store: MockStore, text: string, now: number) {
  const conv = ownerConversation(store, now);
  if (!conv.isAssistantPaused) pause(conv, "MANUAL", now);
  inboundText(store, conv, text, now);
  return conv;
}

export interface OwnerReplyResult {
  outcome: OwnerReplyOutcome;
  reply: string | null;
  reservation?: MockReservation;
  notice?: CustomerNotice;
}

/**
 * El propietario pulsa un botón de la plantilla de la solicitud: se guarda su mensaje, se aplica la decisión
 * (OWNER con actorId = approvalResponsibleId), se avisa al cliente y el backend le contesta como Samanta.
 */
export function ownerReply(store: MockStore, r: MockRequest, decision: OwnerDecision, now: number): OwnerReplyResult {
  if (!r.ownerMessageId) throw new FlowError("La solicitud no se envió al propietario: envíala primero (accion «enviar_dueno»).");
  const conv = ownerSays(store, BUTTON_LABEL[decision], now);
  const result = applyOwnerDecision(store, r, decision, now + 1);
  if (result.reply) systemOutbound(store, conv, result.reply, now + 2);
  return result;
}

function applyOwnerDecision(store: MockStore, r: MockRequest, decision: OwnerDecision, now: number): OwnerReplyResult {
  const ownerId = store.config?.approvalResponsibleId ?? null;
  if (!ownerId)
    return { outcome: "NOT_CONFIGURED", reply: "No se aplicó tu respuesta porque falta configurar el responsable de aprobación en el CRM. El equipo la revisará." };
  if (!OPEN.includes(r.status))
    return { outcome: "ALREADY_RESOLVED", reply: `La solicitud ${r.code} ya está ${RESOLVED_LABEL[r.status] ?? "resuelta"}; no se cambió nada.` };
  const actor: RequestActor = { type: "OWNER", id: ownerId };
  try {
    if (decision === "ACEPTAR") {
      const { reservation } = approveRequest(store, r, actor, now);
      const notice = notifyCustomer(store, r, "ACCEPTED", now);
      return {
        outcome: "ACCEPTED",
        reservation,
        notice,
        reply: `Listo: la solicitud ${r.code} quedó ACEPTADA y la reserva ${reservation.code} ya está en el calendario. ${noticeLine(notice)}`,
      };
    }
    if (decision === "RECHAZAR") {
      rejectRequest(store, r, actor, "Rechazada por el propietario por WhatsApp.", now);
      const notice = notifyCustomer(store, r, "REJECTED", now);
      return { outcome: "REJECTED", notice, reply: `Listo: la solicitud ${r.code} quedó RECHAZADA. No se creó ninguna reserva. ${noticeLine(notice)}` };
    }
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return { outcome: "NOT_APPLICABLE", reply: `No se aplicó tu respuesta a la solicitud ${r.code}: ${error.message.replace(/[.:]+$/, "")}. El equipo la revisará en el CRM.` };
  }
  changeStatus(r, "MODIFICATION_REQUESTED", actor, "El propietario propuso un cambio por WhatsApp.", now);
  const notice = notifyCustomer(store, r, "MODIFICATION_REQUESTED", now);
  return {
    outcome: "MODIFICATION_REQUESTED",
    notice,
    reply: `Anotado: propones un cambio para la solicitud ${r.code}. Escribe en un mensaje la nueva fecha, hora o personas; el equipo lo coordinará con el cliente. ${noticeLine(notice)}`,
  };
}

/** Texto del propietario después de «Proponer cambio»: queda como nota CRM en `comments`, sin cambiar los datos. */
export function ownerProposal(store: MockStore, r: MockRequest, text: string, now: number): OwnerReplyResult {
  if (!r.ownerMessageId) throw new FlowError("La solicitud no se envió al propietario.");
  const conv = ownerSays(store, text, now);
  if (r.status !== "MODIFICATION_REQUESTED") return { outcome: "NO_ACTION", reply: null };
  const at = new Intl.DateTimeFormat("es-PE", {
    timeZone: store.config?.timeZone ?? "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
  appendComment(r, `${CRM_NOTE}propuesta del propietario (${at}): ${text.replace(/\s+/g, " ").trim().slice(0, 500)}`);
  r.updatedAt = iso(now);
  const reply = `Gracias: agregué tu propuesta a la solicitud ${r.code}. El equipo la revisará.`;
  systemOutbound(store, conv, reply, now + 1);
  return { outcome: "DETAILS_ADDED", reply };
}

/** Lo que Samanta repite si el cliente vuelve a confirmar después de la decisión (`ALREADY_DECIDED`). */
export function alreadyDecidedText(store: MockStore, r: MockRequest): { text: string; handOff: boolean } | null {
  const reservation = linkedReservation(store, r);
  if (reservation) return { text: samantaTexts.approved(r.code, reservation.code), handOff: false };
  if (r.status === "REJECTED" || r.status === "CANCELLED") return { text: samantaTexts.notApproved(r.code), handOff: false };
  if (r.status === "MODIFICATION_REQUESTED") return { text: samantaTexts.changeProposed(r.code), handOff: true };
  return null;
}
