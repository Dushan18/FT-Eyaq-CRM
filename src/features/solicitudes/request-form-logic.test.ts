import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Customer, CustomerSummary, ReservationRequest } from "@/lib/api/types";
import {
  buildCreateRequestBody,
  buildUpdateRequestBody,
  defaultRequestChannel,
  emptyRequestForm,
  isEditableRequest,
  requestFormValues,
  requestSaveErrors,
  validateRequestForm,
  type RequestFormValues,
} from "./request-form-logic";

const TZ = "America/Lima";
/** 3/11/2026 10:00 en Lima. */
const NOW = Date.parse("2026-11-03T15:00:00.000Z");

const summary: CustomerSummary = {
  id: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  firstName: "Carlos",
  lastName: "Quispe",
  phone: "987 654 321",
  email: null,
};

const customer: Customer = {
  ...summary,
  phoneCountry: "PE",
  sourceChannel: "FACEBOOK",
  status: "NEW",
  firstContactAt: "2026-11-01T10:00:00.000Z",
  lastContactAt: "2026-11-01T10:00:00.000Z",
  notes: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

function makeRequest(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    id: "c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93",
    code: "RES-2026-000042",
    externalReference: null,
    customerId: summary.id,
    commercialItemId: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    conversationId: null,
    sourceChannel: "PHONE",
    reservationAt: "2026-11-08T01:00:00.000Z",
    numberOfPeople: 4,
    quotedPrice: "150.00",
    currency: "PEN",
    comments: "Consulta por una reserva familiar",
    specialRequirements: null,
    status: "READY_TO_SEND",
    createdAt: "2026-11-03T02:35:20.418Z",
    updatedAt: "2026-11-03T02:35:20.418Z",
    customer: summary,
    commercialItem: {
      id: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
      nameEs: "Trucha a la parrilla",
      nameEn: null,
      type: "DISH",
      isActive: true,
      approvalStatus: "APPROVED",
    },
    ...overrides,
  };
}

const filled = (patch: Partial<RequestFormValues> = {}): RequestFormValues => ({
  ...emptyRequestForm(customer),
  ...patch,
});

describe("valores iniciales", () => {
  it("el canal por defecto es el indicado o, si no, el de origen del cliente", () => {
    expect(defaultRequestChannel(customer)).toBe("FACEBOOK");
    expect(defaultRequestChannel(customer, "PHONE")).toBe("PHONE");
    // Un resumen no trae el canal de origen: hay que elegirlo.
    expect(defaultRequestChannel(summary)).toBe("");
    expect(defaultRequestChannel(null)).toBe("");
    expect(emptyRequestForm(summary, "WHATSAPP")).toMatchObject({ customer: summary, sourceChannel: "WHATSAPP", currency: null });
  });

  it("la edición muestra la fecha guardada en la zona del restaurante", () => {
    expect(requestFormValues(makeRequest(), TZ)).toMatchObject({
      when: { day: "2026-11-07", time: "20:00" },
      people: "4",
      price: "150.00",
      currency: "PEN",
      specialRequirements: "",
    });
    expect(requestFormValues(makeRequest({ reservationAt: null, numberOfPeople: null }), TZ)).toMatchObject({
      when: { day: "", time: "" },
      people: "",
    });
  });

  it("solo se editan y cancelan las solicitudes en Negociando y Lista para enviar", () => {
    expect(isEditableRequest("INCOMPLETE_DATA")).toBe(true);
    expect(isEditableRequest("READY_TO_SEND")).toBe(true);
    for (const status of ["SENT_TO_OWNER", "WAITING_RESPONSE", "ACCEPTED", "REJECTED", "CANCELLED"] as const) {
      expect(isEditableRequest(status)).toBe(false);
    }
  });
});

describe("validación", () => {
  const validate = (values: RequestFormValues) => validateRequestForm(values, { timeZone: TZ, now: NOW });

  it("exige cliente y canal; lo demás es opcional", () => {
    expect(validate(emptyRequestForm())).toEqual({
      customerId: "Elige un cliente.",
      sourceChannel: "Elige el canal por el que llegó la solicitud.",
    });
    expect(validate(filled())).toEqual({});
  });

  it("la fecha, si se da, va completa y es futura (con un minuto de margen)", () => {
    expect(validate(filled({ when: { day: "2026-11-20", time: "" } })).reservationAt).toBe(
      "Completa el día y la hora, o deja ambos vacíos.",
    );
    expect(validate(filled({ when: { day: "2026-11-03", time: "09:00" } })).reservationAt).toBe("Elige una fecha y hora futuras.");
    expect(validate(filled({ when: { day: "2026-11-03", time: "10:00" } })).reservationAt).toBe("Elige una fecha y hora futuras.");
    expect(validate(filled({ when: { day: "2026-11-03", time: "10:05" } })).reservationAt).toBeUndefined();
    expect(validate(filled({ when: { day: "2026-02-30", time: "10:00" } })).reservationAt).toBe("La fecha no es válida.");
  });

  it("en la edición no revalida una fecha guardada que no cambió, aunque ya haya pasado", () => {
    const past = { day: "2026-01-09", time: "20:00" };
    expect(validateRequestForm(filled({ when: past }), { timeZone: TZ, now: NOW, initialWhen: past })).toEqual({});
    expect(
      validateRequestForm(filled({ when: { day: "2026-01-10", time: "20:00" } }), { timeZone: TZ, now: NOW, initialWhen: past }).reservationAt,
    ).toBe("Elige una fecha y hora futuras.");
  });

  it("personas: entero mayor que 0", () => {
    for (const people of ["0", "2.5", "abc", "-1", "1e3", "2147483648"]) {
      expect(validate(filled({ people })).numberOfPeople).toBe("Escribe un número entero mayor que 0.");
    }
    expect(validate(filled({ people: " 4 " }))).toEqual({});
  });

  it("precio con el formato del backend (MONEY_PATTERN)", () => {
    for (const price of ["150", "150.5", "0", "99999999.99"]) expect(validate(filled({ price })).quotedPrice).toBeUndefined();
    for (const price of ["1,5", "0150", "1e2", "-1", "1.234", "100000000"]) {
      expect(validate(filled({ price })).quotedPrice).toMatch(/^Escribe un importe/);
    }
  });
});

describe("POST /reservation-requests", () => {
  it("solo cliente y canal si no hay más datos; la moneda nunca va sin precio", () => {
    expect(buildCreateRequestBody(filled({ currency: "USD", comments: "   " }), TZ)).toEqual({
      customerId: summary.id,
      sourceChannel: "FACEBOOK",
    });
  });

  it("convierte la fecha de Lima a un instante y envía números y textos con su tipo", () => {
    const body = buildCreateRequestBody(
      filled({
        sourceChannel: "PHONE",
        commercialItemId: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
        when: { day: "2026-11-07", time: "20:00" },
        people: "4",
        price: "150.00",
        comments: " Consulta por una reserva familiar ",
        specialRequirements: "Una silla para bebé",
      }),
      TZ,
    );
    expect(body).toEqual({
      customerId: summary.id,
      sourceChannel: "PHONE",
      commercialItemId: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
      reservationAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/),
      numberOfPeople: 4,
      quotedPrice: "150.00",
      comments: "Consulta por una reserva familiar",
      specialRequirements: "Una silla para bebé",
    });
    expect(new Date(body.reservationAt!).toISOString()).toBe("2026-11-08T01:00:00.000Z");
    // Sin moneda elegida, el backend usa la del restaurante.
    expect(body).not.toHaveProperty("currency");
    expect(buildCreateRequestBody(filled({ price: "80", currency: "USD" }), TZ)).toMatchObject({ quotedPrice: "80", currency: "USD" });
  });
});

describe("PATCH /reservation-requests/:id", () => {
  const initial = makeRequest();
  const values = (patch: Partial<RequestFormValues>) => ({ ...requestFormValues(initial, TZ), ...patch });

  it("sin cambios no envía nada", () => {
    expect(buildUpdateRequestBody(initial, requestFormValues(initial, TZ), TZ)).toEqual({});
  });

  it("la fecha solo va si cambió; vaciarla envía null", () => {
    expect(buildUpdateRequestBody(initial, values({ people: "5" }), TZ)).toEqual({ numberOfPeople: 5 });
    const moved = buildUpdateRequestBody(initial, values({ when: { day: "2026-11-07", time: "21:30" } }), TZ);
    expect(Object.keys(moved)).toEqual(["reservationAt"]);
    expect(new Date(moved.reservationAt!).toISOString()).toBe("2026-11-08T02:30:00.000Z");
    expect(buildUpdateRequestBody(initial, values({ when: { day: "", time: "" } }), TZ)).toEqual({ reservationAt: null });
  });

  it("null borra personas, servicio y textos", () => {
    expect(buildUpdateRequestBody(initial, values({ people: "", commercialItemId: null, comments: "  " }), TZ)).toEqual({
      numberOfPeople: null,
      commercialItemId: null,
      comments: null,
    });
    expect(buildUpdateRequestBody(initial, values({ specialRequirements: "Mesa en terraza" }), TZ)).toEqual({
      specialRequirements: "Mesa en terraza",
    });
  });

  it("precio y moneda quedan coherentes", () => {
    // El mismo importe escrito de otra forma no es un cambio.
    expect(buildUpdateRequestBody(initial, values({ price: "150" }), TZ)).toEqual({});
    expect(buildUpdateRequestBody(initial, values({ price: "180" }), TZ)).toEqual({ quotedPrice: "180" });
    // Borrar el precio borra también la moneda: no se envía currency (sería 400).
    expect(buildUpdateRequestBody(initial, values({ price: "", currency: "USD" }), TZ)).toEqual({ quotedPrice: null });
    // Solo la moneda: válido porque ya hay precio.
    expect(buildUpdateRequestBody(initial, values({ currency: "USD" }), TZ)).toEqual({ currency: "USD" });
    // Precio nuevo sin moneda elegida: el backend usa la del restaurante.
    const noPrice = makeRequest({ quotedPrice: null, currency: null });
    expect(buildUpdateRequestBody(noPrice, { ...requestFormValues(noPrice, TZ), price: "80" }, TZ)).toEqual({ quotedPrice: "80" });
  });

  it("cambia el cliente y el canal (no admiten null)", () => {
    const other = { ...summary, id: "7c2e9a41-3d8b-4f16-a2c9-5e1b7d4f0a83" };
    expect(buildUpdateRequestBody(initial, values({ customer: other, sourceChannel: "WHATSAPP" }), TZ)).toEqual({
      customerId: other.id,
      sourceChannel: "WHATSAPP",
    });
    expect(buildUpdateRequestBody(initial, values({ customer: null, sourceChannel: "" }), TZ)).toEqual({});
  });
});

describe("errores del guardado", () => {
  it("lleva los mensajes de negocio a su campo", () => {
    expect(requestSaveErrors(new ApiError(400, ["La fecha de reserva debe ser válida y futura"]), true).fields).toEqual({
      reservationAt: "La fecha de reserva debe ser válida y futura.",
    });
    expect(requestSaveErrors(new ApiError(400, ["El elemento comercial debe estar activo y aprobado"]), true).fields).toEqual({
      commercialItemId: "El elemento comercial debe estar activo y aprobado.",
    });
    expect(requestSaveErrors(new ApiError(400, ["El precio y la moneda deben estar presentes juntos"]), false).fields).toEqual({
      quotedPrice: "El precio y la moneda deben estar presentes juntos.",
    });
    expect(requestSaveErrors(new ApiError(404, ["Cliente no encontrado"]), true).fields).toEqual({ customerId: "Cliente no encontrado." });
  });

  it("los 400 de validación van por campo, ya en español", () => {
    const messages = ["numberOfPeople must be an integer number", "quotedPrice must be a string"];
    const found = requestSaveErrors(new ApiError(400, messages, undefined, { statusCode: 400, message: messages }), true);
    expect(found.fields).toEqual({ numberOfPeople: "Escribe un número entero.", quotedPrice: "Revisa este campo." });
    expect(found.form).toBeNull();
  });

  it("sin configuración del restaurante, enlaza a Ajustes", () => {
    const found = requestSaveErrors(new ApiError(409, ["Configura el restaurante antes de crear solicitudes o reservas"]), true);
    expect(found).toMatchObject({ needsSetup: true, form: "Configura el restaurante antes de crear solicitudes o reservas." });
  });

  it("un alta que falla por conexión pudo completarse: pide revisar la lista", () => {
    const timeout = new ApiError(504, ["El servidor del CRM tardó demasiado en responder."], "BACKEND_UNAVAILABLE");
    expect(requestSaveErrors(timeout, true)).toMatchObject({
      refresh: true,
      form: "No se pudo confirmar si la solicitud se creó. Revisa la lista antes de volver a intentarlo.",
    });
    expect(requestSaveErrors(timeout, false).form).toBe("No se pudo conectar con el servidor. Inténtalo de nuevo.");
  });

  it("un 409 de estado o de concurrencia relee la lista", () => {
    expect(requestSaveErrors(new ApiError(409, ["La solicitud no admite modificaciones en su estado actual"]), false)).toMatchObject({
      refresh: true,
      form: "La solicitud no admite modificaciones en su estado actual.",
    });
    expect(requestSaveErrors(new ApiError(409, ["Conflicto concurrente; vuelve a intentarlo"]), false).refresh).toBe(true);
  });
});
