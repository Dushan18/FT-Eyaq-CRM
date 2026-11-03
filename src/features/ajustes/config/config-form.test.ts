import { describe, expect, it } from "vitest";
import { OWNER_2_ID, OWNER_ID, makeConfig, makeUser } from "./config-fixtures";
import {
  TIME_ZONE_OPTIONS,
  approvalCandidates,
  changedKeys,
  emptySetupValues,
  empresaValues,
  horariosValues,
  pickValues,
  responsibleOptions,
  sameDay,
  sameValue,
  samantaValues,
  setupRequestInput,
  timeZoneOptions,
  toggleLanguage,
  weekToInput,
  type DayValues,
  type EmpresaValues,
  type HorariosValues,
} from "./config-form";
import { validateConfig } from "./config-schema";

describe("detección de cambios", () => {
  const base = empresaValues(makeConfig());

  it("sin borrador no hay cambios", () => {
    expect(changedKeys(base, {})).toEqual([]);
  });

  it("detecta solo las propiedades que difieren de la configuración vigente", () => {
    const draft: Partial<EmpresaValues> = { businessName: "Sabor Mágico", description: base.description, currency: "USD" };
    expect(changedKeys(base, draft)).toEqual(["businessName", "currency"]);
  });

  it("volver a escribir el valor original deja de contar como cambio", () => {
    expect(changedKeys(base, { businessName: "Sabor Mágico Grill" })).toEqual([]);
  });

  it("compara listas por contenido y orden (idiomas)", () => {
    expect(changedKeys(base, { languages: ["ES", "EN"] })).toEqual([]);
    expect(changedKeys(base, { languages: ["ES"] })).toEqual(["languages"]);
    expect(sameValue(["ES", "EN"], ["EN", "ES"])).toBe(false);
  });

  it("ignora claves del borrador sin valor", () => {
    expect(changedKeys(base, { businessName: undefined })).toEqual([]);
  });

  it("en Horarios, un día cerrado no cambia por las horas que conserva para reabrirlo", () => {
    const week = horariosValues(makeConfig());
    const tuesdayClosed: DayValues = { isOpen: false, openTime: "12:00", closeTime: "22:00" };
    const mondayClosed: DayValues = { isOpen: false, openTime: "09:00", closeTime: "10:00" };
    const draft: Partial<HorariosValues> = { MONDAY: mondayClosed, TUESDAY: tuesdayClosed };
    expect(changedKeys(week, draft, sameDay)).toEqual(["TUESDAY"]);
  });

  it("sameDay compara horas solo si el día abre", () => {
    expect(sameDay({ isOpen: true, openTime: "12:00", closeTime: "22:00" }, { isOpen: true, openTime: "12:00", closeTime: "21:00" })).toBe(false);
    expect(sameDay({ isOpen: false, openTime: "", closeTime: "" }, { isOpen: false, openTime: "12:00", closeTime: "22:00" })).toBe(true);
    expect(sameDay({ isOpen: false, openTime: "", closeTime: "" }, { isOpen: true, openTime: "", closeTime: "" })).toBe(false);
  });

  it("pickValues toma solo las claves cambiadas", () => {
    expect(pickValues(base, ["email", "currency"])).toEqual({ email: "reservas@sabormagico.pe", currency: "PEN" });
  });
});

describe("modelos de formulario", () => {
  it("empresaValues muestra los nulos como campos vacíos y ordena los idiomas", () => {
    const values = empresaValues(makeConfig({ logoUrl: null, description: null, website: null, languages: ["PT", "ES"] }));
    expect(values).toMatchObject({ logoUrl: "", description: "", website: "", languages: ["ES", "PT"] });
    expect(values).not.toHaveProperty("latitude");
  });

  it("samantaValues: sin responsable es cadena vacía y el tiempo se edita como texto", () => {
    expect(samantaValues(makeConfig({ approvalResponsibleId: null, approvalResponsible: null }))).toEqual({
      approvalResponsibleId: "",
      responseTimeoutMinutes: "30",
    });
  });

  it("horariosValues trata como cerrado un día que falta o que no tiene horas", () => {
    const config = makeConfig();
    const values = horariosValues(
      makeConfig({
        schedules: [
          ...config.schedules.filter((s) => s.dayOfWeek !== "SUNDAY" && s.dayOfWeek !== "TUESDAY"),
          { dayOfWeek: "TUESDAY", isOpen: true, openTime: null, closeTime: "22:00" },
        ],
      }),
    );
    expect(values.SUNDAY).toEqual({ isOpen: false, openTime: "", closeTime: "" });
    expect(values.TUESDAY).toEqual({ isOpen: false, openTime: "", closeTime: "" });
    expect(values.FRIDAY).toEqual({ isOpen: true, openTime: "12:00", closeTime: "23:59" });
  });

  it("weekToInput arma la semana de lunes a domingo y quita las horas de los días cerrados", () => {
    const values = horariosValues(makeConfig());
    values.TUESDAY = { isOpen: false, openTime: "12:00", closeTime: "22:00" };
    const week = weekToInput(values);
    expect(week.map((d) => d.dayOfWeek)).toEqual(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
    expect(week[1]).toEqual({ dayOfWeek: "TUESDAY", isOpen: false, openTime: null, closeTime: null });
    expect(week[6]).toEqual({ dayOfWeek: "SUNDAY", isOpen: true, openTime: "12:00", closeTime: "18:00" });
  });

  it("toggleLanguage marca y desmarca conservando el orden ES, EN, PT", () => {
    expect(toggleLanguage(["ES"], "PT")).toEqual(["ES", "PT"]);
    expect(toggleLanguage(["PT"], "ES")).toEqual(["ES", "PT"]);
    expect(toggleLanguage(["ES", "EN"], "ES")).toEqual(["EN"]);
    expect(toggleLanguage(["ES"], "ES")).toEqual([]);
  });

  it("timeZoneOptions agrega la zona actual si no es una de las habituales", () => {
    expect(timeZoneOptions("America/Lima")).toBe(TIME_ZONE_OPTIONS);
    const options = timeZoneOptions("Europe/Madrid");
    expect(options[0]).toEqual({ value: "Europe/Madrid", label: "Europe/Madrid" });
    expect(options).toHaveLength(TIME_ZONE_OPTIONS.length + 1);
  });
});

describe("responsable de aprobación", () => {
  const ricardo = makeUser({ id: OWNER_ID, firstName: "Ricardo", lastName: "Mora", email: "ricardo@sabormagico.pe" });
  const ana = makeUser({ id: OWNER_2_ID, firstName: "Ana", lastName: "Díaz", roles: ["OWNER", "OPERATOR"] });
  const inactive = makeUser({ id: "a1", firstName: "Beto", isActive: false });
  const admin = makeUser({ id: "a2", firstName: "Frank", roles: ["ADMIN"] });

  it("los candidatos son usuarios activos con rol OWNER (aunque tengan otros roles), por nombre", () => {
    expect(approvalCandidates([ricardo, inactive, admin, ana]).map((u) => u.firstName)).toEqual(["Ana", "Ricardo"]);
  });

  it("el responsable vigente aparece una sola vez si es candidato", () => {
    const { options, currentInvalid } = responsibleOptions([ricardo, ana], makeConfig().approvalResponsible);
    expect(currentInvalid).toBe(false);
    expect(options.map((o) => o.value)).toEqual(["", OWNER_2_ID, OWNER_ID]);
    expect(options[0]?.label).toBe("Sin responsable");
    expect(options[2]?.label).toBe("Ricardo Mora · ricardo@sabormagico.pe");
  });

  it("marca al responsable guardado que ya no es válido (inactivo o sin OWNER)", () => {
    const { options, currentInvalid } = responsibleOptions([{ ...ricardo, isActive: false }, ana], makeConfig().approvalResponsible);
    expect(currentInvalid).toBe(true);
    expect(options[1]).toEqual({ value: OWNER_ID, label: "Ricardo Mora · ricardo@sabormagico.pe (ya no es válido)" });
  });

  it("mientras la lista carga muestra al responsable guardado sin marcarlo", () => {
    const { options, currentInvalid } = responsibleOptions(undefined, makeConfig().approvalResponsible);
    expect(currentInvalid).toBe(false);
    expect(options.map((o) => o.value)).toEqual(["", OWNER_ID]);
    expect(responsibleOptions(undefined, null).options).toHaveLength(1);
  });
});

describe("configuración inicial", () => {
  it("arma el cuerpo completo: 7 días cerrados, sin coordenadas ni responsable", () => {
    const body = setupRequestInput(emptySetupValues());
    expect(Object.keys(body)).toHaveLength(17);
    expect(body).toMatchObject({ latitude: null, longitude: null, approvalResponsibleId: null, languages: ["ES"], currency: "PEN" });
    expect(body.schedules.every((d) => !d.isOpen && d.openTime === null && d.closeTime === null)).toBe(true);
  });

  it("con los datos completos pasa la validación y sin ellos señala cada campo", () => {
    const empty = validateConfig(setupRequestInput(emptySetupValues()));
    expect(empty.success).toBe(false);
    expect(!empty.success && Object.keys(empty.errors).sort()).toEqual([
      "address",
      "businessName",
      "cancellationPolicy",
      "email",
      "reservationPolicy",
      "responseTimeoutMinutes",
      "whatsappNumber",
    ]);
    const filled = validateConfig(
      setupRequestInput({
        ...emptySetupValues(),
        businessName: "Sabor Mágico",
        address: "Av. Larco 1234",
        whatsappNumber: "+51 987 000 192",
        email: "reservas@sabormagico.pe",
        reservationPolicy: "Se confirma al aprobar.",
        cancellationPolicy: "Sin costo hasta 4 horas antes.",
        responseTimeoutMinutes: "15",
      }),
    );
    expect(filled.success && filled.data).toMatchObject({ whatsappNumber: "+51987000192", responseTimeoutMinutes: 15, logoUrl: null });
  });
});
