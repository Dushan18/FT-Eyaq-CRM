import { describe, expect, it } from "vitest";
import type { CommercialItemSummary, CustomerInterest } from "@/lib/api/types";
import { toSearch } from "@/lib/api/client";
import {
  buildCustomerQuery,
  chatNotice,
  customerIdentity,
  interestCell,
  latestInterestName,
  pageUpdate,
  parseCustomerFilters,
  parsePage,
  reservationCountQuery,
  reservationsCell,
  searchUpdate,
  statusUpdate,
} from "./clientes-utils";

/** Simula `useUrlParams().get` sobre una query de URL. */
const urlGet = (query: string) => {
  const params = new URLSearchParams(query);
  return (key: string) => params.get(key);
};

describe("lectura de la URL", () => {
  it("usa los valores por defecto cuando la URL no trae filtros", () => {
    expect(parseCustomerFilters(urlGet(""))).toEqual({ q: "", status: null, page: 1 });
  });

  it("lee búsqueda, estado y página", () => {
    expect(parseCustomerFilters(urlGet("q=Fern%C3%A1ndez&estado=CONFIRMED&pagina=3"))).toEqual({
      q: "Fernández",
      status: "CONFIRMED",
      page: 3,
    });
  });

  it("recorta la búsqueda y la limita a 200 caracteres como el backend", () => {
    expect(parseCustomerFilters(urlGet("q=%20%20maria%20%20")).q).toBe("maria");
    expect(parseCustomerFilters(urlGet("q=%20%20%20")).q).toBe("");
    expect(parseCustomerFilters(urlGet(`q=${"a".repeat(250)}`)).q).toHaveLength(200);
  });

  it("ignora estados que no existen", () => {
    expect(parseCustomerFilters(urlGet("estado=VIP")).status).toBeNull();
    expect(parseCustomerFilters(urlGet("estado=confirmed")).status).toBeNull();
  });

  it("vuelve a la página 1 ante páginas inválidas", () => {
    for (const raw of ["0", "-2", "1.5", "abc", "", "1000001"]) expect(parsePage(raw)).toBe(1);
    expect(parsePage(null)).toBe(1);
    expect(parsePage("2")).toBe(2);
    expect(parsePage("1000000")).toBe(1_000_000);
  });
});

describe("escritura en la URL", () => {
  it("una búsqueda o un estado nuevos vuelven a la primera página", () => {
    expect(searchUpdate("maria")).toEqual({ q: "maria", pagina: null });
    expect(statusUpdate("LOST")).toEqual({ estado: "LOST", pagina: null });
  });

  it("no escribe los valores por defecto", () => {
    expect(searchUpdate("")).toEqual({ q: null, pagina: null });
    expect(statusUpdate(null)).toEqual({ estado: null, pagina: null });
    expect(pageUpdate(1)).toEqual({ pagina: null });
    expect(pageUpdate(4)).toEqual({ pagina: "4" });
  });
});

describe("armado de peticiones", () => {
  it("GET /customers solo envía lo que tiene valor, con 20 por página", () => {
    expect(buildCustomerQuery({ q: "", status: null, page: 1 })).toEqual({ page: 1, limit: 20 });
    expect(buildCustomerQuery({ q: "912 345", status: "NEW", page: 2 })).toEqual({
      page: 2,
      limit: 20,
      search: "912 345",
      status: "NEW",
    });
    // Nunca un parámetro vacío: el backend responde 400 a `search=`.
    expect(toSearch(buildCustomerQuery({ q: "", status: null, page: 1 }))).toBe("?page=1&limit=20");
  });

  it("cuenta las reservas de un cliente con una sola fila y sin las canceladas", () => {
    const query = reservationCountQuery("c-1");
    expect(query).toEqual({ customerId: "c-1", excludeCancelled: true, limit: 1 });
    expect(toSearch(query)).toBe("?customerId=c-1&excludeCancelled=true&limit=1");
  });
});

describe("celda CLIENTE", () => {
  const base = { firstName: null, lastName: null, phone: null, email: null };

  it("muestra el nombre con el teléfono debajo", () => {
    expect(customerIdentity({ ...base, firstName: "María", lastName: "Fernández", phone: "+51 910 442 908", email: "m@correo.pe" })).toEqual({
      name: "María Fernández",
      contact: "+51 910 442 908",
      initials: "MF",
    });
  });

  it("muestra el correo si no hay teléfono", () => {
    expect(customerIdentity({ ...base, firstName: "Carlos", email: "carlos@correo.pe" })).toEqual({
      name: "Carlos",
      contact: "carlos@correo.pe",
      initials: "C",
    });
  });

  it("sin nombre (alta por WhatsApp) titula con el teléfono y no lo repite debajo", () => {
    expect(customerIdentity({ ...base, phone: "+51912345678" })).toEqual({
      name: "+51912345678",
      contact: "Sin nombre registrado",
      initials: "?",
    });
    expect(customerIdentity({ ...base, phone: "+51912345678", email: "x@correo.pe" }).contact).toBe("x@correo.pe");
    expect(customerIdentity({ ...base, email: "x@correo.pe" })).toMatchObject({ name: "x@correo.pe", contact: "Sin nombre registrado" });
  });

  it("un cliente de Messenger sin datos se titula «Cliente de Messenger»", () => {
    expect(customerIdentity({ ...base, sourceChannel: "FACEBOOK" })).toEqual({ name: "Cliente de Messenger", contact: null, initials: "?" });
    // Con el nombre que dio Meta, se usa ese nombre.
    expect(customerIdentity({ ...base, firstName: "Rosa Mamani", sourceChannel: "FACEBOOK" }).name).toBe("Rosa Mamani");
    expect(customerIdentity({ ...base, sourceChannel: "WHATSAPP" }).name).toBe("Cliente sin nombre");
  });

  it("un cliente de Instagram sin datos se titula «Cliente de Instagram»", () => {
    expect(customerIdentity({ ...base, sourceChannel: "INSTAGRAM" })).toEqual({ name: "Cliente de Instagram", contact: null, initials: "?" });
    // Sin nombre en el perfil, bk-crm guarda el usuario con arroba: se muestra tal cual, sin la arroba en las iniciales.
    expect(customerIdentity({ ...base, firstName: "@ana.q", sourceChannel: "INSTAGRAM" })).toEqual({ name: "@ana.q", contact: null, initials: "A" });
    expect(customerIdentity({ ...base, firstName: "Rosa Mamani", sourceChannel: "INSTAGRAM" })).toEqual({
      name: "Rosa Mamani",
      contact: null,
      initials: "RM",
    });
  });
});

describe("celdas derivadas", () => {
  it("RESERVAS: carga, error y total", () => {
    expect(reservationsCell({ data: undefined, isError: false })).toEqual({ text: "…", pending: true });
    expect(reservationsCell({ data: undefined, isError: true })).toEqual({ text: "—", title: "No se pudo cargar" });
    expect(reservationsCell({ data: 0, isError: false })).toEqual({ text: "0" });
    expect(reservationsCell({ data: 3, isError: false })).toEqual({ text: "3" });
    // Si falla una actualización en segundo plano se conserva el último valor.
    expect(reservationsCell({ data: 3, isError: true })).toEqual({ text: "3" });
  });

  it("CONSULTÓ: servicio del interés más reciente o «—» si no tiene", () => {
    expect(interestCell({ data: undefined, isError: false })).toEqual({ text: "…", pending: true });
    expect(interestCell({ data: undefined, isError: true })).toEqual({ text: "—", title: "No se pudo cargar" });
    expect(interestCell({ data: null, isError: false })).toEqual({ text: "—", title: "Sin intereses registrados" });
    expect(interestCell({ data: "Cena", isError: false })).toEqual({ text: "Cena", title: "Cena" });
  });

  it("toma el primer interés (el backend los ordena del más reciente al más antiguo)", () => {
    const item = (nameEs: string | null, nameEn: string | null = null): CommercialItemSummary => ({
      id: `${nameEs ?? nameEn}`,
      nameEs,
      nameEn,
      type: "SERVICE",
      isActive: true,
      approvalStatus: "APPROVED",
    });
    const interest = (commercialItem: CommercialItemSummary, lastInterestedAt: string): CustomerInterest => ({
      id: commercialItem.id,
      firstInterestedAt: lastInterestedAt,
      lastInterestedAt,
      notes: null,
      commercialItem,
    });
    expect(
      latestInterestName({
        interests: [interest(item("Torta de cumpleaños"), "2026-10-14T05:40:00.000Z"), interest(item("Cena"), "2026-10-14T05:38:00.000Z")],
      }),
    ).toBe("Torta de cumpleaños");
    expect(latestInterestName({ interests: [interest(item(null, "Tasting menu"), "2026-10-14T05:40:00.000Z")] })).toBe("Tasting menu");
    expect(latestInterestName({ interests: [] })).toBeNull();
  });
});

describe("aviso al abrir la conversación", () => {
  const idle = { pendingId: null, notFound: null, failed: null };

  it("solo aparece en la fila del cliente afectado", () => {
    expect(chatNotice(idle, "a")).toBeNull();
    expect(chatNotice({ ...idle, pendingId: "a" }, "a")).toEqual({ kind: "opening", text: "Abriendo…" });
    expect(chatNotice({ ...idle, notFound: "a" }, "a")).toEqual({ kind: "missing", text: "Sin conversación" });
    expect(chatNotice({ ...idle, failed: "a" }, "a")).toEqual({ kind: "failed", text: "No se pudo abrir" });
    expect(chatNotice({ ...idle, notFound: "a" }, "b")).toBeNull();
  });
});
