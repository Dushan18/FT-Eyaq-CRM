import { describe, expect, it } from "vitest";
import type { RestaurantScheduleInput } from "@/lib/api/types";
import { makeConfig } from "./config-fixtures";
import { toPutRequest } from "./config-request";
import {
  SCHEDULE_MESSAGES,
  backendMessageTabs,
  compactPhone,
  isValidTimeZone,
  issuesToErrors,
  urlProblem,
  validateConfig,
  validateFields,
  withoutErrors,
  type ConfigInput,
} from "./config-schema";

/** Cuerpo válido (el de la configuración de prueba) con cambios. */
function input(overrides: Partial<ConfigInput> = {}): ConfigInput {
  return { ...toPutRequest(makeConfig()), ...overrides };
}

function withDay(index: number, day: Partial<RestaurantScheduleInput> | Record<string, unknown>): ConfigInput["schedules"] {
  const schedules = toPutRequest(makeConfig()).schedules.map((d) => ({ ...d })) as ConfigInput["schedules"];
  schedules[index] = { ...schedules[index]!, ...day } as ConfigInput["schedules"][number];
  return schedules;
}

function errorsOf(value: ConfigInput) {
  const result = validateConfig(value);
  if (result.success) throw new Error("Se esperaba un error de validación");
  return result.errors;
}

describe("validateConfig: casos válidos", () => {
  it("acepta la configuración vigente tal como la arma toPutRequest", () => {
    const result = validateConfig(input());
    expect(result).toEqual({ success: true, data: toPutRequest(makeConfig()) });
  });

  it("quita los espacios del WhatsApp antes de validar el formato E.164", () => {
    const result = validateConfig(input({ whatsappNumber: " +51 987 000 192 " }));
    expect(result.success && result.data.whatsappNumber).toBe("+51987000192");
  });

  it("convierte la cadena vacía (o solo espacios) en null en los opcionales", () => {
    const result = validateConfig(input({ logoUrl: "", website: "   ", description: "  " }));
    expect(result.success && result.data).toMatchObject({ logoUrl: null, website: null, description: null });
  });

  it("recorta textos y pasa el correo a minúsculas, como el backend", () => {
    const result = validateConfig(input({ businessName: "  Sabor Mágico  ", email: " Reservas@SaborMagico.PE " }));
    expect(result.success && result.data).toMatchObject({ businessName: "Sabor Mágico", email: "reservas@sabormagico.pe" });
  });

  it("ordena los idiomas ES, EN, PT y acepta los tres", () => {
    const result = validateConfig(input({ languages: ["PT", "ES", "EN"] }));
    expect(result.success && result.data.languages).toEqual(["ES", "EN", "PT"]);
  });

  it("convierte el tiempo de respuesta escrito en el campo a número entero", () => {
    const result = validateConfig(input({ responseTimeoutMinutes: "45" }));
    expect(result.success && result.data.responseTimeoutMinutes).toBe(45);
    expect(validateConfig(input({ responseTimeoutMinutes: "1440" })).success).toBe(true);
    expect(validateConfig(input({ responseTimeoutMinutes: 1 })).success).toBe(true);
  });

  it("acepta el cierre a las 23:59 y quita las horas de un día cerrado", () => {
    const schedules = withDay(1, { isOpen: true, openTime: "00:00", closeTime: "23:59" });
    schedules[0] = { dayOfWeek: "MONDAY", isOpen: false, openTime: "12:00", closeTime: "18:00" };
    const result = validateConfig(input({ schedules }));
    expect(result.success && result.data.schedules[0]).toEqual({ dayOfWeek: "MONDAY", isOpen: false, openTime: null, closeTime: null });
    expect(result.success && result.data.schedules[1]).toEqual({ dayOfWeek: "TUESDAY", isOpen: true, openTime: "00:00", closeTime: "23:59" });
  });

  it("deja el responsable en null si se elige «Sin responsable»", () => {
    const result = validateConfig(input({ approvalResponsibleId: "" }));
    expect(result.success && result.data.approvalResponsibleId).toBeNull();
  });

  it("acepta URLs con IP, puerto, ruta y consulta", () => {
    expect(validateConfig(input({ logoUrl: "http://192.168.1.10:8080/logo.png?v=2" })).success).toBe(true);
    expect(validateConfig(input({ website: "https://www.sabormagico.com.pe/reservas" })).success).toBe(true);
  });
});

describe("validateConfig: casos inválidos", () => {
  it("rechaza un WhatsApp que no es E.164 aun sin espacios", () => {
    expect(errorsOf(input({ whatsappNumber: "987000192" }))).toHaveProperty("whatsappNumber");
    expect(errorsOf(input({ whatsappNumber: "+0987000192" }))).toHaveProperty("whatsappNumber");
    expect(errorsOf(input({ whatsappNumber: "+51 98 70" }))).toHaveProperty("whatsappNumber");
    expect(errorsOf(input({ whatsappNumber: "" })).whatsappNumber).toBe("Ingresa el WhatsApp del negocio.");
  });

  it("rechaza el cierre a las 00:00 (el backend no admite cruzar la medianoche)", () => {
    const errors = errorsOf(input({ schedules: withDay(4, { openTime: "18:00", closeTime: "00:00" }) }));
    expect(errors).toEqual({ "schedules.4.closeTime": SCHEDULE_MESSAGES.closeMidnight });
  });

  it("rechaza una apertura igual o posterior al cierre", () => {
    expect(errorsOf(input({ schedules: withDay(1, { openTime: "22:00", closeTime: "12:00" }) }))).toEqual({
      "schedules.1.closeTime": SCHEDULE_MESSAGES.order,
    });
    expect(errorsOf(input({ schedules: withDay(1, { openTime: "12:00", closeTime: "12:00" }) }))).toEqual({
      "schedules.1.closeTime": SCHEDULE_MESSAGES.order,
    });
  });

  it("pide horas válidas en un día abierto", () => {
    expect(errorsOf(input({ schedules: withDay(0, { isOpen: true, openTime: "", closeTime: null }) }))).toEqual({
      "schedules.0.openTime": SCHEDULE_MESSAGES.openRequired,
      "schedules.0.closeTime": SCHEDULE_MESSAGES.closeRequired,
    });
    expect(errorsOf(input({ schedules: withDay(2, { openTime: "24:00" }) }))).toEqual({
      "schedules.2.openTime": SCHEDULE_MESSAGES.format,
    });
  });

  it("exige los 7 días, sin repetir, y sin propiedades extra por día", () => {
    const six = toPutRequest(makeConfig()).schedules.slice(0, 6);
    expect(errorsOf(input({ schedules: six }))).toHaveProperty("schedules", SCHEDULE_MESSAGES.week);
    expect(errorsOf(input({ schedules: withDay(6, { dayOfWeek: "MONDAY" }) }))).toHaveProperty("schedules", SCHEDULE_MESSAGES.week);
    expect(errorsOf(input({ schedules: withDay(3, { label: "Jueves" }) }))).toHaveProperty("schedules.3");
  });

  it("rechaza URLs de localhost, sin protocolo, ftp, con guion bajo o demasiado largas", () => {
    expect(errorsOf(input({ logoUrl: "http://localhost:3000/logo.png" })).logoUrl).toMatch(/localhost no es válido/);
    expect(errorsOf(input({ website: "sabormagico.pe" })).website).toMatch(/https:\/\//);
    expect(errorsOf(input({ website: "ftp://sabormagico.pe" }))).toHaveProperty("website");
    expect(errorsOf(input({ website: "https://sabor_magico.pe" }))).toHaveProperty("website");
    expect(errorsOf(input({ website: `https://sabormagico.pe/${"a".repeat(2048)}` })).website).toBe("Máximo 2048 caracteres.");
  });

  it("exige entre uno y tres idiomas, sin repetir", () => {
    expect(errorsOf(input({ languages: [] })).languages).toBe("Elige al menos un idioma.");
    expect(errorsOf(input({ languages: ["ES", "ES"] }))).toHaveProperty("languages");
    expect(errorsOf(input({ languages: ["ES", "FR" as "EN"] }))).toHaveProperty("languages.1");
  });

  it("valida nombre, dirección, descripción, políticas y correo", () => {
    expect(errorsOf(input({ businessName: "   " })).businessName).toBe("Ingresa el nombre comercial.");
    expect(errorsOf(input({ businessName: "x".repeat(151) })).businessName).toBe("Máximo 150 caracteres.");
    expect(errorsOf(input({ address: "" })).address).toBe("Ingresa la dirección.");
    expect(errorsOf(input({ description: "x".repeat(2001) })).description).toBe("Máximo 2000 caracteres.");
    expect(errorsOf(input({ reservationPolicy: " " })).reservationPolicy).toBe("Escribe la política de reserva.");
    expect(errorsOf(input({ cancellationPolicy: "x".repeat(5001) })).cancellationPolicy).toBe("Máximo 5000 caracteres.");
    expect(errorsOf(input({ email: "reservas@sabormagico" }))).toHaveProperty("email");
  });

  it("valida moneda, zona horaria, tiempo de respuesta y responsable", () => {
    expect(errorsOf(input({ currency: "COP" as "PEN" }))).toHaveProperty("currency");
    expect(errorsOf(input({ timeZone: "Marte/Olympus" })).timeZone).toBe("Zona horaria no válida.");
    expect(errorsOf(input({ timeZone: "" })).timeZone).toBe("Elige la zona horaria.");
    for (const value of [0, 1441, "1.5", "", "abc"]) {
      expect(errorsOf(input({ responseTimeoutMinutes: value })).responseTimeoutMinutes).toBe("Ingresa minutos enteros entre 1 y 1440.");
    }
    expect(errorsOf(input({ approvalResponsibleId: "no-es-uuid" }))).toHaveProperty("approvalResponsibleId");
  });

  it("rechaza propiedades no declaradas, como el backend", () => {
    const { id, ...rest } = { ...input(), id: "5ded68d7-41b0-4a3c-aef5-08de01b4b6a3" };
    expect(validateConfig(rest).success).toBe(true);
    expect(validateConfig({ ...rest, id } as ConfigInput).success).toBe(false);
  });
});

describe("validateFields (solo lo que cambió en una pestaña)", () => {
  it("valida únicamente las propiedades presentes", () => {
    expect(validateFields({ description: "" })).toEqual({ success: true, data: { description: null } });
    expect(validateFields({ reservationPolicy: "Nueva política" })).toEqual({ success: true, data: { reservationPolicy: "Nueva política" } });
    expect(validateFields({ businessName: "", website: "http://localhost" })).toMatchObject({
      success: false,
      errors: { businessName: "Ingresa el nombre comercial.", website: expect.stringMatching(/localhost/) },
    });
  });
});

describe("helpers de errores", () => {
  it("issuesToErrors conserva el primer mensaje de cada ruta", () => {
    expect(
      issuesToErrors([
        { path: ["timeZone"], message: "primero" },
        { path: ["timeZone"], message: "segundo" },
        { path: ["schedules", 2, "openTime"], message: "hora" },
        { path: [], message: "general" },
      ]),
    ).toEqual({ timeZone: "primero", "schedules.2.openTime": "hora", _: "general" });
  });

  it("withoutErrors quita el campo y sus subrutas, y devuelve el mismo objeto si no hay nada que quitar", () => {
    const errors = { "schedules.1.openTime": "a", "schedules.1.closeTime": "b", "schedules.10.openTime": "c", email: "d" };
    expect(withoutErrors(errors, "schedules.1")).toEqual({ "schedules.10.openTime": "c", email: "d" });
    expect(withoutErrors(errors, "email", "schedules.10")).toEqual({ "schedules.1.openTime": "a", "schedules.1.closeTime": "b" });
    expect(withoutErrors(errors, "website")).toBe(errors);
  });

  it("backendMessageTabs señala la pestaña de cada propiedad que rechazó el backend", () => {
    expect(backendMessageTabs(["El responsable de aprobación debe estar activo"])).toEqual(["samanta"]);
    expect(backendMessageTabs(["schedules.4.openTime debe tener el formato HH:mm", "logoUrl must be a URL address"])).toEqual([
      "empresa",
      "horarios",
    ]);
    expect(backendMessageTabs(["All languages's elements must be unique", "reservationPolicy should not be empty"])).toEqual([
      "empresa",
      "politicas",
    ]);
    expect(backendMessageTabs(["Los horarios son incoherentes o cruzan la medianoche"])).toEqual(["horarios"]);
    expect(backendMessageTabs(["La configuración entró en conflicto con otro cambio; inténtalo nuevamente"])).toEqual([]);
  });
});

describe("reglas sueltas", () => {
  it("compactPhone quita separadores visuales", () => {
    expect(compactPhone("+51 (987) 000-192")).toBe("+51987000192");
    expect(compactPhone("+51.987.000.192")).toBe("+51987000192");
  });

  it("isValidTimeZone usa Intl, como el backend", () => {
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/Atlantida")).toBe(false);
  });

  it("urlProblem explica por qué el backend rechazaría la URL", () => {
    expect(urlProblem("https://sabormagico.pe")).toBeNull();
    expect(urlProblem("https://xn--sabormgico-r7a.pe")).toBeNull();
    expect(urlProblem("https://[2001:db8::1]/logo.png")).toBeNull();
    expect(urlProblem("https://sabor magico.pe")).toBe("La URL no puede tener espacios.");
    expect(urlProblem("https://intranet")).toMatch(/dominio público/);
    expect(urlProblem("data:image/png;base64,AAAA")).toMatch(/https:\/\//);
  });
});
