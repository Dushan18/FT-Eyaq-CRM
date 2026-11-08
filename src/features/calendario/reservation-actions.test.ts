import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { qk } from "@/lib/api/query-keys";
import type { Reservation, ReservationDetail, ReservationNote, ReservationStatus, User } from "@/lib/api/types";
import {
  CONFIG_MISSING_MESSAGE,
  CREATE_FIELDS,
  EDIT_FIELDS,
  FORM_MESSAGES,
  assignBody,
  assigneeAction,
  canManageReservation,
  editFormFrom,
  eligibleAssignees,
  isConfigMissing,
  parsePeople,
  reservationFormErrors,
  statusActions,
  updateBody,
  validateCreate,
  validateNote,
  validateReschedule,
  waitsForArrival,
  type Viewer,
} from "./reservation-actions";
import { storeCreatedReservation, storeReservation, storeReservationNote } from "./reservation-cache";

const LIMA = "America/Lima";
/** Lunes 2 nov 2026, 12:00 en Lima. */
const NOW = Date.parse("2026-11-02T17:00:00.000Z");
const FUTURE = "2026-11-08T01:00:00.000Z"; // sábado 7, 20:00 en Lima
const PAST = "2026-11-01T01:00:00.000Z";

const ME = "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35";
const OTHER = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const targets = (status: ReservationStatus, reservationAt = FUTURE, canWrite = true) =>
  statusActions({ status, reservationAt }, canWrite, NOW).map((a) => [a.target, a.enabled]);

describe("statusActions (botones de estado)", () => {
  it("ofrece solo las transiciones permitidas, en su orden", () => {
    expect(targets("CONFIRMED")).toEqual([
      ["UPCOMING", true],
      ["IN_SERVICE", false],
      ["CANCELLED", true],
      ["NO_SHOW", false],
    ]);
    expect(targets("RESCHEDULED").map(([t]) => t)).toEqual(["CONFIRMED", "UPCOMING", "IN_SERVICE", "CANCELLED", "NO_SHOW"]);
    expect(targets("IN_SERVICE")).toEqual([["COMPLETED", true]]);
    for (const status of ["COMPLETED", "CANCELLED", "NO_SHOW"] satisfies ReservationStatus[]) expect(targets(status)).toEqual([]);
  });

  it("habilita Iniciar servicio y No asistió solo cuando llegó la hora", () => {
    expect(targets("UPCOMING", PAST)).toEqual([
      ["IN_SERVICE", true],
      ["CANCELLED", true],
      ["NO_SHOW", true],
    ]);
    expect(waitsForArrival(statusActions({ status: "UPCOMING", reservationAt: FUTURE }, true, NOW))).toBe(true);
    expect(waitsForArrival(statusActions({ status: "UPCOMING", reservationAt: PAST }, true, NOW))).toBe(false);
    // Justo a la hora ya se permite (reservationAt <= ahora).
    expect(targets("CONFIRMED", new Date(NOW).toISOString())).toContainEqual(["IN_SERVICE", true]);
  });

  it("pide confirmación para preparada y los estados finales, no para confirmar ni iniciar el servicio", () => {
    const byTarget = new Map(statusActions({ status: "RESCHEDULED", reservationAt: PAST }, true, NOW).map((a) => [a.target, a]));
    expect(byTarget.get("CONFIRMED")?.confirm).toBeNull();
    expect(byTarget.get("IN_SERVICE")?.confirm).toBeNull();
    expect(byTarget.get("UPCOMING")?.confirm).toMatch(/salvo que la reprogrames/);
    expect(byTarget.get("UPCOMING")?.confirm).not.toMatch(/No se puede deshacer/);
    expect(byTarget.get("CANCELLED")?.confirm).toMatch(/estado final/);
    expect(byTarget.get("NO_SHOW")?.confirm).toMatch(/estado final/);
    expect(statusActions({ status: "IN_SERVICE", reservationAt: PAST }, true, NOW)[0]?.confirm).toMatch(/estado final/);
  });

  it("no muestra botones a roles de solo lectura", () => {
    expect(targets("CONFIRMED", FUTURE, false)).toEqual([]);
  });
});

describe("canManageReservation (Editar y Reprogramar)", () => {
  it("solo en Confirmada, Preparada y Reprogramada, y con permiso de edición", () => {
    for (const status of ["CONFIRMED", "UPCOMING", "RESCHEDULED"] satisfies ReservationStatus[]) {
      expect(canManageReservation(status, true)).toBe(true);
      expect(canManageReservation(status, false)).toBe(false);
    }
    for (const status of ["IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"] satisfies ReservationStatus[]) {
      expect(canManageReservation(status, true)).toBe(false);
    }
  });
});

describe("assigneeAction (responsable)", () => {
  const admin: Viewer = { roles: ["ADMIN"], userId: ME, canEdit: true };
  const operator: Viewer = { roles: ["OPERATOR"], userId: ME, canEdit: true };
  const owner: Viewer = { roles: ["OWNER"], userId: ME, canEdit: false };
  const at = (status: ReservationStatus, assignedUserId: string | null) => ({ status, assignedUserId });

  it("ADMIN elige con el selector (también si además es OPERATOR)", () => {
    expect(assigneeAction(at("CONFIRMED", OTHER), admin)).toBe("select");
    expect(assigneeAction(at("IN_SERVICE", null), { ...admin, roles: ["OPERATOR", "ADMIN"] })).toBe("select");
  });

  it("OPERATOR toma una libre, libera la suya y no toca la de otra persona", () => {
    expect(assigneeAction(at("CONFIRMED", null), operator)).toBe("take");
    expect(assigneeAction(at("UPCOMING", ME), operator)).toBe("release");
    expect(assigneeAction(at("RESCHEDULED", OTHER), operator)).toBe("none");
    expect(assigneeAction(at("CONFIRMED", null), { ...operator, userId: null })).toBe("none");
  });

  it("nadie lo cambia en estados finales ni sin permiso de edición", () => {
    for (const status of ["COMPLETED", "CANCELLED", "NO_SHOW"] satisfies ReservationStatus[]) {
      expect(assigneeAction(at(status, null), admin)).toBe("none");
      expect(assigneeAction(at(status, ME), operator)).toBe("none");
    }
    expect(assigneeAction(at("CONFIRMED", null), owner)).toBe("none");
  });

  it("los candidatos son los activos con ADMIN u OPERATOR, por nombre", () => {
    const user = (id: string, firstName: string, roles: User["roles"], isActive = true): User => ({
      id,
      firstName,
      lastName: "Prueba",
      email: `${id}@example.com`,
      isActive,
      lastLoginAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      roles,
    });
    const list = eligibleAssignees([
      user("1", "Zoila", ["OPERATOR"]),
      user("2", "Ana", ["ADMIN", "OWNER"]),
      user("3", "Beto", ["OWNER"]),
      user("4", "Ciro", ["OPERATOR"], false),
      user("5", "Érika", ["SUPPORT"]),
      user("6", "Elena", ["OPERATOR"]),
    ]);
    expect(list.map((u) => u.firstName)).toEqual(["Ana", "Elena", "Zoila"]);
  });

  it("«Sin responsable» se envía como null", () => {
    expect(assignBody("")).toStrictEqual({ assignedUserId: null });
    expect(assignBody(OTHER)).toStrictEqual({ assignedUserId: OTHER });
  });
});

describe("validateCreate (POST /reservations)", () => {
  const base = {
    customerId: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    when: { day: "2026-11-07", time: "20:00" },
    people: "4",
    commercialItemId: null,
    notes: "  ",
  };

  it("arma el body con la hora del restaurante y omite los opcionales vacíos", () => {
    const result = validateCreate(base, LIMA, NOW);
    expect(result.errors).toBeNull();
    expect(result.body).toStrictEqual({
      customerId: base.customerId,
      reservationAt: "2026-11-07T20:00:00.000-05:00",
      numberOfPeople: 4,
    });
  });

  it("incluye servicio y notas recortadas cuando hay", () => {
    const item = "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57";
    const result = validateCreate({ ...base, commercialItemId: item, notes: "  Ventana  " }, LIMA, NOW);
    expect(result.body).toMatchObject({ commercialItemId: item, notes: "Ventana" });
  });

  it("marca cliente, fecha pasada y personas inválidas", () => {
    const result = validateCreate({ ...base, customerId: null, when: { day: "2026-11-01", time: "10:00" }, people: "2.5" }, LIMA, NOW);
    expect(result.body).toBeNull();
    expect(result.errors).toEqual({
      customerId: FORM_MESSAGES.customer,
      reservationAt: FORM_MESSAGES.datePast,
      numberOfPeople: FORM_MESSAGES.people,
    });
    expect(validateCreate({ ...base, when: { day: "", time: "" } }, LIMA, NOW).errors?.reservationAt).toBe(FORM_MESSAGES.dateMissing);
    expect(validateCreate({ ...base, when: { day: "2026-02-30", time: "10:00" } }, LIMA, NOW).errors?.reservationAt).toBe(
      FORM_MESSAGES.dateInvalid,
    );
  });

  it("personas: entero de 1 a 2147483647", () => {
    expect(parsePeople("1")).toBe(1);
    expect(parsePeople(" 12 ")).toBe(12);
    expect(parsePeople("2147483647")).toBe(2147483647);
    for (const value of ["0", "-1", "2.5", "1e3", "", "abc", "2147483648"]) expect(parsePeople(value)).toBeNull();
  });
});

describe("updateBody (PATCH /reservations/:id: solo lo que cambió)", () => {
  const original = { numberOfPeople: 4, commercialItemId: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57", notes: "Cumpleaños" };

  it("sin cambios no hay campos (el botón Guardar queda deshabilitado)", () => {
    expect(updateBody(original, editFormFrom(original))).toEqual({ body: {}, errors: {} });
    expect(updateBody(original, { ...editFormFrom(original), notes: "  Cumpleaños " }).body).toEqual({});
  });

  it("envía personas y servicio cambiados, y null para quitar el servicio o borrar las notas", () => {
    expect(updateBody(original, { people: "6", commercialItemId: original.commercialItemId, notes: "Se amplió el grupo" }).body).toStrictEqual({
      numberOfPeople: 6,
      notes: "Se amplió el grupo",
    });
    expect(updateBody(original, { people: "4", commercialItemId: null, notes: "   " }).body).toStrictEqual({
      commercialItemId: null,
      notes: null,
    });
  });

  it("nunca envía la fecha y marca personas inválidas", () => {
    const result = updateBody(original, { ...editFormFrom(original), people: "0" });
    expect(result.errors).toEqual({ numberOfPeople: FORM_MESSAGES.people });
    expect(result.body).not.toHaveProperty("numberOfPeople");
    expect(result.body).not.toHaveProperty("reservationAt");
  });
});

describe("validateReschedule (PATCH /reservations/:id/reschedule)", () => {
  const current = { reservationAt: FUTURE };

  it("fecha futura distinta de la actual, con motivo opcional", () => {
    expect(validateReschedule(current, { when: { day: "2026-11-08", time: "13:00" }, reason: " Cambio de horario " }, LIMA, NOW).body).toStrictEqual({
      reservationAt: "2026-11-08T13:00:00.000-05:00",
      reason: "Cambio de horario",
    });
    expect(validateReschedule(current, { when: { day: "2026-11-08", time: "13:00" }, reason: "  " }, LIMA, NOW).body).toStrictEqual({
      reservationAt: "2026-11-08T13:00:00.000-05:00",
    });
  });

  it("rechaza la misma fecha y las pasadas", () => {
    expect(validateReschedule(current, { when: { day: "2026-11-07", time: "20:00" }, reason: "" }, LIMA, NOW).errors).toEqual({
      reservationAt: FORM_MESSAGES.dateSame,
    });
    expect(validateReschedule(current, { when: { day: "2026-11-02", time: "11:59" }, reason: "" }, LIMA, NOW).errors).toEqual({
      reservationAt: FORM_MESSAGES.datePast,
    });
  });
});

describe("validateNote", () => {
  it("recorta y exige texto", () => {
    expect(validateNote("  Mesa junto a la ventana ")).toEqual({ content: "Mesa junto a la ventana", error: null });
    expect(validateNote("   ")).toEqual({ content: null, error: FORM_MESSAGES.noteEmpty });
    expect(validateNote("x".repeat(5001)).error).toBe(FORM_MESSAGES.textLong);
  });
});

describe("reservationFormErrors", () => {
  it("lleva al campo los errores de validación del DTO", () => {
    const error = new ApiError(400, ["numberOfPeople must not be less than 1"], undefined, {
      statusCode: 400,
      message: ["numberOfPeople must not be less than 1"],
    });
    expect(reservationFormErrors(error, CREATE_FIELDS)).toEqual({ fields: { numberOfPeople: "El valor mínimo es 1." }, form: null });
  });

  it("lleva al campo los mensajes de negocio que lo señalan", () => {
    const past = new ApiError(400, ["La fecha de reserva debe ser válida y futura"], undefined, { message: "La fecha de reserva debe ser válida y futura" });
    expect(reservationFormErrors(past, CREATE_FIELDS)).toEqual({
      fields: { reservationAt: "La fecha de reserva debe ser válida y futura" },
      form: null,
    });
    const item = new ApiError(400, ["El elemento comercial debe estar activo y aprobado"]);
    expect(reservationFormErrors(item, EDIT_FIELDS).fields).toEqual({ commercialItemId: "El elemento comercial debe estar activo y aprobado" });
    // En un formulario sin ese campo, el mensaje va al formulario.
    expect(reservationFormErrors(new ApiError(404, ["Cliente no encontrado"]), EDIT_FIELDS)).toEqual({ fields: {}, form: "Cliente no encontrado" });
  });

  it("muestra los 409 tal cual y reconoce el de configuración faltante", () => {
    const config = new ApiError(409, [CONFIG_MISSING_MESSAGE]);
    expect(reservationFormErrors(config, CREATE_FIELDS)).toEqual({ fields: {}, form: CONFIG_MISSING_MESSAGE });
    expect(isConfigMissing(config)).toBe(true);
    expect(isConfigMissing(new ApiError(409, ["Conflicto concurrente; vuelve a intentarlo"]))).toBe(false);
  });

  it("tras un error de conexión en un POST no idempotente pide revisar antes de repetir", () => {
    const timeout = new ApiError(504, ["El servidor del CRM tardó demasiado en responder."], "BACKEND_UNAVAILABLE");
    expect(reservationFormErrors(timeout, CREATE_FIELDS, { uncertain: "Revisa el calendario." })).toEqual({ fields: {}, form: "Revisa el calendario." });
  });
});

describe("caché de reservas", () => {
  const reservation: Reservation = {
    assignedUserId: null,
    assignedUser: null,
    id: "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
    code: "R-2026-000015",
    reservationRequestId: null,
    customerId: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    commercialItemId: null,
    reservationAt: FUTURE,
    numberOfPeople: 4,
    status: "CONFIRMED",
    notes: null,
    createdAt: "2026-11-02T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
    customer: { id: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42", firstName: "Carlos", lastName: "Quispe", phone: null, email: null },
    commercialItem: null,
  };
  const note: ReservationNote = {
    id: "a9c3e7b1-5d2f-4a86-8e14-6f0b2d9c3e57",
    reservationId: reservation.id,
    authorUserId: ME,
    content: "Mesa junto a la ventana",
    createdAt: "2026-11-02T11:00:00.000Z",
    author: { id: ME, firstName: "María", lastName: "Huamán" },
  };
  const detail: ReservationDetail = { ...reservation, noteHistory: [note], rescheduleHistory: [] };

  it("mezcla la respuesta del PATCH sin perder los historiales e invalida el calendario y Estadísticas", async () => {
    const client = new QueryClient();
    client.setQueryData(qk.reservation(reservation.id), detail);
    client.setQueryData(qk.reservations({ scope: "calendario" }), { rows: [reservation] });
    client.setQueryData([...qk.statsAll, "semana"], { total: 1 });
    storeReservation(client, { ...reservation, status: "UPCOMING", updatedAt: "2026-11-02T12:00:00.000Z" }, { stats: true });

    expect(client.getQueryData<ReservationDetail>(qk.reservation(reservation.id))).toMatchObject({ status: "UPCOMING", noteHistory: [note] });
    expect(client.getQueryState(qk.reservations({ scope: "calendario" }))?.isInvalidated).toBe(true);
    expect(client.getQueryState([...qk.statsAll, "semana"])?.isInvalidated).toBe(true);
  });

  it("asignar no invalida Estadísticas", () => {
    const client = new QueryClient();
    client.setQueryData([...qk.statsAll, "semana"], { total: 1 });
    storeReservation(client, reservation, { stats: false });
    expect(client.getQueryState([...qk.statsAll, "semana"])?.isInvalidated).toBe(false);
  });

  it("agrega la observación al final de noteHistory, sin repetirla", () => {
    const client = new QueryClient();
    client.setQueryData(qk.reservation(reservation.id), { ...detail, noteHistory: [] });
    storeReservationNote(client, note);
    storeReservationNote(client, note);
    expect(client.getQueryData<ReservationDetail>(qk.reservation(reservation.id))?.noteHistory).toEqual([note]);
  });

  it("la reserva creada queda en caché sin historiales y se invalidan calendario y Estadísticas", () => {
    const client = new QueryClient();
    client.setQueryData([...qk.statsAll, "semana"], { total: 1 });
    storeCreatedReservation(client, reservation);
    expect(client.getQueryData(qk.reservation(reservation.id))).toEqual({ ...reservation, noteHistory: [], rescheduleHistory: [] });
    expect(client.getQueryState([...qk.statsAll, "semana"])?.isInvalidated).toBe(true);
  });
});
