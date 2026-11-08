import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Customer } from "@/lib/api/types";
import {
  EMPTY_CUSTOMER_FORM,
  buildCreateCustomerBody,
  buildInterestBody,
  buildUpdateCustomerBody,
  changesCustomerSummary,
  customerFormValues,
  customerSaveErrors,
  isProviderIdentityChannel,
  phoneCountryOptions,
  phoneFormatError,
  validateCustomerForm,
  type CustomerFormValues,
} from "./customer-form-logic";

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    firstName: "Carlos",
    lastName: "Quispe",
    phone: "987 654 321",
    phoneCountry: "PE",
    email: "carlos.quispe@example.com",
    sourceChannel: "WHATSAPP",
    status: "INTERESTED",
    firstContactAt: "2026-11-03T02:32:11.984Z",
    lastContactAt: "2026-11-03T02:40:05.120Z",
    notes: "Consulta por platos de trucha",
    createdAt: "2026-11-03T02:32:11.991Z",
    updatedAt: "2026-11-03T02:41:37.502Z",
    ...overrides,
  };
}

const form = (patch: Partial<CustomerFormValues>): CustomerFormValues => ({ ...EMPTY_CUSTOMER_FORM, sourceChannel: "PHONE", ...patch });

describe("teléfono", () => {
  it("acepta dígitos, espacios, paréntesis, puntos, guiones y un + inicial, con 6 a 15 dígitos", () => {
    for (const phone of ["987 654 321", "+51 987-654-321", "(01) 555.1234", "123456"]) expect(phoneFormatError(phone)).toBeUndefined();
    expect(phoneFormatError("+51 987 654 321 anexo 2")).toMatch(/^Usa solo dígitos/);
    expect(phoneFormatError("51+987654321")).toMatch(/^Usa solo dígitos/);
    expect(phoneFormatError("12345")).toBe("El número debe tener entre 6 y 15 dígitos.");
    expect(phoneFormatError("1234567890123456")).toBe("El número debe tener entre 6 y 15 dígitos.");
    expect(phoneFormatError("")).toBeUndefined();
  });

  it("el selector de país arranca en Perú y conserva un país guardado que no esté en la lista", () => {
    expect(EMPTY_CUSTOMER_FORM.phoneCountry).toBe("PE");
    expect(phoneCountryOptions("PE")[0]).toEqual({ code: "PE", label: "Perú (+51)" });
    expect(phoneCountryOptions("NZ").at(-1)).toEqual({ code: "NZ", label: "NZ" });
  });
});

describe("validación", () => {
  it("exige el canal de origen", () => {
    expect(validateCustomerForm({ ...form({ email: "a@b.pe" }), sourceChannel: "" }).sourceChannel).toBe("Elige el canal por el que llegó.");
  });

  it("regla de contacto: correo, o teléfono internacional, o nacional con país", () => {
    expect(validateCustomerForm(form({}))).toEqual({ phone: "Escribe un teléfono o un correo: hace falta al menos uno." });
    expect(validateCustomerForm(form({ phone: "987654321", phoneCountry: "" }))).toEqual({
      phoneCountry: "Elige el país del número o agrega un correo.",
    });
    expect(validateCustomerForm(form({ phone: "987654321", phoneCountry: "PE" }))).toEqual({});
    expect(validateCustomerForm(form({ phone: "+51987654321", phoneCountry: "" }))).toEqual({});
    // Un número nacional sin país se acepta si hay correo (se guarda sin normalizar).
    expect(validateCustomerForm(form({ phone: "987654321", phoneCountry: "", email: "x@correo.pe" }))).toEqual({});
  });

  it("las identidades de Messenger están exentas de la regla de contacto", () => {
    expect(validateCustomerForm({ ...form({}), sourceChannel: "FACEBOOK" }, { skipContactRule: true })).toEqual({});
  });

  it("longitudes y formato", () => {
    const errors = validateCustomerForm(
      form({ firstName: "a".repeat(101), lastName: "b".repeat(101), email: "no-es-correo", notes: "n".repeat(5001) }),
    );
    expect(errors).toEqual({
      firstName: "Escribe como máximo 100 caracteres.",
      lastName: "Escribe como máximo 100 caracteres.",
      email: "Escribe un correo válido.",
      notes: "Escribe como máximo 5000 caracteres.",
    });
  });
});

describe("POST /customers", () => {
  it("omite los campos vacíos (nunca envía \"\")", () => {
    expect(buildCreateCustomerBody(form({ email: "  ", firstName: " ", phone: "", notes: "" }))).toEqual({ sourceChannel: "PHONE" });
  });

  it("envía phoneCountry solo con un número nacional", () => {
    expect(
      buildCreateCustomerBody(
        form({
          sourceChannel: "WHATSAPP",
          firstName: " Carlos ",
          lastName: "Quispe",
          phone: " 987 654 321 ",
          phoneCountry: "PE",
          email: " Carlos.Quispe@Example.com ",
          notes: "Consulta por platos de trucha",
        }),
      ),
    ).toEqual({
      sourceChannel: "WHATSAPP",
      firstName: "Carlos",
      lastName: "Quispe",
      phone: "987 654 321",
      phoneCountry: "PE",
      email: "carlos.quispe@example.com",
      notes: "Consulta por platos de trucha",
    });
    expect(buildCreateCustomerBody(form({ phone: "+51 987 654 321", phoneCountry: "PE" }))).toEqual({
      sourceChannel: "PHONE",
      phone: "+51 987 654 321",
    });
    expect(buildCreateCustomerBody(form({ phone: "987654321", phoneCountry: "", email: "x@correo.pe" }))).toEqual({
      sourceChannel: "PHONE",
      phone: "987654321",
      email: "x@correo.pe",
    });
  });
});

describe("PATCH /customers/:id", () => {
  const initial = makeCustomer();
  const edit = (patch: Partial<CustomerFormValues>) => buildUpdateCustomerBody(initial, { ...customerFormValues(initial), ...patch });

  it("sin cambios no envía nada", () => {
    expect(edit({})).toEqual({});
    // Mayúsculas del correo o espacios alrededor no son un cambio.
    expect(edit({ email: " Carlos.Quispe@Example.com ", firstName: "Carlos " })).toEqual({});
  });

  it("solo los campos modificados; vaciar envía null", () => {
    expect(edit({ firstName: "Carlos Alberto", notes: "Prefiere atención por correo" })).toEqual({
      firstName: "Carlos Alberto",
      notes: "Prefiere atención por correo",
    });
    expect(edit({ lastName: "", email: "", notes: "  " })).toEqual({ lastName: null, email: null, notes: null });
    expect(edit({ phone: "" })).toEqual({ phone: null });
  });

  it("reenvía el país con un teléfono nacional, también si solo cambió el país", () => {
    expect(edit({ phone: "912 345 678" })).toEqual({ phone: "912 345 678", phoneCountry: "PE" });
    expect(edit({ phoneCountry: "CL" })).toEqual({ phone: "987 654 321", phoneCountry: "CL" });
    // Con «+» el país sale del prefijo: no se envía.
    expect(edit({ phone: "+56 9 1234 5678" })).toEqual({ phone: "+56 9 1234 5678" });
    // «Sin país»: se envía el número sin país (el backend lo borra).
    expect(edit({ phoneCountry: "" })).toEqual({ phone: "987 654 321" });
  });

  it("un teléfono guardado sin país se muestra «Sin país» y no cuenta como cambio", () => {
    const whatsapp = makeCustomer({ phone: "+51912345678", phoneCountry: null, firstName: null, lastName: null, email: null });
    expect(customerFormValues(whatsapp).phoneCountry).toBe("");
    expect(buildUpdateCustomerBody(whatsapp, customerFormValues(whatsapp))).toEqual({});
    const raw = makeCustomer({ phone: "987654321", phoneCountry: null });
    expect(buildUpdateCustomerBody(raw, { ...customerFormValues(raw), phoneCountry: "PE" })).toEqual({ phone: "987654321", phoneCountry: "PE" });
    // Sin teléfono, el país del selector no importa.
    const noPhone = makeCustomer({ phone: null, phoneCountry: null });
    expect(customerFormValues(noPhone).phoneCountry).toBe("PE");
    expect(buildUpdateCustomerBody(noPhone, { ...customerFormValues(noPhone), phoneCountry: "US" })).toEqual({});
  });

  it("canal de origen solo si cambió", () => {
    expect(edit({ sourceChannel: "EMAIL" })).toEqual({ sourceChannel: "EMAIL" });
  });

  it("sabe si cambió el resumen que viaja en conversaciones, solicitudes y reservas", () => {
    expect(changesCustomerSummary({ notes: "x" })).toBe(false);
    expect(changesCustomerSummary({ sourceChannel: "EMAIL" })).toBe(false);
    expect(changesCustomerSummary({ firstName: null })).toBe(true);
    expect(changesCustomerSummary({ phone: "912 345 678", phoneCountry: "PE" })).toBe(true);
    expect(changesCustomerSummary({ email: "a@b.pe" })).toBe(true);
  });
});

describe("intereses", () => {
  it("omite la nota vacía", () => {
    expect(buildInterestBody("item-1", "  ")).toEqual({ commercialItemId: "item-1" });
    expect(buildInterestBody("item-1", " Consultó precio ")).toEqual({ commercialItemId: "item-1", notes: "Consultó precio" });
  });
});

describe("errores del guardado", () => {
  const duplicate = new ApiError(409, ["Ya existe un cliente con ese teléfono o correo"]);

  it("el duplicado (409) va al campo enviado y ofrece buscar al cliente existente", () => {
    expect(customerSaveErrors(duplicate, { sourceChannel: "PHONE", phone: "987 654 321", phoneCountry: "PE" })).toEqual({
      fields: { phone: "Ya existe un cliente con ese teléfono o correo." },
      form: null,
      duplicateOf: "987 654 321",
      resetChannel: false,
    });
    const both = customerSaveErrors(duplicate, { sourceChannel: "PHONE", phone: "987 654 321", email: "x@correo.pe" });
    expect(both.fields).toEqual({
      phone: "Ya existe un cliente con ese teléfono o correo.",
      email: "Ya existe un cliente con ese teléfono o correo.",
    });
    expect(both.duplicateOf).toBe("x@correo.pe");
  });

  it("el 400 de canal de una identidad del proveedor (Messenger o Instagram) va al canal y lo restablece", () => {
    const found = customerSaveErrors(new ApiError(400, ["No se puede cambiar el canal de una identidad del proveedor"]), {
      sourceChannel: "EMAIL",
    });
    expect(found).toMatchObject({
      fields: { sourceChannel: "No se puede cambiar el canal de una identidad del proveedor." },
      resetChannel: true,
    });
    // El texto anterior de bk-crm («…de Messenger») se sigue reconociendo.
    expect(
      customerSaveErrors(new ApiError(400, ["No se puede cambiar el canal de una identidad de Messenger"]), { sourceChannel: "EMAIL" }).resetChannel,
    ).toBe(true);
  });

  it("Messenger e Instagram son canales de identidad del proveedor", () => {
    expect(isProviderIdentityChannel("FACEBOOK")).toBe(true);
    expect(isProviderIdentityChannel("INSTAGRAM")).toBe(true);
    expect(isProviderIdentityChannel("WHATSAPP")).toBe(false);
    expect(isProviderIdentityChannel("")).toBe(false);
  });

  it("las reglas del teléfono van a su campo, sin nombres técnicos", () => {
    expect(customerSaveErrors(new ApiError(400, ["El teléfono no es válido para el país indicado"]), {}).fields).toEqual({
      phone: "El teléfono no es válido para el país indicado.",
    });
    expect(customerSaveErrors(new ApiError(400, ["phoneCountry debe ser un país ISO válido"]), {}).fields).toEqual({
      phoneCountry: "El servidor no reconoce ese país: elige otro.",
    });
    const contact = customerSaveErrors(
      new ApiError(400, ["Proporciona un email válido o un teléfono internacional; para un número nacional indica phoneCountry"]),
      {},
    );
    expect(contact.fields.phone).not.toMatch(/phoneCountry/);
  });

  it("los 400 de validación se traducen por campo", () => {
    const messages = ["email must be an email", "phoneCountry must match /^[A-Z]{2}$/ regular expression"];
    expect(customerSaveErrors(new ApiError(400, messages, undefined, { statusCode: 400, message: messages }), {})).toMatchObject({
      fields: { email: "Escribe un correo válido.", phoneCountry: "El formato no es válido." },
      form: null,
    });
  });

  it("otros errores van al aviso del formulario", () => {
    expect(customerSaveErrors(new ApiError(409, ["Conflicto concurrente; vuelve a intentarlo"]), {}).form).toBe(
      "Conflicto concurrente; vuelve a intentarlo",
    );
    expect(customerSaveErrors(new ApiError(0, ["sin red"]), {}).form).toBe("No se pudo conectar con el servidor. Inténtalo de nuevo.");
  });
});
