// @vitest-environment node
/**
 * Flujo central de solicitudes (reglas 1 a 8) contra el backend simulado, a través del mismo contrato
 * HTTP que usa el frontend. El simulador hace de Samanta y del dueño; el resto son llamadas reales.
 */
import { TZDate } from "@date-fns/tz";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  Conversation,
  Message,
  Paginated,
  Reservation,
  ReservationRequest,
  ReservationRequestDetail,
  SamantaDraftListResponse,
} from "@/lib/api/types";
import { SAMANTA_USER_ID } from "@/lib/api/types";
import { buildSeed } from "./seed";
import { handleMockRequest, mockStore } from "./server";
import { runSimulator, SimulatorError, simulatorSnapshot } from "./simulator";
import { resetStore } from "./store";

const TZ = "America/Lima";

interface Call {
  token?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

async function api<T = unknown>(
  method: string,
  path: string,
  call: Call = {},
): Promise<{ status: number; body: T }> {
  const res = await handleMockRequest({
    method,
    path,
    search: call.query ? `?${new URLSearchParams(call.query).toString()}` : "",
    headers: {
      ...(call.token ? { authorization: `Bearer ${call.token}` } : {}),
      ...(call.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...call.headers,
    },
    body: call.body !== undefined ? JSON.stringify(call.body) : null,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function login(email: string): Promise<string> {
  const res = await api<{ accessToken: string }>("POST", "/auth/login", {
    body: { email, password: "demo1234" },
  });
  expect(res.status).toBe(201);
  return res.body.accessToken;
}

/** Fecha futura en la zona del restaurante, en el formato que envía el frontend. */
function futureAt(daysAhead: number, hour: number): string {
  const today = new TZDate(Date.now(), TZ);
  return new TZDate(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + daysAhead,
    hour,
    0,
    0,
    0,
    TZ,
  ).toISOString();
}

function newConversation(nombre: string): string {
  const result = runSimulator({
    accion: "entrante",
    texto: "Hola, quiero reservar",
    canal: "WHATSAPP",
    nombre,
  });
  return (result as { conversationId: string }).conversationId;
}

async function messages(
  token: string,
  conversationId: string,
): Promise<Message[]> {
  const res = await api<Paginated<Message>>(
    "GET",
    `/conversations/${conversationId}/messages`,
    { token },
  );
  return res.body.data;
}

async function customerOf(
  token: string,
  conversationId: string,
): Promise<string> {
  return (
    await api<Conversation>("GET", `/conversations/${conversationId}`, {
      token,
    })
  ).body.customerId;
}

let admin: string;

beforeEach(async () => {
  resetStore(() => buildSeed());
  admin = await login("frank@eyaqsystems.com");
});

describe("flujo central de solicitudes", () => {
  it("1–3: el mensaje llega a la Bandeja y Samanta crea la solicitud esperando al dueño", async () => {
    const conversationId = newConversation("Lucía Prueba");
    const inbox = await api<Paginated<Conversation>>("GET", "/conversations", {
      token: admin,
      query: { limit: "1" },
    });
    expect(inbox.body.data[0]?.id).toBe(conversationId);
    expect(inbox.body.data[0]?.unreadCount).toBe(1);

    const service = simulatorSnapshot().serviciosQueSamantaPuedeOfrecer.find(
      (s) => s.precio !== null,
    )!;
    const created = runSimulator({
      accion: "solicitud",
      conversationId,
      fecha: futureAt(3, 20),
      personas: 4,
      servicioId: service.id,
      notas: "Terraza",
    }) as { requestId: string; code: string; status: string };
    expect(created.status).toBe("WAITING_RESPONSE");
    expect(created.code).toMatch(/^RES-\d{4}-\d{6}$/);

    const customerId = await customerOf(admin, conversationId);
    const requests = await api<Paginated<ReservationRequest>>(
      "GET",
      "/reservation-requests",
      { token: admin, query: { customerId } },
    );
    expect(requests.body.data).toHaveLength(1);
    // Samanta la registra READY_TO_SEND, vinculada a la conversación, y el backend la envía al propietario.
    expect(requests.body.data[0]).toMatchObject({
      status: "WAITING_RESPONSE",
      numberOfPeople: 4,
      commercialItemId: service.id,
      conversationId,
      externalReference: null,
      specialRequirements: "Terraza",
      comments:
        "CRM: registrada por Samanta con la confirmación del cliente en la conversación.",
      sourceChannel: "WHATSAPP",
    });
    // El cliente pasa a REQUESTED_RESERVATION.
    const customer = await api<{ status: string }>(
      "GET",
      `/customers/${customerId}`,
      { token: admin },
    );
    expect(customer.body.status).toBe("REQUESTED_RESERVATION");

    // Solo las aceptadas entran al calendario: todavía no hay reserva.
    const reservations = await api<Paginated<Reservation>>(
      "GET",
      "/reservations",
      { token: admin, query: { customerId } },
    );
    expect(reservations.body.pagination.total).toBe(0);

    // Samanta automática: el mensaje lo firma SAMANTA_USER_ID y sale de un borrador AUTO APPROVED (CREATED).
    // El resumen anterior (PROPOSED) queda con la solicitud creada.
    const last = (await messages(admin, conversationId))[0]!;
    expect(last).toMatchObject({
      direction: "OUTBOUND",
      authorUserId: SAMANTA_USER_ID,
    });
    expect(last.content).toContain(`registré tu solicitud de reserva ${created.code}`);
    expect(last.content).toContain("pendiente de aprobación");
    const drafts = await api<SamantaDraftListResponse>(
      "GET",
      `/conversations/${conversationId}/assistant-drafts`,
      { token: admin },
    );
    expect(drafts.body.data[0]).toMatchObject({
      status: "APPROVED",
      mode: "AUTO",
      outboundMessageId: last.id,
      reviewedById: SAMANTA_USER_ID,
      content: last.content,
      reservationOutcome: "CREATED",
    });
    expect(
      drafts.body.data.find((d) => d.reservationOutcome === "PROPOSED"),
    ).toMatchObject({
      reservationRequestId: created.requestId,
      reservationProposal: { people: 4, commercialItemId: service.id },
    });

    // Historial: dos cambios SYSTEM del envío al propietario.
    const detail = await api<ReservationRequestDetail>(
      "GET",
      `/reservation-requests/${created.requestId}`,
      { token: admin },
    );
    expect(
      detail.body.statusHistory.map((h) => [h.previousStatus, h.newStatus, h.actorType, h.reason]),
    ).toEqual([
      ["READY_TO_SEND", "SENT_TO_OWNER", "SYSTEM", "Enviada al WhatsApp del propietario para su aprobación."],
      ["SENT_TO_OWNER", "WAITING_RESPONSE", "SYSTEM", "WhatsApp aceptó el mensaje al propietario (SENT)."],
    ]);
    expect(detail.body.statusHistory.every((h) => h.actor === null && h.actorId === null)).toBe(true);
    expect(detail.body.ownerMessage).toMatchObject({ status: "SENT", errorCode: null });
    expect(detail.body.reservation).toBeNull();
  });

  it("4–5: si el dueño responde ACEPTAR, la reserva entra al calendario de ese día", async () => {
    const conversationId = newConversation("Mario Acepta");
    const fecha = futureAt(4, 13);
    const { requestId } = runSimulator({
      accion: "solicitud",
      conversationId,
      fecha,
      personas: 2,
    }) as { requestId: string };

    const answer = runSimulator({
      accion: "dueno",
      requestId,
      decision: "ACEPTAR",
    }) as { status: string; reservationCode: string };
    expect(answer.status).toBe("ACCEPTED");
    expect(answer.reservationCode).toMatch(/^R-\d{4}-\d{6}$/);

    const day = new TZDate(Date.parse(fecha), TZ);
    const from = new TZDate(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      0,
      0,
      0,
      0,
      TZ,
    );
    const to = new TZDate(
      day.getFullYear(),
      day.getMonth(),
      day.getDate() + 1,
      0,
      0,
      0,
      0,
      TZ,
    );
    const calendar = await api<Paginated<Reservation>>("GET", "/reservations", {
      token: admin,
      query: {
        dateFrom: new Date(from.getTime()).toISOString(),
        dateTo: new Date(to.getTime()).toISOString(),
        excludeCancelled: "true",
      },
    });
    const reservation = calendar.body.data.find(
      (r) => r.reservationRequestId === requestId,
    );
    expect(reservation).toMatchObject({
      status: "CONFIRMED",
      numberOfPeople: 2,
      reservationAt: new Date(fecha).toISOString(),
    });

    const request = await api<ReservationRequestDetail>(
      "GET",
      `/reservation-requests/${requestId}`,
      { token: admin },
    );
    expect(request.body.status).toBe("ACCEPTED");
    // Entrada OWNER con el responsable de aprobación como actor.
    const config = mockStore().config!;
    const ownerEntry = request.body.statusHistory.at(-1)!;
    expect(ownerEntry).toMatchObject({
      previousStatus: "WAITING_RESPONSE",
      newStatus: "ACCEPTED",
      actorType: "OWNER",
      actorId: config.approvalResponsibleId,
      actor: { id: config.approvalResponsibleId, firstName: "Ricardo", lastName: "Mora" },
    });
    expect(request.body.reservation).toMatchObject({ id: reservation!.id, code: answer.reservationCode, status: "CONFIRMED" });
    // M9.3: el cliente recibe el aviso en la conversación de Samanta (ventana abierta: texto, sin plantilla).
    const last = (await messages(admin, conversationId))[0]!;
    expect(last).toMatchObject({ direction: "OUTBOUND", authorUserId: SAMANTA_USER_ID });
    expect(last.content).toContain("¡buenas noticias!");
    expect(last.content).toContain(answer.reservationCode);
    expect(request.body.customerNoticeMessage).toMatchObject({ id: last.id, conversationId, channel: "WHATSAPP", templateName: null });
    expect(request.body.customerNoticeError).toBeNull();

    // La conversación del propietario tiene su «Aceptar» y la respuesta del backend.
    const ownerConv = mockStore().conversations.find(
      (c) => mockStore().customers.find((x) => x.id === c.customerId)?.phone === config.ownerWhatsappNumber,
    )!;
    expect(ownerConv).toMatchObject({ isAssistantPaused: true, assistantPauseReason: "MANUAL" });
    const ownerMessages = await messages(admin, ownerConv.id);
    expect(ownerMessages[0]?.content).toBe(
      `Listo: la solicitud ${request.body.code} quedó ACEPTADA y la reserva ${answer.reservationCode} ya está en el calendario. Le avisamos al cliente por WhatsApp.`,
    );
    expect(ownerMessages[1]).toMatchObject({ direction: "INBOUND", content: "Aceptar" });

    // Una segunda respuesta del dueño no cambia nada (ALREADY_RESOLVED) y no crea otra reserva.
    expect(
      runSimulator({ accion: "dueno", requestId, decision: "RECHAZAR" }),
    ).toMatchObject({ outcome: "ALREADY_RESOLVED", status: "ACCEPTED" });
    expect(mockStore().reservations.filter((r) => r.reservationRequestId === requestId)).toHaveLength(1);

    // Un «sí» tardío: Samanta repite la decisión (ALREADY_DECIDED).
    expect(runSimulator({ accion: "cliente_confirma", requestId })).toMatchObject({ outcome: "ALREADY_DECIDED" });
    expect((await messages(admin, conversationId))[0]?.content).toContain("ya fue aprobada por el restaurante");

    // Sin enviar al propietario no hay respuesta que simular.
    const other = runSimulator({
      accion: "solicitud",
      conversationId: newConversation("Sin Envío"),
      fecha,
      personas: 2,
      enviarAlDueno: false,
    }) as { requestId: string; status: string };
    expect(other.status).toBe("READY_TO_SEND");
    expect(() =>
      runSimulator({ accion: "dueno", requestId: other.requestId, decision: "ACEPTAR" }),
    ).toThrow(SimulatorError);
  });

  it("propietario: proponer cambio, propuesta en comments y conversación del cliente en SAMANTA_HANDOFF", async () => {
    const conversationId = newConversation("Pablo Cambio");
    const { requestId } = runSimulator({
      accion: "solicitud",
      conversationId,
      fecha: futureAt(6, 20),
      personas: 3,
    }) as { requestId: string };
    const answer = runSimulator({
      accion: "dueno",
      requestId,
      decision: "PROPONER CAMBIO",
      propuesta: "Mejor a las 21:30",
    }) as { status: string; outcome: string; propuesta: string };
    expect(answer).toMatchObject({ status: "MODIFICATION_REQUESTED", outcome: "MODIFICATION_REQUESTED", propuesta: "DETAILS_ADDED" });

    const detail = await api<ReservationRequestDetail>(
      "GET",
      `/reservation-requests/${requestId}`,
      { token: admin },
    );
    expect(detail.body.statusHistory.at(-1)).toMatchObject({
      newStatus: "MODIFICATION_REQUESTED",
      actorType: "OWNER",
      reason: "El propietario propuso un cambio por WhatsApp.",
    });
    expect(detail.body.comments).toMatch(/\nCRM: propuesta del propietario \(\d{2}\/\d{2},? \d{2}:\d{2}\): Mejor a las 21:30$/);
    expect(detail.body.reservation).toBeNull();
    expect(detail.body.customerNoticeMessage?.status).toBe("DELIVERED");
    const conversation = await api<Conversation>("GET", `/conversations/${conversationId}`, { token: admin });
    expect(conversation.body).toMatchObject({ isAssistantPaused: true, assistantPauseReason: "SAMANTA_HANDOFF" });
    // No se puede editar, cancelar ni aprobar.
    expect((await api("POST", `/reservation-requests/${requestId}/approve`, { token: admin })).status).toBe(409);
  });

  it("propietario: la plantilla falla, vuelve a READY_TO_SEND y no se reenvía", async () => {
    const conversationId = newConversation("Fallo Envío");
    const { requestId } = runSimulator({
      accion: "solicitud",
      conversationId,
      fecha: futureAt(6, 13),
      personas: 2,
      enviarAlDueno: false,
    }) as { requestId: string };
    expect(runSimulator({ accion: "enviar_dueno", requestId, aceptado: false })).toMatchObject({ status: "SENT_TO_OWNER" });
    // SENT_TO_OWNER no admite PATCH ni cancelar.
    expect(
      (await api("PATCH", `/reservation-requests/${requestId}/status`, { token: admin, body: { status: "CANCELLED" } })).body,
    ).toMatchObject({ statusCode: 409, message: "La solicitud no admite modificaciones en su estado actual" });
    expect(runSimulator({ accion: "fallo_dueno", requestId })).toMatchObject({ status: "READY_TO_SEND" });
    const detail = await api<ReservationRequestDetail>(
      "GET",
      `/reservation-requests/${requestId}`,
      { token: admin },
    );
    expect(detail.body.ownerMessage).toMatchObject({ status: "FAILED", errorCode: "WHATSAPP_SEND_REJECTED" });
    expect(detail.body.statusHistory.at(-1)).toMatchObject({
      previousStatus: "SENT_TO_OWNER",
      newStatus: "READY_TO_SEND",
      actorType: "SYSTEM",
      reason: "No se pudo enviar al propietario (WHATSAPP_SEND_REJECTED). No se reenvía: apruébala o recházala a mano.",
    });
    expect(() => runSimulator({ accion: "enviar_dueno", requestId })).toThrow(/no se reenvía/);
  });

  it("6: si el dueño responde RECHAZAR, no hay reserva y se avisa al cliente", async () => {
    const conversationId = newConversation("Rita Rechazo");
    const { requestId } = runSimulator({
      accion: "solicitud",
      conversationId,
      fecha: futureAt(5, 21),
      personas: 6,
    }) as { requestId: string };
    runSimulator({ accion: "dueno", requestId, decision: "RECHAZAR" });

    const request = await api<ReservationRequest>(
      "GET",
      `/reservation-requests/${requestId}`,
      { token: admin },
    );
    expect(request.body.status).toBe("REJECTED");
    const customerId = await customerOf(admin, conversationId);
    const reservations = await api<Paginated<Reservation>>(
      "GET",
      "/reservations",
      { token: admin, query: { customerId } },
    );
    expect(reservations.body.pagination.total).toBe(0);
    expect((await messages(admin, conversationId))[0]?.content).toContain(
      "no pudo aprobar tu solicitud de reserva",
    );
    const detail = await api<ReservationRequestDetail>(
      "GET",
      `/reservation-requests/${requestId}`,
      { token: admin },
    );
    expect(detail.body.statusHistory.at(-1)).toMatchObject({
      newStatus: "REJECTED",
      actorType: "OWNER",
      reason: "Rechazada por el propietario por WhatsApp.",
    });
  });

  it("aviso al cliente: si una persona atiende la conversación, no se avisa (PERSON_ATTENDING) y queda la nota CRM", async () => {
    const conversationId = newConversation("Persona Atiende");
    const { requestId } = runSimulator({
      accion: "solicitud",
      conversationId,
      fecha: futureAt(5, 20),
      personas: 2,
    }) as { requestId: string };
    const paused = await api<Conversation>("PATCH", `/conversations/${conversationId}/assistant`, {
      token: admin,
      body: { paused: true },
    });
    expect(paused.body).toMatchObject({ isAssistantPaused: true, assistantPauseReason: "MANUAL" });
    expect(paused.body.assistantPausedAt).not.toBeNull();
    const answer = runSimulator({ accion: "dueno", requestId, decision: "ACEPTAR" }) as { avisoAlCliente: unknown };
    expect(answer.avisoAlCliente).toEqual({ error: "PERSON_ATTENDING" });
    const detail = await api<ReservationRequestDetail>(
      "GET",
      `/reservation-requests/${requestId}`,
      { token: admin },
    );
    expect(detail.body).toMatchObject({ status: "ACCEPTED", customerNoticeMessage: null, customerNoticeError: "PERSON_ATTENDING" });
    expect(detail.body.comments).toContain(
      "\nCRM: no se avisó al cliente la decisión del propietario (aceptada): una persona del equipo atiende su conversación.",
    );
    const resumed = await api<Conversation>("PATCH", `/conversations/${conversationId}/assistant`, {
      token: admin,
      body: { paused: false },
    });
    expect(resumed.body).toMatchObject({ isAssistantPaused: false, assistantPauseReason: null, assistantPausedAt: null });
  });

  it("2: Samanta solo ofrece servicios activos y aprobados", () => {
    const conversationId = newConversation("Sara Servicio");
    const items = mockStore().items;
    const inactive = items.find(
      (i) => !i.isActive && i.approvalStatus === "APPROVED",
    );
    const draft = items.find(
      (i) => i.isActive && i.approvalStatus !== "APPROVED",
    );
    expect(inactive).toBeDefined();
    expect(draft).toBeDefined();
    for (const item of [inactive!, draft!]) {
      expect(() =>
        runSimulator({
          accion: "solicitud",
          conversationId,
          fecha: futureAt(2, 20),
          personas: 2,
          servicioId: item.id,
        }),
      ).toThrow(/no está activo y aprobado/);
    }
    // El mismo pedido con un servicio ofrecible sí crea la solicitud.
    const ok = items.find(
      (i) => i.isActive && i.approvalStatus === "APPROVED",
    )!;
    expect(
      runSimulator({
        accion: "solicitud",
        conversationId,
        fecha: futureAt(2, 20),
        personas: 2,
        servicioId: ok.id,
      }),
    ).toMatchObject({
      status: "WAITING_RESPONSE",
    });
  });

  it("8: un grupo de más de 20 personas pasa a una persona y no crea solicitud", async () => {
    const conversationId = newConversation("Empresa Grande");
    const result = runSimulator({
      accion: "solicitud",
      conversationId,
      fecha: futureAt(10, 20),
      personas: 40,
    }) as {
      transferidaAHumano?: boolean;
    };
    expect(result.transferidaAHumano).toBe(true);

    const conversation = await api<Conversation>(
      "GET",
      `/conversations/${conversationId}`,
      { token: admin },
    );
    expect(conversation.body.isAssistantPaused).toBe(true);
    expect(conversation.body.assistantPauseReason).toBe("SAMANTA_HANDOFF");
    const requests = await api<Paginated<ReservationRequest>>(
      "GET",
      "/reservation-requests",
      {
        token: admin,
        query: { customerId: conversation.body.customerId },
      },
    );
    expect(requests.body.pagination.total).toBe(0);
    // En pausa, Samanta ya no escribe ni crea solicitudes.
    expect(() =>
      runSimulator({ accion: "samanta", conversationId, texto: "Hola" }),
    ).toThrow(/en pausa/);
  });

  it("7: un operador toma la conversación (pausa, envía, se asigna) y luego la devuelve a Samanta", async () => {
    const operator = await login("camila@sabormagico.pe");
    const me = (
      await api<{ id: string }>("GET", "/auth/me", { token: operator })
    ).body.id;
    const conversationId = newConversation("Toma Control");

    expect(
      (
        await api("PATCH", `/conversations/${conversationId}/assistant`, {
          token: operator,
          body: { paused: true },
        })
      ).status,
    ).toBe(200);
    const headers = { "idempotency-key": "prueba-flujo-0001-abcdef" };
    const sent = await api<Message>(
      "POST",
      `/conversations/${conversationId}/messages`,
      {
        token: operator,
        headers,
        body: { type: "TEXT", content: "Hola, te atiende Camila." },
      },
    );
    expect(sent.status).toBe(202);
    expect(sent.body).toMatchObject({
      direction: "OUTBOUND",
      status: "QUEUED",
      authorUserId: me,
    });
    const assigned = await api<Conversation>(
      "PATCH",
      `/conversations/${conversationId}/assignee`,
      {
        token: operator,
        body: { assignedUserId: me },
      },
    );
    expect(assigned.body).toMatchObject({
      isAssistantPaused: true,
      assignedUserId: me,
    });
    expect(() =>
      runSimulator({ accion: "samanta", conversationId, texto: "Hola" }),
    ).toThrow(/en pausa/);

    // Reintento con la misma clave: mismo mensaje, sin duplicar. Con otro texto: 409.
    const retry = await api<Message>(
      "POST",
      `/conversations/${conversationId}/messages`,
      {
        token: operator,
        headers,
        body: { type: "TEXT", content: "Hola, te atiende Camila." },
      },
    );
    expect(retry.body.id).toBe(sent.body.id);
    const conflict = await api(
      "POST",
      `/conversations/${conversationId}/messages`,
      {
        token: operator,
        headers,
        body: { type: "TEXT", content: "Otro texto" },
      },
    );
    expect(conflict.status).toBe(409);

    // Devolver a Samanta: primero quitar el responsable, luego reanudar.
    await api("PATCH", `/conversations/${conversationId}/assignee`, {
      token: operator,
      body: { assignedUserId: null },
    });
    const resumed = await api<Conversation>(
      "PATCH",
      `/conversations/${conversationId}/assistant`,
      { token: operator, body: { paused: false } },
    );
    expect(resumed.body).toMatchObject({
      isAssistantPaused: false,
      assignedUserId: null,
    });
    expect(
      runSimulator({ accion: "samanta", conversationId, texto: "Sigo yo." }),
    ).toMatchObject({ ok: true });
  });
});

describe("reglas del contrato que la Bandeja respeta", () => {
  it("un operador no puede tomar ni soltar una conversación que atiende otra persona", async () => {
    const operator = await login("camila@sabormagico.pe");
    const conversationId = newConversation("Ya Asignada");
    const adminId = (
      await api<{ id: string }>("GET", "/auth/me", { token: admin })
    ).body.id;
    await api("PATCH", `/conversations/${conversationId}/assignee`, {
      token: admin,
      body: { assignedUserId: adminId },
    });

    const release = await api(
      "PATCH",
      `/conversations/${conversationId}/assignee`,
      { token: operator, body: { assignedUserId: null } },
    );
    expect(release.status).toBe(403);
  });

  it("el propietario solo lee y Soporte EYAQ no accede a la Bandeja", async () => {
    const owner = await login("ricardo@sabormagico.pe");
    const conversationId = newConversation("Solo Lectura");
    expect(
      (
        await api("GET", `/conversations/${conversationId}/messages`, {
          token: owner,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api("PATCH", `/conversations/${conversationId}/assistant`, {
          token: owner,
          body: { paused: true },
        })
      ).status,
    ).toBe(403);
    const send = await api(
      "POST",
      `/conversations/${conversationId}/messages`,
      {
        token: owner,
        headers: { "idempotency-key": "propietario-0001-abcdef" },
        body: { type: "TEXT", content: "Hola" },
      },
    );
    expect(send.status).toBe(403);

    const support = await login("soporte@eyaqsystems.com");
    expect(
      (await api("GET", "/conversations", { token: support })).status,
    ).toBe(403);
  });

  it("WhatsApp, Messenger e Instagram envían dentro de la ventana de 24 h", async () => {
    const facebook = (
      runSimulator({
        accion: "entrante",
        texto: "Hola",
        canal: "FACEBOOK",
        nombre: "Face Book",
      }) as { conversationId: string }
    ).conversationId;
    const viaFacebook = await api<Message>(
      "POST",
      `/conversations/${facebook}/messages`,
      {
        token: admin,
        headers: { "idempotency-key": "facebook-0001-abcdefgh" },
        body: { type: "TEXT", content: "Hola" },
      },
    );
    expect(viaFacebook.status).toBe(202);
    expect(viaFacebook.body).toMatchObject({
      channel: "FACEBOOK",
      direction: "OUTBOUND",
      status: "QUEUED",
    });

    const instagram = (
      runSimulator({
        accion: "entrante",
        texto: "Hola",
        canal: "INSTAGRAM",
        nombre: "Insta Gram",
      }) as { conversationId: string }
    ).conversationId;
    const viaInstagram = await api<Message>(
      "POST",
      `/conversations/${instagram}/messages`,
      {
        token: admin,
        headers: { "idempotency-key": "instagram-0001-abcdefg" },
        body: { type: "TEXT", content: "Hola" },
      },
    );
    expect(viaInstagram.status).toBe(202);
    expect(viaInstagram.body).toMatchObject({
      channel: "INSTAGRAM",
      direction: "OUTBOUND",
      status: "QUEUED",
    });
    // Instagram cuenta bytes: 600 «á» son 600 caracteres pero 1200 bytes.
    const tooLong = await api<{ message: string }>(
      "POST",
      `/conversations/${instagram}/messages`,
      {
        token: admin,
        headers: { "idempotency-key": "instagram-0002-abcdefg" },
        body: { type: "TEXT", content: "á".repeat(600) },
      },
    );
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toBe(
      "Instagram admite hasta 1000 bytes por respuesta; las tildes y los emojis ocupan más de uno",
    );

    // El último mensaje del cliente fue hace 25 h: WhatsApp ya no permite responder sin plantilla.
    const whatsapp = newConversation("Ventana Cerrada");
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    for (const m of mockStore().messages)
      if (m.conversationId === whatsapp) m.occurredAt = longAgo;
    const closed = await api<{ message: string }>(
      "POST",
      `/conversations/${whatsapp}/messages`,
      {
        token: admin,
        headers: { "idempotency-key": "ventana-0001-abcdefgh" },
        body: { type: "TEXT", content: "Hola" },
      },
    );
    expect(closed.status).toBe(409);
    expect(closed.body.message).toContain("Ventana de WhatsApp cerrada");
  });
});
