import { describe, expect, it } from "vitest";
import type { PutRestaurantConfigRequest, RestaurantScheduleInput } from "@/lib/api/types";
import { makeConfig } from "./config-fixtures";
import { closedWeek, normalizeCoordinate, replaceSchedules, scheduleToInput, toPutRequest } from "./config-request";

/** Las 18 propiedades que declara el DTO del PUT (cualquier otra es 400). */
const PUT_KEYS: Array<keyof PutRestaurantConfigRequest> = [
  "address",
  "approvalResponsibleId",
  "businessName",
  "cancellationPolicy",
  "currency",
  "description",
  "email",
  "languages",
  "latitude",
  "logoUrl",
  "longitude",
  "ownerWhatsappNumber",
  "reservationPolicy",
  "responseTimeoutMinutes",
  "schedules",
  "timeZone",
  "website",
  "whatsappNumber",
];

describe("toPutRequest", () => {
  it("reenvía siempre el responsable (omitirlo lo borraría) y el WhatsApp del propietario vigentes", () => {
    expect(toPutRequest(makeConfig())).toMatchObject({ approvalResponsibleId: "6f1c2a52-8a1e-4c55-9d0b-2b8f0e7d4a11", ownerWhatsappNumber: "+51912345678" });
    expect(toPutRequest(makeConfig({ ownerWhatsappNumber: null }))).toHaveProperty("ownerWhatsappNumber", null);
  });

  it("envía exactamente las propiedades del PUT: sin id, createdAt, updatedAt ni approvalResponsible", () => {
    const request = toPutRequest(makeConfig());
    expect(Object.keys(request).sort()).toEqual(PUT_KEYS);
    const json = JSON.parse(JSON.stringify(request)) as Record<string, unknown>;
    for (const key of ["id", "createdAt", "updatedAt", "approvalResponsible", "scope"]) expect(json).not.toHaveProperty(key);
  });

  it("conserva los valores de la configuración, incluidos los nulos", () => {
    const config = makeConfig({ logoUrl: null, description: null, website: null, approvalResponsibleId: null, approvalResponsible: null });
    expect(toPutRequest(config)).toMatchObject({
      businessName: "Sabor Mágico Grill",
      logoUrl: null,
      description: null,
      address: "Av. José Larco 1234, Miraflores, Lima",
      whatsappNumber: "+51987000192",
      email: "reservas@sabormagico.pe",
      website: null,
      currency: "PEN",
      timeZone: "America/Lima",
      responseTimeoutMinutes: 30,
      approvalResponsibleId: null,
      languages: ["ES", "EN"],
    });
  });

  it("convierte los horarios a la unión de entrada: abierto con horas, cerrado con null", () => {
    const { schedules } = toPutRequest(makeConfig());
    expect(schedules).toHaveLength(7);
    expect(schedules[0]).toEqual({ dayOfWeek: "MONDAY", isOpen: false, openTime: null, closeTime: null });
    expect(schedules[1]).toEqual({ dayOfWeek: "TUESDAY", isOpen: true, openTime: "12:00", closeTime: "22:00" });
    expect(schedules[4]).toEqual({ dayOfWeek: "FRIDAY", isOpen: true, openTime: "12:00", closeTime: "23:59" });
  });

  it("ordena la semana de lunes a domingo, completa un día faltante como cerrado y cierra un día abierto sin horas", () => {
    const base = makeConfig();
    const config = makeConfig({
      schedules: [
        { dayOfWeek: "SUNDAY", isOpen: true, openTime: "12:00", closeTime: "18:00" },
        { dayOfWeek: "TUESDAY", isOpen: true, openTime: null, closeTime: null },
        ...base.schedules.filter((s) => !["SUNDAY", "TUESDAY", "WEDNESDAY"].includes(s.dayOfWeek)),
      ],
    });
    const { schedules } = toPutRequest(config);
    expect(schedules.map((s) => s.dayOfWeek)).toEqual(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
    expect(schedules[1]).toEqual({ dayOfWeek: "TUESDAY", isOpen: false, openTime: null, closeTime: null });
    expect(schedules[2]).toEqual({ dayOfWeek: "WEDNESDAY", isOpen: false, openTime: null, closeTime: null });
    expect(schedules[6]).toEqual({ dayOfWeek: "SUNDAY", isOpen: true, openTime: "12:00", closeTime: "18:00" });
  });

  it("envía latitud y longitud juntas o ninguna, redondeadas a 7 decimales", () => {
    expect(toPutRequest(makeConfig({ latitude: -12.0463740, longitude: -77.042793 }))).toMatchObject({
      latitude: -12.046374,
      longitude: -77.042793,
    });
    expect(toPutRequest(makeConfig({ latitude: -12.1, longitude: null }))).toMatchObject({ latitude: null, longitude: null });
    expect(toPutRequest(makeConfig({ latitude: 0.1 + 0.2, longitude: 1e-7 }))).toMatchObject({ latitude: 0.3, longitude: 0 });
  });

  it("no comparte arreglos con la configuración ni la modifica", () => {
    const config = makeConfig();
    const snapshot = structuredClone(config);
    const request = toPutRequest(config);
    request.languages.push("PT");
    request.schedules.pop();
    expect(config).toEqual(snapshot);
  });
});

describe("normalizeCoordinate", () => {
  it("redondea a 7 decimales y lleva a 0 lo que JS imprimiría en notación exponencial", () => {
    expect(normalizeCoordinate(-12.04637412345)).toBe(-12.0463741);
    expect(normalizeCoordinate(0.00000049)).toBe(0);
    expect(normalizeCoordinate(-0.0000001)).toBe(0);
    expect(normalizeCoordinate(0.000001)).toBe(0.000001);
  });
});

describe("horarios de entrada", () => {
  it("scheduleToInput trata un día ausente como cerrado", () => {
    expect(scheduleToInput("MONDAY", undefined)).toEqual({ dayOfWeek: "MONDAY", isOpen: false, openTime: null, closeTime: null });
  });

  it("closedWeek: los 7 días cerrados, de lunes a domingo", () => {
    const week = closedWeek();
    expect(week.map((d) => d.dayOfWeek)).toEqual(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
    expect(week.every((d) => !d.isOpen && d.openTime === null && d.closeTime === null)).toBe(true);
  });

  it("replaceSchedules cambia solo los días indicados", () => {
    const request = toPutRequest(makeConfig());
    const update: RestaurantScheduleInput = { dayOfWeek: "MONDAY", isOpen: true, openTime: "09:00", closeTime: "17:00" };
    const result = replaceSchedules(request, [update]);
    expect(result.schedules[0]).toEqual(update);
    expect(result.schedules.slice(1)).toEqual(request.schedules.slice(1));
    expect(request.schedules[0]?.isOpen).toBe(false);
  });
});
