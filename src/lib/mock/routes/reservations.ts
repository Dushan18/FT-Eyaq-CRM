/** Rutas simuladas de solicitudes de reserva y reservas (Parte 03). */
import type { CurrencyCode, ReservationStatus, RoleCode } from "@/lib/api/types";
import {
  RESERVATION_ASSIGNABLE_STATUSES,
  RESERVATION_EDITABLE_STATUSES,
  RESERVATION_REQUEST_EDITABLE_STATUSES,
  RESERVATION_REQUEST_STATUSES,
  RESERVATION_STATUS_TRANSITIONS,
  RESERVATION_STATUSES,
} from "@/lib/api/types";
import {
  ADMIN,
  BodyCheck,
  CHANNELS,
  READERS,
  WRITERS,
  boolParam,
  customerMatches,
  dateRange,
  enumParam,
  fail,
  hasRole,
  isEligibleAssignee,
  json,
  lower,
  pageParams,
  paginate,
  readQuery,
  requireSomeField,
  searchParam,
  uuidParam,
  type Ctx,
  type Route,
} from "../http";
import {
  NO_CONFIG,
  REQUEST_NOT_EDITABLE,
  approveRequest,
  changeStatus,
  nextCode,
  rejectRequest,
  requireBookableItem,
  type RequestActor,
} from "../requests";
import { iso, uuid, type MockRequest, type MockReservation, type MockStore } from "../store";
import { author, findCustomer, requestDetailOut, requestOut, reservationDetailOut, reservationOut } from "../views";

/** Aprobar y rechazar solicitudes (10/11). */
const APPROVERS: RoleCode[] = ["ADMIN", "OWNER"];
const REASON_MAX = 1000;

const MAX_PEOPLE = 2_147_483_647;
const NOT_FUTURE = "La fecha de reserva debe ser válida y futura";
const PRICE_AND_CURRENCY = "El precio y la moneda deben estar presentes juntos";

function requireConfig(store: MockStore) {
  if (!store.config) fail(409, NO_CONFIG);
  return store.config;
}

function requireCustomer(store: MockStore, id: string) {
  if (!store.customers.some((c) => c.id === id)) fail(404, "Cliente no encontrado");
}

function requireFuture(at: string) {
  if (Date.parse(at) <= Date.now()) fail(400, NOT_FUTURE);
}

/** Conversación que quedaría vinculada: existe (404) y es del cliente de la solicitud (400). */
function requireConversation(store: MockStore, conversationId: string | null | undefined, customerId: string) {
  if (!conversationId) return;
  const conv = store.conversations.find((c) => c.id === conversationId);
  if (!conv) fail(404, "Conversación no encontrada");
  if (conv.customerId !== customerId) fail(400, "La conversación pertenece a otro cliente");
}

/** `reason` opcional de cancelar y rechazar: trim, 1–1000. */
function readReason(check: BodyCheck, body: Record<string, unknown>): string | null {
  return check.text("reason", body.reason, REASON_MAX) ?? null;
}

function userActor(ctx: Ctx): RequestActor {
  return { type: "USER", id: ctx.user!.id };
}

function getRequest(ctx: Ctx): MockRequest {
  const r = ctx.store.requests.find((x) => x.id === ctx.params.id);
  if (!r) fail(404, "Solicitud de reserva no encontrada");
  return r;
}

function getReservation(ctx: Ctx): MockReservation {
  const r = ctx.store.reservations.find((x) => x.id === ctx.params.id);
  if (!r) fail(404, "Reserva no encontrada");
  return r;
}

function readRequestBody(body: Record<string, unknown>, mode: "create" | "update") {
  const check = new BodyCheck();
  check.only(body, [
    "customerId",
    "sourceChannel",
    "commercialItemId",
    "conversationId",
    "reservationAt",
    "numberOfPeople",
    "quotedPrice",
    "currency",
    "comments",
    "specialRequirements",
  ]);
  const strict = mode === "create" ? { required: true } : { nullable: false };
  const out = {
    customerId: check.uuid("customerId", body.customerId, strict),
    sourceChannel: check.enumOf("sourceChannel", body.sourceChannel, CHANNELS, strict),
    commercialItemId: check.uuid("commercialItemId", body.commercialItemId),
    conversationId: check.uuid("conversationId", body.conversationId),
    reservationAt: check.instant("reservationAt", body.reservationAt),
    numberOfPeople: check.int("numberOfPeople", body.numberOfPeople, 1, MAX_PEOPLE),
    quotedPrice: check.money("quotedPrice", body.quotedPrice),
    currency: check.enumOf("currency", body.currency, ["PEN", "USD"] as const),
    comments: check.text("comments", body.comments, 5000),
    specialRequirements: check.text("specialRequirements", body.specialRequirements, 5000),
  };
  check.done();
  return out;
}

function readReservationBody(body: Record<string, unknown>, mode: "create" | "update") {
  const check = new BodyCheck();
  check.only(body, ["customerId", "reservationAt", "numberOfPeople", "commercialItemId", "notes"]);
  const strict = mode === "create" ? { required: true } : { nullable: false };
  const out = {
    customerId: check.uuid("customerId", body.customerId, strict),
    reservationAt: check.instant("reservationAt", body.reservationAt, strict),
    numberOfPeople: check.int("numberOfPeople", body.numberOfPeople, 1, MAX_PEOPLE, strict),
    commercialItemId: check.uuid("commercialItemId", body.commercialItemId),
    notes: check.text("notes", body.notes, 5000),
  };
  check.done();
  return out;
}

/** READY_TO_SEND con fecha y personas; si falta alguno, INCOMPLETE_DATA. */
function requestStatus(r: Pick<MockRequest, "reservationAt" | "numberOfPeople">) {
  return r.reservationAt && r.numberOfPeople ? "READY_TO_SEND" : "INCOMPLETE_DATA";
}

function reschedule(r: MockReservation, to: string, reason: string | null, byUserId: string, now: string) {
  r.rescheduleHistory.push({ id: uuid(), previousReservationAt: r.reservationAt, newReservationAt: to, reason, changedByUserId: byUserId, createdAt: now });
  r.reservationAt = to;
  r.status = "RESCHEDULED";
}

export const reservationRoutes: Route[] = [
  // ------------------------------------------------------------------ solicitudes
  {
    method: "GET",
    pattern: "/reservation-requests",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "customerId", "dateFrom", "dateTo", "status", "channel", "commercialItemId", "conversationId", "search"]);
      const { page, limit } = pageParams(ctx, 20);
      const { fromMs, toMs } = dateRange(ctx);
      const customerId = uuidParam(ctx, "customerId");
      const itemId = uuidParam(ctx, "commercialItemId");
      const conversationId = uuidParam(ctx, "conversationId");
      const status = enumParam(ctx, "status", RESERVATION_REQUEST_STATUSES);
      const channel = enumParam(ctx, "channel", CHANNELS);
      const search = searchParam(ctx);
      const rows = ctx.store.requests
        .filter((r) => {
          const at = r.reservationAt ? Date.parse(r.reservationAt) : null;
          if ((fromMs !== null || toMs !== null) && at === null) return false;
          if (fromMs !== null && at! < fromMs) return false;
          if (toMs !== null && at! >= toMs) return false;
          if (customerId && r.customerId !== customerId) return false;
          if (itemId && r.commercialItemId !== itemId) return false;
          if (conversationId && r.conversationId !== conversationId) return false;
          if (status && r.status !== status) return false;
          if (channel && r.sourceChannel !== channel) return false;
          if (search && !lower(r.code).includes(lower(search)) && !customerMatches(findCustomer(ctx.store, r.customerId), search)) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .map((r) => requestOut(ctx.store, r));
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "POST",
    pattern: "/reservation-requests",
    access: WRITERS,
    handler: (ctx) => {
      const input = readRequestBody(ctx.body, "create");
      const config = requireConfig(ctx.store);
      requireCustomer(ctx.store, input.customerId!);
      if (input.commercialItemId) requireBookableItem(ctx.store, input.commercialItemId);
      requireConversation(ctx.store, input.conversationId, input.customerId!);
      if (input.reservationAt) requireFuture(input.reservationAt);
      const quotedPrice = input.quotedPrice ?? null;
      let currency: CurrencyCode | null;
      if (input.currency === undefined) currency = quotedPrice !== null ? config.currency : null;
      else currency = input.currency;
      if ((quotedPrice === null) !== (currency === null)) fail(400, PRICE_AND_CURRENCY);
      const now = iso(Date.now());
      // Las creadas a mano no se envían al propietario: solo las de Samanta y las de la web.
      const request: MockRequest = {
        id: uuid(),
        code: nextCode(ctx.store, "request"),
        externalReference: null,
        customerId: input.customerId!,
        commercialItemId: input.commercialItemId ?? null,
        conversationId: input.conversationId ?? null,
        sourceChannel: input.sourceChannel!,
        reservationAt: input.reservationAt ?? null,
        numberOfPeople: input.numberOfPeople ?? null,
        quotedPrice,
        currency,
        comments: input.comments ?? null,
        specialRequirements: input.specialRequirements ?? null,
        status: "INCOMPLETE_DATA",
        createdAt: now,
        updatedAt: now,
        // El alta no deja entrada en el historial.
        statusHistory: [],
        ownerMessageId: null,
        customerNoticeMessageId: null,
        customerNoticeError: null,
      };
      request.status = requestStatus(request);
      ctx.store.requests.push(request);
      return json(201, requestOut(ctx.store, request));
    },
  },
  {
    method: "GET",
    pattern: "/reservation-requests/:id",
    access: READERS,
    handler: (ctx) => json(200, requestDetailOut(ctx.store, getRequest(ctx))),
  },
  {
    method: "PATCH",
    pattern: "/reservation-requests/:id",
    access: WRITERS,
    handler: (ctx) => {
      const input = readRequestBody(ctx.body, "update");
      requireSomeField(ctx.body, "Proporciona al menos un campo para actualizar");
      const r = getRequest(ctx);
      if (!RESERVATION_REQUEST_EDITABLE_STATUSES.includes(r.status)) fail(409, REQUEST_NOT_EDITABLE);
      if (input.customerId) requireCustomer(ctx.store, input.customerId);
      // Reenviar el elemento actual es válido aunque ya no esté activo o aprobado.
      if (input.commercialItemId && input.commercialItemId !== r.commercialItemId) requireBookableItem(ctx.store, input.commercialItemId);
      // La conversación que quedaría vinculada (la enviada o la actual, si cambia el cliente) es de ese cliente.
      const customerId = input.customerId ?? r.customerId;
      const conversationId = input.conversationId !== undefined ? input.conversationId : r.conversationId;
      if (input.conversationId !== undefined || customerId !== r.customerId) requireConversation(ctx.store, conversationId, customerId);
      // Si llega una fecha, tiene que ser futura aunque no cambie.
      if (input.reservationAt) requireFuture(input.reservationAt);

      const quotedPrice = input.quotedPrice === undefined ? r.quotedPrice : input.quotedPrice;
      let currency = r.currency;
      if (input.currency !== undefined) currency = input.currency;
      else if (input.quotedPrice === null) currency = null;
      else if (input.quotedPrice !== undefined && currency === null) {
        if (!ctx.store.config) fail(409, NO_CONFIG);
        currency = ctx.store.config.currency;
      }
      if ((quotedPrice === null) !== (currency === null)) fail(400, PRICE_AND_CURRENCY);

      if (input.customerId) r.customerId = input.customerId;
      if (input.sourceChannel) r.sourceChannel = input.sourceChannel;
      if (input.commercialItemId !== undefined) r.commercialItemId = input.commercialItemId;
      r.conversationId = conversationId;
      if (input.reservationAt !== undefined) r.reservationAt = input.reservationAt;
      if (input.numberOfPeople !== undefined) r.numberOfPeople = input.numberOfPeople;
      if (input.comments !== undefined) r.comments = input.comments;
      if (input.specialRequirements !== undefined) r.specialRequirements = input.specialRequirements;
      r.quotedPrice = quotedPrice;
      r.currency = currency;
      const now = Date.now();
      // INCOMPLETE_DATA ⇄ READY_TO_SEND deja una entrada USER (sin motivo); si no cambia, ninguna.
      changeStatus(r, requestStatus(r), userActor(ctx), null, now);
      r.updatedAt = iso(now);
      return json(200, requestOut(ctx.store, r));
    },
  },
  {
    method: "PATCH",
    pattern: "/reservation-requests/:id/status",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["status", "reason"]);
      check.enumOf("status", ctx.body.status, ["CANCELLED"] as const, { required: true });
      const reason = readReason(check, ctx.body);
      check.done();
      const r = getRequest(ctx);
      // Idempotente: sin cambios ni entrada nueva, aunque el motivo sea otro.
      if (r.status === "CANCELLED") return json(200, requestOut(ctx.store, r));
      if (!RESERVATION_REQUEST_EDITABLE_STATUSES.includes(r.status)) fail(409, REQUEST_NOT_EDITABLE);
      changeStatus(r, "CANCELLED", userActor(ctx), reason, Date.now());
      return json(200, requestOut(ctx.store, r));
    },
  },
  {
    method: "POST",
    pattern: "/reservation-requests/:id/approve",
    access: APPROVERS,
    handler: (ctx) => {
      // Sin body: lo que llegue se ignora.
      const r = getRequest(ctx);
      const { reservation } = approveRequest(ctx.store, r, userActor(ctx), Date.now());
      // No avisa al cliente ni al dueño: lo hace una persona por la Bandeja.
      return json(200, { request: requestOut(ctx.store, r), reservation: reservationOut(ctx.store, reservation) });
    },
  },
  {
    method: "POST",
    pattern: "/reservation-requests/:id/reject",
    access: APPROVERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["reason"]);
      const reason = readReason(check, ctx.body);
      check.done();
      const r = getRequest(ctx);
      rejectRequest(ctx.store, r, userActor(ctx), reason, Date.now());
      return json(200, requestOut(ctx.store, r));
    },
  },

  // ------------------------------------------------------------------ reservas
  {
    method: "GET",
    pattern: "/reservations",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "customerId", "dateFrom", "dateTo", "commercialItemId", "assignedUserId", "search", "excludeCancelled", "status"]);
      const { page, limit } = pageParams(ctx, 20);
      const { fromMs, toMs } = dateRange(ctx);
      const customerId = uuidParam(ctx, "customerId");
      const itemId = uuidParam(ctx, "commercialItemId");
      const assigned = uuidParam(ctx, "assignedUserId");
      const search = searchParam(ctx);
      const excludeCancelled = boolParam(ctx, "excludeCancelled");
      const status = enumParam(ctx, "status", RESERVATION_STATUSES);
      if (status === "CANCELLED" && excludeCancelled) fail(400, "No combines status=CANCELLED con excludeCancelled=true");
      const rows = ctx.store.reservations
        .filter((r) => {
          const at = Date.parse(r.reservationAt);
          if (fromMs !== null && at < fromMs) return false;
          if (toMs !== null && at >= toMs) return false;
          if (customerId && r.customerId !== customerId) return false;
          if (itemId && r.commercialItemId !== itemId) return false;
          if (assigned && r.assignedUserId !== assigned) return false;
          if (status ? r.status !== status : excludeCancelled && r.status === "CANCELLED") return false;
          if (search && !lower(r.code).includes(lower(search)) && !customerMatches(findCustomer(ctx.store, r.customerId), search)) return false;
          return true;
        })
        .sort((a, b) => a.reservationAt.localeCompare(b.reservationAt) || a.id.localeCompare(b.id))
        .map((r) => reservationOut(ctx.store, r));
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "POST",
    pattern: "/reservations",
    access: ADMIN,
    handler: (ctx) => {
      const input = readReservationBody(ctx.body, "create");
      requireConfig(ctx.store);
      requireCustomer(ctx.store, input.customerId!);
      if (input.commercialItemId) requireBookableItem(ctx.store, input.commercialItemId);
      requireFuture(input.reservationAt!);
      const now = iso(Date.now());
      const reservation: MockReservation = {
        id: uuid(),
        code: nextCode(ctx.store, "reservation"),
        // Una reserva manual nunca queda vinculada a una solicitud.
        reservationRequestId: null,
        customerId: input.customerId!,
        commercialItemId: input.commercialItemId ?? null,
        reservationAt: input.reservationAt!,
        numberOfPeople: input.numberOfPeople!,
        status: "CONFIRMED",
        notes: input.notes ?? null,
        assignedUserId: null,
        createdAt: now,
        updatedAt: now,
        noteHistory: [],
        rescheduleHistory: [],
      };
      ctx.store.reservations.push(reservation);
      return json(201, reservationOut(ctx.store, reservation));
    },
  },
  {
    method: "GET",
    pattern: "/reservations/:id",
    access: READERS,
    handler: (ctx) => json(200, reservationDetailOut(ctx.store, getReservation(ctx))),
  },
  {
    method: "PATCH",
    pattern: "/reservations/:id",
    access: WRITERS,
    handler: (ctx) => {
      const input = readReservationBody(ctx.body, "update");
      requireSomeField(ctx.body, "Proporciona al menos un campo para actualizar");
      const r = getReservation(ctx);
      if (!RESERVATION_EDITABLE_STATUSES.includes(r.status)) fail(409, "La reserva no admite edición o reprogramación en su estado actual");
      if (input.customerId) requireCustomer(ctx.store, input.customerId);
      if (input.commercialItemId && input.commercialItemId !== r.commercialItemId) requireBookableItem(ctx.store, input.commercialItemId);
      if (input.reservationAt) requireFuture(input.reservationAt);
      const now = iso(Date.now());
      if (input.customerId) r.customerId = input.customerId;
      if (input.numberOfPeople) r.numberOfPeople = input.numberOfPeople;
      if (input.commercialItemId !== undefined) r.commercialItemId = input.commercialItemId;
      if (input.notes !== undefined) r.notes = input.notes;
      // Otro instante: queda RESCHEDULED con una entrada en el historial (sin motivo). El mismo instante no cambia nada.
      if (input.reservationAt && Date.parse(input.reservationAt) !== Date.parse(r.reservationAt)) reschedule(r, input.reservationAt, null, ctx.user!.id, now);
      r.updatedAt = now;
      return json(200, reservationOut(ctx.store, r));
    },
  },
  {
    method: "PATCH",
    pattern: "/reservations/:id/status",
    access: WRITERS,
    handler: (ctx) => {
      const targets = ["CONFIRMED", "UPCOMING", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
      const check = new BodyCheck();
      check.only(ctx.body, ["status"]);
      const target = check.enumOf("status", ctx.body.status, targets, { required: true }) as ReservationStatus;
      check.done();
      const r = getReservation(ctx);
      if (r.status === target) return json(200, reservationOut(ctx.store, r));
      if (!(RESERVATION_STATUS_TRANSITIONS[r.status] as readonly string[]).includes(target)) fail(409, "Transición de reserva no permitida");
      if ((target === "IN_SERVICE" || target === "NO_SHOW") && Date.parse(r.reservationAt) > Date.now()) {
        fail(409, "Todavía no ha llegado la hora de la reserva");
      }
      r.status = target;
      r.updatedAt = iso(Date.now());
      return json(200, reservationOut(ctx.store, r));
    },
  },
  {
    method: "PATCH",
    pattern: "/reservations/:id/assignee",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["assignedUserId"]);
      // La clave es obligatoria: {} responde 400; null libera.
      const target = "assignedUserId" in ctx.body ? check.uuid("assignedUserId", ctx.body.assignedUserId) : check.uuid("assignedUserId", undefined, { required: true });
      check.done();
      const r = getReservation(ctx);
      if (!RESERVATION_ASSIGNABLE_STATUSES.includes(r.status)) fail(409, "No se modifica el responsable de una reserva finalizada");
      const me = ctx.user!;
      if (!hasRole(me, ["ADMIN"])) {
        // OPERATOR: tomar una libre para sí, reenviar la propia, null en una libre o liberar la suya.
        const free = r.assignedUserId === null;
        const mine = r.assignedUserId === me.id;
        if (!((target === me.id || target === null) && (free || mine))) {
          fail(403, "Un operador solo puede tomar una reserva libre o gestionar su propia asignación");
        }
      }
      if (target) {
        const u = ctx.store.users.find((x) => x.id === target);
        if (!u) fail(404, "Responsable no encontrado");
        // La elegibilidad se comprueba antes que la igualdad.
        if (!isEligibleAssignee(u)) fail(400, "El responsable debe estar activo y tener rol OPERATOR o ADMIN");
      }
      if (r.assignedUserId !== (target ?? null)) {
        r.assignedUserId = target ?? null;
        r.updatedAt = iso(Date.now());
      }
      return json(200, reservationOut(ctx.store, r));
    },
  },
  {
    method: "POST",
    pattern: "/reservations/:id/notes",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["content"]);
      const content = check.text("content", ctx.body.content, 5000, { required: true });
      check.done();
      const r = getReservation(ctx);
      // Se admite en cualquier estado, también en los finales. No toca notes ni updatedAt de la reserva.
      const note = { id: uuid(), reservationId: r.id, authorUserId: ctx.user!.id, content: content!, createdAt: iso(Date.now()) };
      r.noteHistory.push(note);
      return json(201, { ...note, author: author(ctx.store, note.authorUserId) });
    },
  },
  {
    method: "PATCH",
    pattern: "/reservations/:id/reschedule",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["reservationAt", "reason"]);
      const at = check.instant("reservationAt", ctx.body.reservationAt, { required: true });
      const reason = check.text("reason", ctx.body.reason, 5000);
      check.done();
      const r = getReservation(ctx);
      if (!RESERVATION_EDITABLE_STATUSES.includes(r.status)) fail(409, "La reserva no admite edición o reprogramación en su estado actual");
      requireFuture(at!);
      // El mismo instante (aunque con otro offset) responde 200 sin cambios.
      if (Date.parse(at!) === Date.parse(r.reservationAt)) return json(200, reservationOut(ctx.store, r));
      const now = iso(Date.now());
      reschedule(r, at!, reason ?? null, ctx.user!.id, now);
      r.updatedAt = now;
      return json(200, reservationOut(ctx.store, r));
    },
  },
];
