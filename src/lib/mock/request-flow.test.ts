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
  SamantaDraftListResponse,
} from "@/lib/api/types";
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
    expect(requests.body.data[0]).toMatchObject({
      status: "WAITING_RESPONSE",
      numberOfPeople: 4,
      quotedPrice: service.precio,
      sourceChannel: "WHATSAPP",
    });

    // Solo las aceptadas entran al calendario: todavía no hay reserva.
    const reservations = await api<Paginated<Reservation>>(
      "GET",
      "/reservations",
      { token: admin, query: { customerId } },
    );
    expect(reservations.body.pagination.total).toBe(0);

    // Como en bk-crm, el mensaje de Samanta tiene autor (quien aprobó el borrador; aquí, el ADMIN porque la
    // conversación está libre) y sale de un borrador APPROVED que apunta a él.
    const adminId = (
      await api<{ id: string }>("GET", "/auth/me", { token: admin })
    ).body.id;
    const last = (await messages(admin, conversationId))[0]!;
    expect(last).toMatchObject({
      direction: "OUTBOUND",
      authorUserId: adminId,
    });
    expect(last.content).toContain("envié tu solicitud");
    const drafts = await api<SamantaDraftListResponse>(
      "GET",
      `/conversations/${conversationId}/assistant-drafts`,
      { token: admin },
    );
    expect(drafts.body.data[0]).toMatchObject({
      status: "APPROVED",
      outboundMessageId: last.id,
      reviewedById: adminId,
      content: last.content,
    });
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

    const request = await api<ReservationRequest>(
      "GET",
      `/reservation-requests/${requestId}`,
      { token: admin },
    );
    expect(request.body.status).toBe("ACCEPTED");
    expect((await messages(admin, conversationId))[0]?.content).toContain(
      "¡Confirmado!",
    );

    // El dueño no puede responder dos veces.
    expect(() =>
      runSimulator({ accion: "dueno", requestId, decision: "RECHAZAR" }),
    ).toThrow(SimulatorError);
  });

  it("6: si el dueño responde RECHAZAR, no hay reserva y Samanta propone otra fecha u hora", async () => {
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
      "¿Te propongo otra fecha u hora?",
    );
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
