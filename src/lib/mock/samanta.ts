/**
 * Samanta en el backend simulado: borradores con revisión humana, como en bk-crm (Parte 04).
 * La «IA» es instantánea y determinista: una plantilla en español a partir del último mensaje del cliente
 * y del nombre del negocio, sin datos personales. Todo mensaje de Samanta sale de un borrador APPROVED:
 * MANUAL (lo aprobó una persona, que queda como autora) o AUTO (Samanta automática; autor SAMANTA_USER_ID).
 * Las rutas solo crean borradores MANUAL; los AUTO los crean el seed y el simulador.
 */
import { createHash } from "node:crypto";
import type { Message, SamantaDraft, SamantaIntent, SamantaReservationOutcome, SamantaReservationProposal } from "@/lib/api/types";
import { SAMANTA_USER_ID } from "@/lib/api/types";
import { normalizeName } from "./http";
import { iso, lastSequence, uuid, type MockStore } from "./store";

export const SAMANTA_MODEL = "mock-samanta";
export const SAMANTA_PROMPT_VERSION = "samanta-drafts-v1";
/** expiresAt = inicio + 15 min. */
export const DRAFT_TTL_MS = 15 * 60_000;
/** generationExpiresAt = inicio + SAMANTA_TIMEOUT_MS (20 s) + 10 s. */
export const GENERATION_WINDOW_MS = 30_000;
/** SAMANTA_DAILY_LIMIT: borradores creados desde las 00:00 UTC por todos los usuarios. */
export const SAMANTA_DAILY_LIMIT = 100;
export const SAMANTA_TEXT_MAX_LENGTH = 4096;

// ---------------------------------------------------------------------------- información comercial

type KnowledgeSource = Pick<MockStore, "config" | "items" | "categories">;

/** Elementos que ve Samanta: activos, aprobados y de categorías activas (hasta 30). */
function samantaCatalog(store: KnowledgeSource) {
  const categories = new Map(store.categories.map((c) => [c.id, c]));
  return store.items
    .filter((i) => i.isActive && i.approvalStatus === "APPROVED" && categories.get(i.categoryId)?.isActive)
    .sort((a, b) => {
      const ca = categories.get(a.categoryId)!;
      const cb = categories.get(b.categoryId)!;
      return ca.displayOrder - cb.displayOrder || a.displayOrder - b.displayOrder || (a.nameEs ?? "").localeCompare(b.nameEs ?? "") || a.id.localeCompare(b.id);
    })
    .slice(0, 30)
    .map((i) => {
      const cat = categories.get(i.categoryId)!;
      return {
        type: i.type,
        nameEs: i.nameEs,
        nameEn: i.nameEn,
        descriptionEs: i.descriptionEs,
        descriptionEn: i.descriptionEn,
        basePrice: i.basePrice,
        conditions: i.conditions,
        availabilityNote: i.availabilityNote,
        category: [cat.nameEs, cat.nameEn],
        variants: i.variants.filter((v) => v.isActive).slice(0, 10).map((v) => [v.nameEs, v.nameEn, v.descriptionEs, v.descriptionEn, v.price]),
        faqs: i.faqs.slice(0, 10).map((f) => [f.questionEs, f.questionEn, f.answerEs, f.answerEn]),
        schedules: i.schedules.map((s) => [s.dayOfWeek, s.isAvailable, s.startTime, s.endTime]),
        promotion: i.promotionDetail ? [i.promotionDetail.validFrom, i.promotionDetail.validUntil, i.promotionDetail.promotionalPrice] : null,
        event: i.eventDetail ? [i.eventDetail.startAt, i.eventDetail.endAt] : null,
      };
    });
}

/** SHA-256 (hex) de la configuración y el catálogo que recibe Samanta. Si cambia, los borradores quedan STALE. */
export function knowledgeHash(store: KnowledgeSource): string {
  const c = store.config;
  const config = c
    ? [c.businessName, c.description, c.address, c.whatsappNumber, c.email, c.website, c.currency, c.timeZone, c.reservationPolicy, c.cancellationPolicy, c.languages, c.schedules]
    : null;
  return createHash("sha256").update(JSON.stringify({ config, catalog: samantaCatalog(store) })).digest("hex");
}

// ---------------------------------------------------------------------------- generación simulada

export interface ComposedReply {
  content: string;
  intent: SamantaIntent;
  requiresHuman: boolean;
  missingFields: string[];
  inputTokens: number;
  outputTokens: number;
}

const DAY_WORDS = ["hoy", "manana", "pasado", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo", "feriado", "fin de semana"];

function joinEs(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** Respuesta «de la IA» para el último mensaje del cliente. No usa nombres ni datos de contacto. */
export function composeReply(sourceText: string, businessName: string): ComposedReply {
  const t = normalizeName(sourceText);
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  const hasDate = has(...DAY_WORDS) || /\b\d{1,2}\s*(?:\/|-|de)\s*(?:\d{1,2}|ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)/.test(t);
  const hasTime = /\b(?:a las?|tipo|desde las?)\s*\d{1,2}\b/.test(t) || /\b\d{1,2}(?::\d{2})?\s*(?:h|hrs|am|pm|p\.\s?m\.?|a\.\s?m\.?)(?=\s|$|[.,!?])/.test(t) || /\b\d{1,2}:\d{2}\b/.test(t);
  const hasPeople = /\b(?:somos|seremos|para|de)\s+\d{1,3}\b/.test(t) || /\b\d{1,3}\s*(?:personas|pax|adultos|comensales|invitados)\b/.test(t) || has("pareja");

  let intent: SamantaIntent;
  if (has("humano", "persona real", "asesor", "operador", "hablar con", "queja", "reclamo", "gerente", "encargado")) intent = "HUMAN";
  else if (has("cancel", "anular", "no podre asistir", "ya no podre")) intent = "CANCELLATION";
  else if (has("reserv", "mesa", "cupo", "disponibilidad", "separar")) intent = "RESERVATION";
  else if (
    has("horario", "atienden", "abren", "cierran", "menu", "carta", "precio", "cuesta", "costo", "direccion", "ubica", "donde", "estacionamiento", "feriado", "delivery", "vegetarian", "torta", "pago", "tarjeta", "hola", "buenas", "gracias", "info", "cotiza")
  )
    intent = "GENERAL";
  else intent = "OTHER";

  const greeting = `¡Hola! Gracias por escribir a ${businessName}.`;
  let content: string;
  let missingFields: string[] = [];
  let requiresHuman = true;
  switch (intent) {
    case "RESERVATION": {
      if (!hasDate) missingFields.push("fecha");
      if (!hasTime) missingFields.push("hora");
      if (!hasPeople) missingFields.push("personas");
      const asks = missingFields.map((f) => (f === "fecha" ? "la fecha" : f === "hora" ? "la hora" : "para cuántas personas sería"));
      content = asks.length
        ? `${greeting} Con gusto te ayudamos con tu reserva. ¿Nos indicas ${joinEs(asks)}? Un miembro del equipo confirmará la disponibilidad.`
        : `${greeting} Con gusto registramos tu pedido de reserva con los datos que nos diste. Un miembro del equipo confirmará la disponibilidad en breve.`;
      break;
    }
    case "CANCELLATION":
      missingFields = [...(hasDate ? [] : ["fecha"]), ...(hasTime ? [] : ["hora"])];
      content = `Hola, gracias por avisarnos. Para gestionar la cancelación, ¿nos confirmas la fecha y la hora de tu reserva? Un miembro del equipo de ${businessName} la revisará en breve.`;
      break;
    case "HUMAN":
      content = `Hola, gracias por escribir a ${businessName}. Te comunico con una persona del equipo, que te responderá en breve.`;
      break;
    case "GENERAL":
      requiresHuman = false;
      content = `${greeting} Con gusto te ayudamos con tu consulta; un miembro del equipo te confirmará los detalles en breve. ¿Hay algo más en lo que podamos ayudarte?`;
      break;
    default:
      content = `${greeting} ¿Nos cuentas un poco más sobre lo que necesitas para ayudarte mejor?`;
  }
  return {
    content,
    intent,
    requiresHuman,
    missingFields,
    inputTokens: 1800 + Math.ceil(sourceText.length / 3),
    outputTokens: Math.ceil(content.length / 4),
  };
}

// ---------------------------------------------------------------------------- estados

/**
 * Recalcula el estado de un borrador al leerlo o actuar sobre él (bk-crm no lo hace en segundo plano):
 * GENERATING vencido → FAILED; READY o GENERATING → STALE si llegó otro mensaje, Samanta está en pausa,
 * venció expiresAt o (al editar y aprobar) cambió la información comercial.
 */
export function refreshDraft(store: MockStore, draft: SamantaDraft, now: number, opts: { checkKnowledge?: boolean } = {}) {
  if (draft.status === "GENERATING" && draft.generationExpiresAt !== null && now > Date.parse(draft.generationExpiresAt)) {
    draft.status = "FAILED";
    draft.errorCode = "AI_GENERATION_EXPIRED";
    draft.updatedAt = iso(now);
    return;
  }
  if (draft.status !== "READY" && draft.status !== "GENERATING") return;
  const conv = store.conversations.find((c) => c.id === draft.conversationId);
  const stale =
    lastSequence(store, draft.conversationId) > draft.baselineSequence ||
    Boolean(conv?.isAssistantPaused) ||
    now > Date.parse(draft.expiresAt) ||
    (opts.checkKnowledge === true && draft.knowledgeHash !== knowledgeHash(store));
  if (stale) {
    draft.status = "STALE";
    draft.updatedAt = iso(now);
  }
}

/**
 * Borrador ya aprobado para un mensaje de Samanta del seed o del simulador: la «IA» propuso su texto,
 * una persona lo ajustó (si difiere) y lo aprobó, y el saliente quedó con esa persona como autora.
 */
export function approvedDraft(input: {
  source: Message;
  outbound: Message;
  reviewerId: string;
  businessName: string;
  knowledgeHash: string;
  requestedAt: number;
  approvedAt: number;
}): SamantaDraft {
  const { source, outbound, reviewerId } = input;
  const composed = composeReply(source.content ?? "", input.businessName);
  const edited = outbound.content !== composed.content;
  return {
    id: uuid(),
    conversationId: outbound.conversationId,
    sourceMessageId: source.id,
    baselineSequence: outbound.sequence - 1,
    idempotencyKey: uuid(),
    createdById: reviewerId,
    reviewedById: reviewerId,
    editedById: edited ? reviewerId : null,
    status: "APPROVED",
    revision: edited ? 2 : 1,
    model: SAMANTA_MODEL,
    promptVersion: SAMANTA_PROMPT_VERSION,
    knowledgeHash: input.knowledgeHash,
    originalContent: composed.content,
    content: outbound.content,
    intent: composed.intent,
    requiresHuman: composed.requiresHuman,
    missingFields: composed.missingFields,
    inputTokens: composed.inputTokens,
    outputTokens: composed.outputTokens,
    errorCode: null,
    mode: "MANUAL",
    availableAt: null,
    generationStartedAt: iso(input.requestedAt),
    generationExpiresAt: iso(input.requestedAt + GENERATION_WINDOW_MS),
    expiresAt: iso(input.requestedAt + DRAFT_TTL_MS),
    reviewedAt: iso(input.approvedAt),
    outboundMessageId: outbound.id,
    reservationProposal: null,
    reservationRequestId: null,
    reservationOutcome: null,
    createdAt: iso(input.requestedAt),
    updatedAt: iso(input.approvedAt),
  };
}

/** SAMANTA_AUTO_DELAY_MS: la respuesta automática espera 8 s por si el cliente sigue escribiendo. */
export const SAMANTA_AUTO_DELAY_MS = 8_000;
export const SAMANTA_AUTO_PROMPT_VERSION = "samanta-v4";

/**
 * Borrador AUTO ya enviado (Samanta automática con envío activo): lo crea y lo aprueba SAMANTA_USER_ID, y su
 * OUTBOUND tiene a SAMANTA_USER_ID como autor. Con `reservationOutcome`, `content` es el texto fijo del backend.
 */
export function autoDraft(input: {
  source: Message;
  outbound: Message;
  knowledgeHash: string;
  reservationOutcome?: SamantaReservationOutcome | null;
  reservationProposal?: SamantaReservationProposal | null;
  reservationRequestId?: string | null;
  requiresHuman?: boolean;
}): SamantaDraft {
  const { source, outbound } = input;
  const arrived = Date.parse(source.receivedAt ?? source.createdAt);
  const sentAt = Date.parse(outbound.createdAt);
  // El simulador responde al instante: nunca después del envío.
  const availableAt = Math.min(arrived + SAMANTA_AUTO_DELAY_MS, sentAt);
  const composed = composeReply(source.content ?? "", "");
  return {
    id: uuid(),
    conversationId: outbound.conversationId,
    sourceMessageId: source.id,
    baselineSequence: source.sequence,
    idempotencyKey: `auto-${source.id}`,
    createdById: SAMANTA_USER_ID,
    reviewedById: SAMANTA_USER_ID,
    editedById: null,
    status: "APPROVED",
    mode: "AUTO",
    revision: 1,
    model: SAMANTA_MODEL,
    promptVersion: SAMANTA_AUTO_PROMPT_VERSION,
    knowledgeHash: input.knowledgeHash,
    // Con una acción de reserva la IA puede no escribir texto: el backend pone el texto fijo.
    originalContent: input.reservationOutcome ? "" : outbound.content,
    content: outbound.content,
    intent: input.reservationOutcome ? "RESERVATION" : composed.intent,
    requiresHuman: input.requiresHuman ?? false,
    missingFields: [],
    inputTokens: composed.inputTokens,
    outputTokens: Math.ceil((outbound.content ?? "").length / 4),
    errorCode: null,
    availableAt: iso(availableAt),
    generationStartedAt: iso(availableAt),
    generationExpiresAt: iso(availableAt + GENERATION_WINDOW_MS),
    expiresAt: iso(arrived + DRAFT_TTL_MS),
    reviewedAt: iso(sentAt),
    outboundMessageId: outbound.id,
    reservationProposal: input.reservationProposal ?? null,
    reservationRequestId: input.reservationRequestId ?? null,
    reservationOutcome: input.reservationOutcome ?? null,
    createdAt: iso(arrived),
    updatedAt: iso(sentAt),
  };
}
