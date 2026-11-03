import { describe, expect, it } from "vitest";
import type { Message } from "@/lib/api/types";
import { conversationMode, customerName, messageAuthor, messageText, previewPrefix } from "./conversation";
import { REQUEST_TAB_STATUSES, requestStatusView, requestTimeline } from "./statuses";

const state = (steps: ReturnType<typeof requestTimeline>) =>
  steps.map((s) => (s.dot !== "#fff" ? "hecho" : s.ring !== "#d6dbe4" ? "en curso" : "pendiente"));

describe("línea de tiempo de la solicitud (mockup)", () => {
  it("negociando: Samanta está en el primer paso", () => {
    expect(state(requestTimeline("INCOMPLETE_DATA"))).toEqual(["en curso", "pendiente", "pendiente"]);
    expect(requestTimeline("READY_TO_SEND")[0]!.sub).toContain("Datos completos");
  });

  it("esperando al dueño: enviada por su WhatsApp personal, falta su respuesta", () => {
    const steps = requestTimeline("WAITING_RESPONSE");
    expect(state(steps)).toEqual(["hecho", "en curso", "pendiente"]);
    expect(steps[2]!.label).toBe("Respuesta del dueño");
    expect(steps[2]!.sub).toBe("ACEPTAR o RECHAZAR");
  });

  it("aceptada, rechazada o cancelada cierran la línea con su desenlace", () => {
    expect(state(requestTimeline("ACCEPTED"))).toEqual(["hecho", "hecho", "hecho"]);
    expect(requestTimeline("ACCEPTED")[2]!.label).toBe("Aceptada por el dueño");
    expect(requestTimeline("REJECTED")[2]).toMatchObject({ label: "Rechazada por el dueño", sub: "Samanta propone otra alternativa" });
    expect(requestTimeline("CANCELLED")[2]!.label).toBe("Cancelada");
  });

  it("las etiquetas y pestañas siguen los grupos del mockup", () => {
    expect(requestStatusView("WAITING_RESPONSE")).toMatchObject({ label: "Esperando al dueño", group: "esperando" });
    expect(requestStatusView("RENEGOTIATING").group).toBe("negociando");
    expect(REQUEST_TAB_STATUSES.esperando).toEqual(["SENT_TO_OWNER", "WAITING_RESPONSE"]);
  });
});

describe("conversación", () => {
  it("el modo se deriva de la pausa y del responsable", () => {
    expect(conversationMode({ isAssistantPaused: false, assignedUserId: "u" })).toBe("samanta");
    expect(conversationMode({ isAssistantPaused: true, assignedUserId: "u" })).toBe("operador");
    expect(conversationMode({ isAssistantPaused: true, assignedUserId: null })).toBe("pausa");
  });

  it("distingue cliente, Samanta y equipo, y arma la vista previa", () => {
    expect(messageAuthor({ direction: "INBOUND", authorUserId: null })).toBe("cliente");
    expect(messageAuthor({ direction: "OUTBOUND", authorUserId: null })).toBe("samanta");
    expect(previewPrefix({ direction: "OUTBOUND", authorUserId: "yo" }, "yo")).toBe("Tú: ");
    expect(previewPrefix({ direction: "OUTBOUND", authorUserId: "otro" }, "yo")).toBe("Operador: ");
    expect(previewPrefix({ direction: "INBOUND", authorUserId: null }, "yo")).toBe("");
  });

  it("los adjuntos se describen (el backend no permite descargarlos)", () => {
    const file = { type: "FILE", content: null, attachments: [{ fileName: "carta.pdf" }] } as unknown as Message;
    expect(messageText(file)).toBe("[Archivo: carta.pdf]");
    const image = { type: "IMAGE", content: "Mira", attachments: [] } as unknown as Message;
    expect(messageText(image)).toBe("[Imagen] Mira");
  });

  it("un contacto de WhatsApp sin nombre se muestra por su teléfono", () => {
    expect(customerName({ firstName: null, lastName: null, phone: "+51912345678", email: null })).toBe("+51912345678");
    expect(customerName({ firstName: "Ana", lastName: null, phone: null, email: null })).toBe("Ana");
    expect(customerName({ firstName: null, lastName: null, phone: null, email: null })).toBe("Cliente sin nombre");
  });
});
