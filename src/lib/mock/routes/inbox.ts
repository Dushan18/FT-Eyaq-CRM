/** Rutas simuladas de la bandeja: conversaciones, mensajes (WhatsApp y Messenger) y borradores de Samanta (Parte 04). */
import type { Message, SamantaDraft, SendableChannel } from "@/lib/api/types";
import {
  IDEMPOTENCY_KEY_PATTERN,
  OUTBOUND_TEXT_MAX_BYTES,
  OUTBOUND_TEXT_MAX_LENGTH,
  RESERVED_IDEMPOTENCY_PREFIX,
  isSendableChannel,
} from "@/lib/api/types";
import {
  BodyCheck,
  CHANNELS,
  READERS,
  WRITERS,
  boolParam,
  customerMatches,
  enumParam,
  fail,
  failBare,
  hasRole,
  isEligibleAssignee,
  json,
  pageParams,
  paginate,
  readQuery,
  searchParam,
  uuidParam,
  type Ctx,
  type Route,
} from "../http";
import { normalizedPhone } from "../phone";
import {
  DRAFT_TTL_MS,
  GENERATION_WINDOW_MS,
  SAMANTA_DAILY_LIMIT,
  SAMANTA_MODEL,
  SAMANTA_PROMPT_VERSION,
  SAMANTA_TEXT_MAX_LENGTH,
  composeReply,
  knowledgeHash,
  refreshDraft,
} from "../samanta";
import {
  iso,
  lastSequence,
  uuid,
  type MockConversation,
  type MockStore,
} from "../store";
import { conversationOut, findCustomer } from "../views";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CHANNEL_NAME: Record<SendableChannel, string> = {
  WHATSAPP: "WhatsApp",
  FACEBOOK: "Messenger",
  INSTAGRAM: "Instagram",
};
const WINDOW_CLOSED: Record<SendableChannel, string> = {
  WHATSAPP: "Ventana de WhatsApp cerrada; se requiere una plantilla aprobada",
  FACEBOOK:
    "Ventana de Messenger cerrada; el cliente debe enviar un nuevo mensaje",
  INSTAGRAM:
    "Ventana de Instagram cerrada; el cliente debe enviar un nuevo mensaje",
};
const NO_RECIPIENT = "Conversación sin destinatario habilitado";
const DRAFT_CHANGED = "El borrador cambió; vuelve a revisarlo";
const DRAFT_STALE = "Borrador desactualizado o fallido; genera uno nuevo";
const DRAFT_UNAVAILABLE = "El borrador no está disponible para revisión";

function getConversation(ctx: Ctx): MockConversation {
  const conv = ctx.store.conversations.find((c) => c.id === ctx.params.id);
  if (!conv) fail(404, "Conversación no encontrada");
  return conv;
}

function touchConversation(conv: MockConversation, at: number) {
  conv.lastMessageAt = iso(at);
  conv.updatedAt = iso(at);
}

// ---------------------------------------------------------------------------- envío

/**
 * Destinatario del canal: teléfono internacional válido (WhatsApp), identidad de Messenger (PSID) o de Instagram
 * (IGSID; el mock no lo guarda: toda conversación de Instagram nace de un mensaje del cliente).
 */
function hasRecipient(store: MockStore, conv: MockConversation): boolean {
  const customer = findCustomer(store, conv.customerId);
  if (conv.channel === "WHATSAPP")
    return normalizedPhone(customer.phone, customer.phoneCountry) !== null;
  return conv.channel === "FACEBOOK"
    ? Boolean(customer.messengerPsid)
    : conv.channel === "INSTAGRAM";
}

/** Ventana de 24 h: un INBOUND de esta conversación con occurredAt en las últimas 24 h. */
function windowOpen(
  store: MockStore,
  conv: MockConversation,
  now: number,
): boolean {
  const lastInbound = store.messages
    .filter(
      (m) =>
        m.conversationId === conv.id &&
        m.direction === "INBOUND" &&
        m.occurredAt,
    )
    .reduce((max, m) => Math.max(max, Date.parse(m.occurredAt!)), 0);
  return now - lastInbound <= WINDOW_MS;
}

/** Crea el OUTBOUND TEXT en QUEUED y simula el worker: QUEUED → SENT → DELIVERED (nunca READ en Messenger; Instagram se queda en SENT). */
function enqueueOutbound(
  store: MockStore,
  conv: MockConversation,
  content: string,
  authorUserId: string,
  key: string,
  now: number,
): Message {
  const message: Message = {
    id: uuid(),
    conversationId: conv.id,
    channel: conv.channel,
    sequence: lastSequence(store, conv.id) + 1,
    externalMessageId: null,
    direction: "OUTBOUND",
    status: "QUEUED",
    type: "TEXT",
    content,
    authorUserId,
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
  store.messages.push(message);
  store.idempotency.set(`${conv.id}:${key}`, {
    messageId: message.id,
    authorUserId,
    content,
  });
  touchConversation(conv, now);
  const prefix =
    conv.channel === "FACEBOOK"
      ? "mock-mid"
      : conv.channel === "INSTAGRAM"
        ? "mock-igmid"
        : "mock-wamid";
  setTimeout(() => {
    message.status = "SENT";
    message.externalMessageId = `${prefix}-${message.id.slice(0, 8)}`;
    message.sentAt = iso(Date.now());
    message.updatedAt = message.sentAt;
  }, 1200);
  if (conv.channel !== "INSTAGRAM")
    setTimeout(() => {
      message.status = "DELIVERED";
      message.deliveredAt = iso(Date.now());
      message.updatedAt = message.deliveredAt;
    }, 2600);
  return message;
}

// ---------------------------------------------------------------------------- borradores

/** Un OPERATOR sin ADMIN no actúa sobre una conversación asignada a otra persona. */
function assertNotAssignedToOther(ctx: Ctx, conv: MockConversation) {
  const me = ctx.user!;
  if (
    !hasRole(me, ["ADMIN"]) &&
    conv.assignedUserId !== null &&
    conv.assignedUserId !== me.id
  )
    fail(403, "Conversación asignada a otro operador");
}

function getDraft(ctx: Ctx, conv: MockConversation): SamantaDraft {
  const draft = ctx.store.drafts.find(
    (d) => d.id === ctx.params.draftId && d.conversationId === conv.id,
  );
  if (!draft) fail(404, "Borrador no encontrado");
  return draft;
}

function readRevision(check: BodyCheck, body: Record<string, unknown>) {
  return check.int("revision", body.revision, 1, 2_147_483_646, {
    required: true,
  });
}

/** Comprobaciones comunes de editar, aprobar y rechazar: conversación, asignación, borrador y revisión. */
function reviewTarget(ctx: Ctx, revision: number) {
  const conv = getConversation(ctx);
  assertNotAssignedToOther(ctx, conv);
  const draft = getDraft(ctx, conv);
  if (draft.revision !== revision) fail(409, DRAFT_CHANGED);
  return { conv, draft };
}

/**
 * Más recientes primero. Con el mismo createdAt (dos borradores en el mismo milisegundo) se desempata por
 * orden de creación: el id es aleatorio y haría el orden no determinista.
 */
function conversationDrafts(store: MockStore, conversationId: string) {
  return store.drafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => draft.conversationId === conversationId)
    .sort((a, b) => b.draft.createdAt.localeCompare(a.draft.createdAt) || b.index - a.index)
    .map(({ draft }) => draft);
}

// ---------------------------------------------------------------------------- rutas

export const inboxRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/conversations",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, [
        "page",
        "limit",
        "channel",
        "customerId",
        "assignedUserId",
        "unreadOnly",
        "isAssistantPaused",
        "search",
      ]);
      const { page, limit } = pageParams(ctx, 50);
      const channel = enumParam(ctx, "channel", CHANNELS);
      const customerId = uuidParam(ctx, "customerId");
      const assigned = uuidParam(ctx, "assignedUserId");
      const unreadOnly = boolParam(ctx, "unreadOnly");
      const paused = boolParam(ctx, "isAssistantPaused");
      const search = searchParam(ctx);
      const rows = ctx.store.conversations
        .map((c) => conversationOut(ctx.store, c))
        .filter(
          (c) =>
            (!channel || c.channel === channel) &&
            (!customerId || c.customerId === customerId) &&
            (!assigned || c.assignedUserId === assigned) &&
            (!unreadOnly || c.unreadCount > 0) &&
            (paused === undefined || c.isAssistantPaused === paused) &&
            (!search || customerMatches(c.customer, search)),
        )
        .sort((a, b) => {
          if (a.lastMessageAt === b.lastMessageAt)
            return b.id.localeCompare(a.id);
          if (a.lastMessageAt === null) return 1;
          if (b.lastMessageAt === null) return -1;
          return b.lastMessageAt.localeCompare(a.lastMessageAt);
        });
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "GET",
    pattern: "/conversations/:id",
    access: READERS,
    handler: (ctx) =>
      json(200, conversationOut(ctx.store, getConversation(ctx))),
  },
  {
    method: "GET",
    pattern: "/conversations/:id/messages",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit"]);
      const { page, limit } = pageParams(ctx, 50);
      const conv = getConversation(ctx);
      const rows = ctx.store.messages
        .filter((m) => m.conversationId === conv.id)
        .sort((a, b) => b.sequence - a.sequence);
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "PATCH",
    pattern: "/conversations/:id/read",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["throughMessageId"]);
      const throughId = check.uuid(
        "throughMessageId",
        ctx.body.throughMessageId,
        { required: true },
      );
      check.done();
      const conv = getConversation(ctx);
      const through = ctx.store.messages.find(
        (m) => m.id === throughId && m.conversationId === conv.id,
      );
      if (!through) fail(404, "Mensaje no encontrado en esta conversación");
      const now = iso(Date.now());
      let updated = 0;
      for (const m of ctx.store.messages) {
        if (
          m.conversationId === conv.id &&
          m.direction === "INBOUND" &&
          m.readAt === null &&
          m.sequence <= through.sequence
        ) {
          m.readAt = now;
          updated += 1;
        }
      }
      return json(200, { updated, throughMessageId: through.id });
    },
  },
  {
    method: "PATCH",
    pattern: "/conversations/:id/assistant",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["paused"]);
      const paused = check.bool("paused", ctx.body.paused, { required: true });
      check.done();
      const conv = getConversation(ctx);
      const now = iso(Date.now());
      // Pausar deja STALE los borradores pendientes (se recalcula al leerlos). Pausar fija MANUAL y la hora
      // aunque ya estuviera en pausa por otro motivo; reanudar deja los dos en null.
      // La conversación del «Propietario» también se puede reanudar, como en bk-crm: el simulador la vuelve a
      // pausar (MANUAL) con el siguiente mensaje del propietario, y Samanta nunca le responde.
      if (paused) {
        conv.isAssistantPaused = true;
        conv.assistantPauseReason = "MANUAL";
        conv.assistantPausedAt = now;
        conv.updatedAt = now;
      } else if (conv.isAssistantPaused) {
        conv.isAssistantPaused = false;
        conv.assistantPauseReason = null;
        conv.assistantPausedAt = null;
        conv.updatedAt = now;
      }
      return json(200, conversationOut(ctx.store, conv));
    },
  },
  {
    method: "PATCH",
    pattern: "/conversations/:id/assignee",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["assignedUserId"]);
      const target =
        "assignedUserId" in ctx.body
          ? check.uuid("assignedUserId", ctx.body.assignedUserId)
          : check.uuid("assignedUserId", undefined, { required: true });
      check.done();
      const conv = getConversation(ctx);
      const me = ctx.user!;
      if (!hasRole(me, ["ADMIN"])) {
        const free = conv.assignedUserId === null;
        const mine = conv.assignedUserId === me.id;
        if (!((target === me.id || target === null) && (free || mine)))
          fail(
            403,
            "Solo puedes tomar conversaciones libres o desasignarte de las propias",
          );
      }
      if (target) {
        const u = ctx.store.users.find((x) => x.id === target);
        if (!u) fail(404, "Usuario no encontrado");
        if (!isEligibleAssignee(u)) fail(400, "Responsable no elegible");
      }
      if (conv.assignedUserId !== (target ?? null)) {
        conv.assignedUserId = target ?? null;
        conv.updatedAt = iso(Date.now());
      }
      return json(200, conversationOut(ctx.store, conv));
    },
  },
  {
    method: "POST",
    pattern: "/conversations/:id/messages",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["type", "content"]);
      if (ctx.body.type !== "TEXT") check.add("type must be equal to TEXT");
      const raw = ctx.body.content;
      if (typeof raw !== "string") {
        check.add(
          "content must be shorter than or equal to 4096 characters",
          "content must match /\\S/ regular expression",
          "content must be a string",
        );
      } else {
        // El DTO cuenta cada emoji como 1 (puntos de código); el tope real del canal usa content.length.
        if (Array.from(raw).length > 4096)
          check.add("content must be shorter than or equal to 4096 characters");
        if (!/\S/.test(raw))
          check.add("content must match /\\S/ regular expression");
      }
      check.done();
      const content = raw as string;
      const key = ctx.headers["idempotency-key"] ?? "";
      if (!IDEMPOTENCY_KEY_PATTERN.test(key))
        fail(
          400,
          "Idempotency-Key debe contener 16 a 80 caracteres alfanuméricos, guion o guion bajo",
        );
      const conv = getConversation(ctx);
      const me = ctx.user!;
      // La repetición se resuelve antes que el canal y la ventana.
      const existing = ctx.store.idempotency.get(`${conv.id}:${key}`);
      if (existing) {
        if (existing.authorUserId !== me.id || existing.content !== content)
          fail(409, "Idempotency-Key ya utilizada con otros datos");
        return json(
          202,
          ctx.store.messages.find((m) => m.id === existing.messageId),
        );
      }
      if (!isSendableChannel(conv.channel)) fail(400, NO_RECIPIENT);
      const max = OUTBOUND_TEXT_MAX_LENGTH[conv.channel];
      if (content.length > max)
        fail(
          400,
          `${CHANNEL_NAME[conv.channel]} admite hasta ${max} caracteres por respuesta`,
        );
      const maxBytes = OUTBOUND_TEXT_MAX_BYTES[conv.channel];
      if (
        maxBytes !== undefined &&
        new TextEncoder().encode(content).length > maxBytes
      )
        fail(
          400,
          `${CHANNEL_NAME[conv.channel]} admite hasta ${maxBytes} bytes por respuesta; las tildes y los emojis ocupan más de uno`,
        );
      if (!hasRecipient(ctx.store, conv)) fail(400, NO_RECIPIENT);
      const now = Date.now();
      if (!windowOpen(ctx.store, conv, now))
        fail(409, WINDOW_CLOSED[conv.channel]);
      return json(
        202,
        enqueueOutbound(ctx.store, conv, content, me.id, key, now),
      );
    },
  },

  // ------------------------------------------------------------------ borradores de Samanta
  {
    method: "POST",
    pattern: "/conversations/:id/assistant-drafts",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["sourceMessageId"]);
      const sourceMessageId = check.uuid(
        "sourceMessageId",
        ctx.body.sourceMessageId,
        { required: true },
      );
      check.done();
      const key = ctx.headers["idempotency-key"] ?? "";
      if (!IDEMPOTENCY_KEY_PATTERN.test(key))
        fail(400, "Idempotency-Key inválida (16 a 80 caracteres)");
      const conv = getConversation(ctx);
      assertNotAssignedToOther(ctx, conv);
      const me = ctx.user!;
      const now = Date.now();

      // Misma clave y mismos datos: el mismo borrador, con el estado recalculado (201, sin volver a la IA).
      const previous = ctx.store.drafts.find(
        (d) => d.conversationId === conv.id && d.idempotencyKey === key,
      );
      if (previous) {
        if (
          previous.createdById !== me.id ||
          previous.sourceMessageId !== sourceMessageId
        )
          fail(409, "Idempotency-Key utilizada con otros datos");
        refreshDraft(ctx.store, previous, now);
        return json(201, previous);
      }
      if (conv.isAssistantPaused)
        fail(409, "Samanta está pausada en esta conversación");
      if (!isSendableChannel(conv.channel)) fail(400, NO_RECIPIENT);
      const sequence = lastSequence(ctx.store, conv.id);
      const source = ctx.store.messages.find(
        (m) => m.id === sourceMessageId && m.conversationId === conv.id,
      );
      if (
        !source ||
        source.sequence !== sequence ||
        source.direction !== "INBOUND" ||
        source.type !== "TEXT" ||
        !source.content ||
        !/\S/.test(source.content) ||
        source.content.length > SAMANTA_TEXT_MAX_LENGTH
      ) {
        fail(
          409,
          "Selecciona el último mensaje entrante de texto (máximo 4096 caracteres)",
        );
      }
      const todayUtc = new Date(now).toISOString().slice(0, 10);
      if (
        ctx.store.drafts.filter((d) => d.createdAt.slice(0, 10) === todayUtc)
          .length >= SAMANTA_DAILY_LIMIT
      ) {
        failBare(429, "Límite de generación de Samanta alcanzado");
      }
      for (const d of ctx.store.drafts)
        if (d.conversationId === conv.id) refreshDraft(ctx.store, d, now);
      if (
        ctx.store.drafts.some(
          (d) => d.conversationId === conv.id && d.status === "GENERATING",
        )
      )
        fail(409, "Ya hay un borrador en generación");
      const config = ctx.store.config;
      if (!config) fail(409, "Configura el restaurante antes de usar Samanta");

      // La «IA» del simulador responde al instante: el borrador nace y queda READY en la misma petición.
      const reply = composeReply(source.content, config.businessName);
      const draft: SamantaDraft = {
        id: uuid(),
        conversationId: conv.id,
        sourceMessageId: source.id,
        baselineSequence: sequence,
        idempotencyKey: key,
        createdById: me.id,
        reviewedById: null,
        editedById: null,
        status: "READY",
        mode: "MANUAL",
        revision: 1,
        model: SAMANTA_MODEL,
        promptVersion: SAMANTA_PROMPT_VERSION,
        knowledgeHash: knowledgeHash(ctx.store),
        originalContent: reply.content,
        content: reply.content,
        intent: reply.intent,
        requiresHuman: reply.requiresHuman,
        missingFields: reply.missingFields,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        errorCode: null,
        availableAt: null,
        generationStartedAt: iso(now),
        generationExpiresAt: iso(now + GENERATION_WINDOW_MS),
        expiresAt: iso(now + DRAFT_TTL_MS),
        reviewedAt: null,
        outboundMessageId: null,
        reservationProposal: null,
        reservationRequestId: null,
        reservationOutcome: null,
        createdAt: iso(now),
        updatedAt: iso(now),
      };
      ctx.store.drafts.push(draft);
      return json(201, draft);
    },
  },
  {
    method: "GET",
    pattern: "/conversations/:id/assistant-drafts",
    access: READERS,
    handler: (ctx) => {
      const conv = getConversation(ctx);
      const now = Date.now();
      const data = conversationDrafts(ctx.store, conv.id).slice(0, 50);
      for (const d of data) refreshDraft(ctx.store, d, now);
      return json(200, { data });
    },
  },
  {
    method: "GET",
    pattern: "/conversations/:id/assistant-drafts/:draftId",
    access: READERS,
    handler: (ctx) => {
      const draft = getDraft(ctx, getConversation(ctx));
      refreshDraft(ctx.store, draft, Date.now());
      return json(200, draft);
    },
  },
  {
    method: "PATCH",
    pattern: "/conversations/:id/assistant-drafts/:draftId",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["revision", "content"]);
      const raw = ctx.body.content;
      if (typeof raw !== "string") {
        check.add(
          "content must be shorter than or equal to 4096 characters",
          "content must match /\\S/ regular expression",
          "content must be a string",
        );
      } else {
        if (Array.from(raw).length > SAMANTA_TEXT_MAX_LENGTH)
          check.add("content must be shorter than or equal to 4096 characters");
        if (!/\S/.test(raw))
          check.add("content must match /\\S/ regular expression");
      }
      const revision = readRevision(check, ctx.body);
      check.done();
      const { draft } = reviewTarget(ctx, revision!);
      const now = Date.now();
      refreshDraft(ctx.store, draft, now, { checkKnowledge: true });
      if (draft.status === "STALE" || draft.status === "FAILED")
        fail(409, DRAFT_STALE);
      if (draft.status !== "READY") fail(409, DRAFT_UNAVAILABLE);
      const content = raw as string;
      if (content.length > SAMANTA_TEXT_MAX_LENGTH)
        fail(400, "Contenido inválido");
      // Se guarda tal cual (sin recortar). intent, requiresHuman y missingFields no se recalculan.
      draft.content = content;
      draft.editedById = ctx.user!.id;
      draft.revision += 1;
      draft.updatedAt = iso(now);
      return json(200, draft);
    },
  },
  {
    method: "POST",
    pattern: "/conversations/:id/assistant-drafts/:draftId/approve",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["revision"]);
      const revision = readRevision(check, ctx.body);
      check.done();
      const { conv, draft } = reviewTarget(ctx, revision!);
      const me = ctx.user!;
      const now = Date.now();
      refreshDraft(ctx.store, draft, now, { checkKnowledge: true });
      if (draft.status === "STALE" || draft.status === "FAILED")
        fail(409, DRAFT_STALE);
      // Repetir la misma aprobación: 202 con el mismo borrador, sin duplicar el mensaje.
      if (draft.status === "APPROVED" && draft.reviewedById === me.id)
        return json(202, draft);
      if (draft.status !== "READY") fail(409, DRAFT_UNAVAILABLE);

      // Mismas comprobaciones que un envío; si fallan, el borrador sigue READY.
      const key = `${RESERVED_IDEMPOTENCY_PREFIX}${draft.id}`;
      const content = draft.content!;
      const existing = ctx.store.idempotency.get(`${conv.id}:${key}`);
      if (
        existing &&
        (existing.authorUserId !== me.id || existing.content !== content)
      )
        fail(409, "Idempotency-Key ya utilizada con otros datos");
      if (!isSendableChannel(conv.channel) || !hasRecipient(ctx.store, conv))
        fail(400, NO_RECIPIENT);
      if (!windowOpen(ctx.store, conv, now))
        fail(409, WINDOW_CLOSED[conv.channel]);
      const message = existing
        ? ctx.store.messages.find((m) => m.id === existing.messageId)!
        : enqueueOutbound(ctx.store, conv, content, me.id, key, now);

      draft.status = "APPROVED";
      draft.reviewedById = me.id;
      draft.reviewedAt = iso(now);
      draft.outboundMessageId = message.id;
      draft.updatedAt = iso(now);
      return json(202, draft);
    },
  },
  {
    method: "POST",
    pattern: "/conversations/:id/assistant-drafts/:draftId/reject",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["revision"]);
      const revision = readRevision(check, ctx.body);
      check.done();
      const { draft } = reviewTarget(ctx, revision!);
      const me = ctx.user!;
      const now = Date.now();
      // Rechazar no comprueba la información comercial.
      refreshDraft(ctx.store, draft, now);
      if (draft.status === "STALE" || draft.status === "FAILED")
        fail(409, DRAFT_STALE);
      if (draft.status === "REJECTED" && draft.reviewedById === me.id)
        return json(200, draft);
      if (draft.status !== "READY") fail(409, DRAFT_UNAVAILABLE);
      draft.status = "REJECTED";
      draft.reviewedById = me.id;
      draft.reviewedAt = iso(now);
      draft.updatedAt = iso(now);
      return json(200, draft);
    },
  },
];
