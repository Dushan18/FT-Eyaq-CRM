import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Conversation, Message, Reservation, ReservationRequest } from "@/lib/api/types";
import {
  buildHistory,
  channelFromSlug,
  composerState,
  conversationControls,
  conversationTag,
  estimateReplyWindow,
  latestRequestByCustomer,
  mergeMessages,
  outboundAuthorLabel,
  outboundStatusView,
  sendErrorText,
  slugFromChannel,
} from "./inbox-utils";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-14T18:00:00.000Z");

function message(partial: Partial<Message> & Pick<Message, "sequence">): Message {
  return {
    id: `m-${partial.sequence}`,
    conversationId: "c-1",
    channel: "WHATSAPP",
    externalMessageId: null,
    direction: "INBOUND",
    status: "PROCESSED",
    type: "TEXT",
    content: "hola",
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
    createdAt: "2026-10-14T17:00:00.000Z",
    updatedAt: "2026-10-14T17:00:00.000Z",
    attachments: [],
    ...partial,
  };
}

function conversation(partial: Partial<Conversation> = {}): Conversation {
  return {
    id: "c-1",
    customerId: "cu-1",
    channel: "WHATSAPP",
    isAssistantPaused: false,
    assignedUserId: null,
    lastMessageAt: "2026-10-14T17:00:00.000Z",
    createdAt: "2026-10-14T16:00:00.000Z",
    updatedAt: "2026-10-14T17:00:00.000Z",
    customer: { id: "cu-1", firstName: "María", lastName: "Fernández", phone: "+51987000111", email: null },
    assignedUser: null,
    unreadCount: 0,
    ...partial,
  };
}

const camila = { id: OTHER, firstName: "Camila", lastName: "Torres", isActive: true, isEligible: true };

describe("filtro de canal en la URL", () => {
  it("traduce las claves cortas y rechaza valores desconocidos", () => {
    expect(channelFromSlug("web")).toBe("WEBSITE");
    expect(channelFromSlug("telegram")).toBeUndefined();
    expect(channelFromSlug(null)).toBeUndefined();
    expect(slugFromChannel("INSTAGRAM")).toBe("instagram");
    expect(slugFromChannel(undefined)).toBeNull();
  });
});

describe("mensajes", () => {
  it("une páginas sin duplicar, conserva el estado más reciente y ordena por sequence", () => {
    const older = [message({ sequence: 2, status: "QUEUED", direction: "OUTBOUND" }), message({ sequence: 1 })];
    const recent = [message({ sequence: 3 }), message({ sequence: 2, status: "DELIVERED", direction: "OUTBOUND" })];
    const merged = mergeMessages(recent, older);
    expect(merged.map((m) => m.sequence)).toEqual([1, 2, 3]);
    expect(merged[1]!.status).toBe("DELIVERED");
  });

  it("estima la ventana de 24 h con el último entrante que tiene occurredAt", () => {
    const open = estimateReplyWindow([message({ sequence: 1, occurredAt: "2026-10-14T10:00:00.000Z" })], NOW);
    expect(open).toEqual({ open: true, closesAt: Date.parse("2026-10-15T10:00:00.000Z") });
    const closed = estimateReplyWindow([message({ sequence: 1, occurredAt: "2026-10-13T17:00:00.000Z" })], NOW);
    expect(closed.open).toBe(false);
    // Sin occurredAt el backend nunca abre la ventana.
    expect(estimateReplyWindow([message({ sequence: 1, receivedAt: "2026-10-14T17:59:00.000Z" })], NOW).open).toBe(false);
  });

  it("solo muestra el estado de entrega cuando aporta (lo normal es silencioso)", () => {
    const samanta = message({ sequence: 1, direction: "OUTBOUND", status: "DELIVERED" });
    expect(outboundStatusView(samanta)).toBeNull();
    const mine = message({ sequence: 2, direction: "OUTBOUND", status: "DELIVERED", authorUserId: ME });
    expect(outboundStatusView(mine)?.text).toBe("✓✓ Entregado");
    const failed = message({ sequence: 3, direction: "OUTBOUND", status: "FAILED", errorCode: "WHATSAPP_WINDOW_CLOSED" });
    expect(outboundStatusView(failed)).toEqual({ text: "No se envió: la ventana de 24 h estaba cerrada", tone: "error" });
    expect(outboundStatusView(message({ sequence: 4, direction: "OUTBOUND", status: "UNKNOWN" }))?.tone).toBe("warning");
    expect(outboundStatusView(message({ sequence: 5 }))).toBeNull();
  });

  it("identifica a Samanta, a quien escribe y al responsable", () => {
    expect(outboundAuthorLabel({ direction: "OUTBOUND", authorUserId: null }, ME, null)).toBe("Samanta · IA");
    expect(outboundAuthorLabel({ direction: "OUTBOUND", authorUserId: ME }, ME, null)).toBe("Tú");
    expect(outboundAuthorLabel({ direction: "OUTBOUND", authorUserId: OTHER }, ME, camila)).toBe("Camila Torres");
    expect(outboundAuthorLabel({ direction: "OUTBOUND", authorUserId: OTHER }, ME, null)).toBe("Operador");
  });
});

describe("etiqueta de la fila", () => {
  const request = (status: ReservationRequest["status"], createdAt: string, customerId = "cu-1") =>
    ({ id: `r-${createdAt}`, customerId, status, createdAt }) as ReservationRequest;

  it("usa la última solicitud del cliente", () => {
    const map = latestRequestByCustomer([
      request("REJECTED", "2026-01-01T00:00:00.000Z"),
      request("WAITING_RESPONSE", "2026-10-14T00:00:00.000Z"),
      request("ACCEPTED", "2026-10-01T00:00:00.000Z", "cu-2"),
    ]);
    expect(map.get("cu-1")?.status).toBe("WAITING_RESPONSE");
    expect(conversationTag(conversation(), map.get("cu-1")).label).toBe("Esperando al dueño");
  });

  it("sin solicitud: «Requiere humano» si Samanta está en pausa, si no «Consulta»", () => {
    expect(conversationTag(conversation({ isAssistantPaused: true }), undefined).label).toBe("Requiere humano");
    expect(conversationTag(conversation(), null).label).toBe("Consulta");
  });
});

describe("controles de la conversación", () => {
  it("el operador puede tomar una conversación libre y pausar a Samanta", () => {
    const c = conversationControls(conversation(), ME, ["OPERATOR"]);
    expect(c.pause).toEqual({ visible: true, paused: false });
    expect(c.transfer).toMatchObject({ visible: true, kind: "take", enabled: true });
  });

  it("el operador no puede devolver una conversación que atiende otra persona; el administrador sí", () => {
    const held = conversation({ isAssistantPaused: true, assignedUserId: OTHER, assignedUser: camila });
    const operator = conversationControls(held, ME, ["OPERATOR"]);
    expect(operator.pause.visible).toBe(false);
    expect(operator.transfer).toMatchObject({ kind: "release", enabled: false });
    expect(operator.transfer.reason).toContain("Camila Torres");
    expect(conversationControls(held, ME, ["ADMIN"]).transfer).toMatchObject({ kind: "release", enabled: true });
  });

  it("el propietario solo lee", () => {
    const c = conversationControls(conversation(), ME, ["OWNER"]);
    expect(c.pause.visible).toBe(false);
    expect(c.transfer.visible).toBe(false);
  });
});

describe("cuadro de texto (regla 7: quien escribe toma el control)", () => {
  const open = { open: true };

  it("con Samanta activa, enviar pausa y asigna a quien escribe", () => {
    const state = composerState(conversation(), ME, ["OPERATOR"], open);
    expect(state).toMatchObject({ enabled: true, plan: { pause: true, assign: true } });
  });

  it("si ya la atiende quien escribe, solo envía", () => {
    const state = composerState(conversation({ isAssistantPaused: true, assignedUserId: ME }), ME, ["OPERATOR"], open);
    expect(state).toEqual({ enabled: true, notice: null, plan: { pause: false, assign: false } });
  });

  it("bloquea al operador si otra persona atiende; el administrador envía sin reasignar", () => {
    const held = conversation({ isAssistantPaused: true, assignedUserId: OTHER, assignedUser: camila });
    expect(composerState(held, ME, ["OPERATOR"], open).enabled).toBe(false);
    expect(composerState(held, ME, ["ADMIN"], open)).toMatchObject({ enabled: true, plan: { pause: false, assign: false } });
  });

  it("explica por qué no se puede escribir", () => {
    const reason = (s: ReturnType<typeof composerState>) => (s.enabled ? null : s.reason);
    expect(reason(composerState(conversation(), ME, ["OWNER"], open))).toContain("no responder");
    expect(reason(composerState(conversation({ channel: "FACEBOOK" }), ME, ["ADMIN"], open))).toContain("Facebook");
    const noPhone = conversation({ customer: { id: "cu-1", firstName: "Ana", lastName: null, phone: null, email: "a@b.pe" } });
    expect(reason(composerState(noPhone, ME, ["ADMIN"], open))).toContain("teléfono");
    expect(reason(composerState(conversation(), ME, ["ADMIN"], { open: false }))).toContain("24 h");
  });
});

describe("errores de envío", () => {
  it("traduce las respuestas del backend", () => {
    expect(sendErrorText(new ApiError(409, ["Ventana de WhatsApp cerrada; se requiere una plantilla aprobada"]))).toContain("24 h");
    expect(sendErrorText(new ApiError(503, ["WhatsApp no está habilitado"]))).toContain("no está habilitado");
    expect(sendErrorText(new ApiError(0, ["sin red"]))).toContain("no se duplicará");
  });
});

describe("historial del cliente", () => {
  it("no repite la solicitud actual, su reserva ni las solicitudes aceptadas que ya tienen reserva", () => {
    const requests = [
      { id: "q-actual", code: "RES-2026-000461", status: "WAITING_RESPONSE", reservationAt: "2026-10-17T01:00:00.000Z", createdAt: "2026-10-14T00:00:00.000Z" },
      { id: "q-aceptada", code: "RES-2026-000300", status: "ACCEPTED", reservationAt: "2026-06-14T01:00:00.000Z", createdAt: "2026-06-01T00:00:00.000Z" },
      { id: "q-rechazada", code: "RES-2025-000312", status: "REJECTED", reservationAt: "2025-11-03T01:00:00.000Z", createdAt: "2025-10-20T00:00:00.000Z" },
    ] as ReservationRequest[];
    const reservations = [
      { id: "r-1", code: "R-2026-000140", reservationRequestId: "q-aceptada", status: "COMPLETED", reservationAt: "2026-06-14T01:00:00.000Z" },
    ] as Reservation[];
    const items = buildHistory(requests, reservations, "q-actual");
    expect(items.map((i) => [i.code, i.label])).toEqual([
      ["R-2026-000140", "Completada"],
      ["RES-2025-000312", "Rechazada"],
    ]);
  });
});
