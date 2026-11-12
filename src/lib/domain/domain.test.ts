import { describe, expect, it } from "vitest";
import { SAMANTA_USER_ID, type Message } from "@/lib/api/types";
import { conversationMode, customerInitials, customerName, messageAuthor, messageText, previewPrefix } from "./conversation";
import { REQUEST_TAB_STATUSES, requestStatusView, requestTimeline } from "./statuses";

const state = (steps: ReturnType<typeof requestTimeline>) =>
  steps.map((s) => (s.dot !== "#fff" ? "hecho" : s.ring !== "#d6dbe4" ? "en curso" : "pendiente"));

describe("línea de tiempo de la solicitud (mockup)", () => {
  it("negociando: Samanta está en el primer paso", () => {
    expect(state(requestTimeline("INCOMPLETE_DATA"))).toEqual(["en curso", "pendiente", "pendiente"]);
    expect(requestTimeline("READY_TO_SEND")[0]!.sub).toContain("Datos completos");
  });

  it("esperando al propietario: enviada por su WhatsApp personal, falta su respuesta", () => {
    const steps = requestTimeline("WAITING_RESPONSE");
    expect(state(steps)).toEqual(["hecho", "en curso", "pendiente"]);
    expect(steps[1]!.label).toBe("Enviada al propietario");
    expect(steps[2]!.label).toBe("Respuesta del propietario");
    expect(steps[2]!.sub).toBe("Aceptar, rechazar o proponer cambio");
  });

  it("aceptada, rechazada o cancelada cierran la línea con su desenlace", () => {
    expect(state(requestTimeline("ACCEPTED"))).toEqual(["hecho", "hecho", "hecho"]);
    expect(requestTimeline("ACCEPTED")[2]).toMatchObject({ label: "Aceptada", sub: "Reserva en el calendario" });
    // El backend no propone otra fecha al rechazar: solo informa que no hay reserva.
    expect(requestTimeline("REJECTED")[2]).toMatchObject({ label: "Rechazada", sub: "No se registró ninguna reserva" });
    expect(requestTimeline("MODIFICATION_REQUESTED")[2]).toMatchObject({ label: "Cambio propuesto", sub: "Coordina el cambio con el cliente" });
    expect(requestTimeline("CANCELLED")[2]!.label).toBe("Cancelada");
  });

  it("una solicitud cancelada no figura como enviada al dueño", () => {
    expect(state(requestTimeline("CANCELLED"))).toEqual(["hecho", "pendiente", "hecho"]);
  });

  it("las etiquetas y pestañas siguen los grupos del mockup", () => {
    expect(requestStatusView("WAITING_RESPONSE")).toMatchObject({ label: "Esperando al propietario", group: "esperando" });
    expect(requestStatusView("RENEGOTIATING").group).toBe("negociando");
    expect(REQUEST_TAB_STATUSES.esperando).toEqual(["SENT_TO_OWNER", "WAITING_RESPONSE"]);
    // «Cambio propuesto» no espera al propietario: necesita a una persona del equipo y tiene pestaña propia.
    expect(requestStatusView("MODIFICATION_REQUESTED")).toMatchObject({ label: "Cambio propuesto", group: "cambio" });
    expect(REQUEST_TAB_STATUSES.cambio).toEqual(["MODIFICATION_REQUESTED"]);
  });
});

describe("conversación", () => {
  it("el modo se deriva de la pausa y del responsable", () => {
    expect(conversationMode({ isAssistantPaused: false, assignedUserId: "u" })).toBe("samanta");
    expect(conversationMode({ isAssistantPaused: true, assignedUserId: "u" })).toBe("operador");
    expect(conversationMode({ isAssistantPaused: true, assignedUserId: null })).toBe("pausa");
  });

  it("distingue cliente, Samanta y equipo, y arma la vista previa", () => {
    expect(messageAuthor({ id: "m1", direction: "INBOUND" })).toBe("cliente");
    // Samanta solo si el mensaje salió de un borrador aprobado; un saliente sin autor ya no se supone de Samanta.
    expect(messageAuthor({ id: "m2", direction: "OUTBOUND" })).toBe("operador");
    expect(messageAuthor({ id: "m2", direction: "OUTBOUND" }, new Set(["m2"]))).toBe("samanta");
    // Respuestas automáticas y textos del backend (p. ej. al propietario) llevan el usuario de sistema de Samanta.
    expect(messageAuthor({ id: "m3", direction: "OUTBOUND", authorUserId: SAMANTA_USER_ID })).toBe("samanta");
    expect(previewPrefix({ direction: "OUTBOUND", authorUserId: "yo" }, "yo")).toBe("Tú: ");
    expect(previewPrefix({ direction: "OUTBOUND", authorUserId: "otro" }, "yo")).toBe("Equipo: ");
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

  it("un cliente de Messenger sin datos tiene un respaldo propio", () => {
    expect(customerName({ firstName: null, lastName: null, phone: null, email: null }, "FACEBOOK")).toBe("Cliente de Messenger");
    expect(customerName({ firstName: "Rosa Mamani", lastName: null, phone: null, email: null }, "FACEBOOK")).toBe("Rosa Mamani");
  });

  it("un cliente de Instagram sin datos tiene un respaldo propio; con usuario se muestra el usuario", () => {
    expect(customerName({ firstName: null, lastName: null, phone: null, email: null }, "INSTAGRAM")).toBe("Cliente de Instagram");
    expect(customerName({ firstName: "Dushan Wqt", lastName: null, phone: null, email: null }, "INSTAGRAM")).toBe("Dushan Wqt");
    expect(customerName({ firstName: "@dushan1812", lastName: null, phone: null, email: null }, "INSTAGRAM")).toBe("@dushan1812");
  });

  it("el avatar solo usa iniciales de un nombre real: sin nombre muestra «?»", () => {
    expect(customerInitials({ firstName: "Dushan Wqt", lastName: null })).toBe("DW");
    expect(customerInitials({ firstName: "Frank", lastName: "Huarcaya" })).toBe("FH");
    expect(customerInitials({ firstName: "@dushan1812", lastName: null })).toBe("D");
    // Sin nombre no salen «CD» de «Cliente de Messenger» ni «+» del teléfono.
    expect(customerInitials({ firstName: null, lastName: null })).toBe("?");
    expect(customerInitials({ firstName: "  ", lastName: null })).toBe("?");
    expect(customerInitials(null)).toBe("?");
  });
});
