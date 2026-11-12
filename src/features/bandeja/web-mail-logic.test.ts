import { describe, expect, it } from "vitest";
import { webMailBody, webMailSubject } from "./web-mail-logic";

describe("correos de la web", () => {
  it("el asunto usa el código de la web, como el correo del formulario", () => {
    expect(webMailSubject({ externalReference: "SM-20261110-9E49B1", code: "RES-2026-000466" })).toBe("Nueva reserva SM-20261110-9E49B1");
    expect(webMailSubject({ externalReference: null, code: "RES-2026-000466" })).toBe("Solicitud web RES-2026-000466");
  });

  it("separa lo que escribió el cliente de las notas del CRM", () => {
    expect(webMailBody("Hola\nPaís: Perú\nPersonas: 2-3\nCRM: no se le escribió por WhatsApp: faltan la fecha, la hora o las personas.")).toEqual({
      message: ["Hola", "País: Perú", "Personas: 2-3"],
      crmNotes: ["CRM: no se le escribió por WhatsApp: faltan la fecha, la hora o las personas."],
    });
    expect(webMailBody(null)).toEqual({ message: [], crmNotes: [] });
  });
});
