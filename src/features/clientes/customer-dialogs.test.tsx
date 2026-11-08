import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { catalogApi, customersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CommercialItem, Customer, CustomerDetail, CustomerInterest, Paginated } from "@/lib/api/types";
import { renderWithQuery } from "@/test/render";
import { EditCustomerDialog, NewCustomerDialog } from "./customer-dialogs";

vi.mock("@/lib/restaurant", () => ({
  useRestaurant: () => ({ config: null, timeZone: "America/Lima", currency: "PEN", missing: false, isLoading: false, error: null }),
}));

const ITEM_ID = "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57";
const OTHER_ITEM_ID = "2b8f4c6d-1e7a-4d39-8c52-9a0e3f7b1d64";

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
    notes: null,
    createdAt: "2026-11-03T02:32:11.991Z",
    updatedAt: "2026-11-03T02:41:37.502Z",
    ...overrides,
  };
}

const interest: CustomerInterest = {
  id: "d14f8b2a-6e3c-4a97-8b51-0c2e7f9d3a68",
  firstInterestedAt: "2026-11-03T02:40:05.120Z",
  lastInterestedAt: "2026-11-03T02:40:05.120Z",
  notes: "Consultó disponibilidad",
  commercialItem: { id: ITEM_ID, nameEs: "Trucha a la parrilla", nameEn: null, type: "DISH", isActive: true, approvalStatus: "APPROVED" },
};

const catalog = {
  data: [
    { id: ITEM_ID, nameEs: "Trucha a la parrilla", nameEn: null },
    { id: OTHER_ITEM_ID, nameEs: "Almuerzo familiar", nameEn: null },
  ],
  pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
} as unknown as Paginated<CommercialItem>;

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------- alta

function renderNew() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const onFindExisting = vi.fn();
  const view = renderWithQuery(<NewCustomerDialog open onClose={onClose} onCreated={onCreated} onFindExisting={onFindExisting} />);
  const dialog = screen.getByRole("dialog", { name: "Nuevo cliente" });
  const field = (label: string) => within(dialog).getByLabelText(label);
  const submit = () => fireEvent.click(within(dialog).getByRole("button", { name: "Crear cliente" }));
  return { ...view, dialog, field, submit, onCreated, onFindExisting };
}

describe("Nuevo cliente", () => {
  it("exige el canal y un correo o un teléfono antes de enviar", () => {
    const create = vi.spyOn(customersApi, "create");
    const { dialog, field, submit } = renderNew();

    submit();
    expect(within(dialog).getByText("Elige el canal por el que llegó.")).toBeInTheDocument();
    expect(within(dialog).getByText("Escribe un teléfono o un correo: hace falta al menos uno.")).toBeInTheDocument();

    fireEvent.change(field("Canal de origen"), { target: { value: "PHONE" } });
    fireEvent.change(field("Teléfono"), { target: { value: "987654321" } });
    fireEvent.change(field("País del teléfono"), { target: { value: "" } });
    submit();
    expect(within(dialog).getByText("Elige el país del número o agrega un correo.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("crea con el país del selector (Perú por defecto), sin campos vacíos, e invalida Clientes", async () => {
    const response = makeCustomer({ email: null, status: "NEW" });
    const create = vi.spyOn(customersApi, "create").mockResolvedValue(response);
    const { client, field, submit, onCreated } = renderNew();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(field("País del teléfono")).toHaveValue("PE");
    fireEvent.change(field("Canal de origen"), { target: { value: "WHATSAPP" } });
    fireEvent.change(field("Nombre"), { target: { value: " Carlos " } });
    fireEvent.change(field("Teléfono"), { target: { value: "987 654 321" } });
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith(response));
    expect(create).toHaveBeenCalledExactlyOnceWith({
      sourceChannel: "WHATSAPP",
      firstName: "Carlos",
      phone: "987 654 321",
      phoneCountry: "PE",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.customersAll });
  });

  it("con «+» el país sale del número: el selector se deshabilita y no se envía", async () => {
    const create = vi.spyOn(customersApi, "create").mockResolvedValue(makeCustomer());
    const { field, submit, onCreated } = renderNew();

    fireEvent.change(field("Canal de origen"), { target: { value: "PHONE" } });
    fireEvent.change(field("Teléfono"), { target: { value: "+51 987 654 321" } });
    expect(field("País del teléfono")).toBeDisabled();
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(create).toHaveBeenCalledExactlyOnceWith({ sourceChannel: "PHONE", phone: "+51 987 654 321" });
  });

  it("un teléfono o correo de otro cliente (409) se marca en el campo y ofrece buscarlo", async () => {
    vi.spyOn(customersApi, "create").mockRejectedValue(new ApiError(409, ["Ya existe un cliente con ese teléfono o correo"]));
    const { dialog, field, submit, onFindExisting } = renderNew();

    fireEvent.change(field("Canal de origen"), { target: { value: "EMAIL" } });
    fireEvent.change(field("Correo"), { target: { value: "Rosa@Correo.pe" } });
    submit();

    expect(await within(dialog).findByText("Ya existe un cliente con ese teléfono o correo.")).toBeInTheDocument();
    expect(field("Correo")).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Buscar ese cliente" }));
    expect(onFindExisting).toHaveBeenCalledExactlyOnceWith("rosa@correo.pe");
  });

  it("avisa que un cliente de Facebook creado a mano no queda vinculado a Messenger", () => {
    const { dialog, field } = renderNew();
    fireEvent.change(field("Canal de origen"), { target: { value: "FACEBOOK" } });
    expect(within(dialog).getByText(/no queda vinculado a su cuenta de Messenger/)).toBeInTheDocument();
  });

  it("un cliente de Instagram creado a mano sigue necesitando teléfono o correo, y se avisa que no queda vinculado", () => {
    const create = vi.spyOn(customersApi, "create");
    const { dialog, field, submit } = renderNew();
    fireEvent.change(field("Canal de origen"), { target: { value: "INSTAGRAM" } });
    expect(within(dialog).getByText("Un cliente creado a mano no queda vinculado a su cuenta de Instagram.")).toBeInTheDocument();

    fireEvent.change(field("Nombre"), { target: { value: "Dushan" } });
    submit();
    expect(within(dialog).getByText("Escribe un teléfono o un correo: hace falta al menos uno.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- edición

function renderEdit(customer: Customer, interests: CustomerInterest[] = []) {
  const detail: CustomerDetail = { ...customer, interests };
  const get = vi.spyOn(customersApi, "get").mockResolvedValue(detail);
  vi.spyOn(catalogApi, "items").mockResolvedValue(catalog);
  const onClose = vi.fn();
  const view = renderWithQuery(<EditCustomerDialog customer={customer} onClose={onClose} />);
  const dialog = screen.getByRole("dialog", { name: "Editar cliente" });
  const field = (label: string) => within(dialog).getByLabelText(label);
  const save = () => within(dialog).getByRole("button", { name: /Guardar datos|Guardando…/ });
  const invalidate = vi.spyOn(view.client, "invalidateQueries");
  return { ...view, dialog, field, save, get, invalidate };
}

describe("Editar cliente: datos de contacto", () => {
  it("envía solo lo que cambió, mezcla la respuesta en la ficha y, si cambia el nombre, invalida lo que lo muestra", async () => {
    const customer = makeCustomer();
    const update = vi.spyOn(customersApi, "update").mockResolvedValue({ ...customer, firstName: "Carlos Alberto" });
    const { client, field, save, invalidate } = renderEdit(customer);
    const setData = vi.spyOn(client, "setQueryData");

    expect(save()).toBeDisabled();
    fireEvent.change(field("Nombre"), { target: { value: "Carlos Alberto" } });
    expect(save()).toBeEnabled();
    fireEvent.click(save());

    expect(await screen.findByText("Datos guardados")).toBeInTheDocument();
    expect(update).toHaveBeenCalledExactlyOnceWith(customer.id, { firstName: "Carlos Alberto" });
    expect(setData).toHaveBeenCalledWith(qk.customer(customer.id), expect.any(Function));
    for (const queryKey of [qk.customersAll, qk.conversationsAll, qk.requestsAll, qk.reservationsAll]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
    // Lo guardado pasa a ser la nueva base: no quedan cambios pendientes.
    expect(save()).toBeDisabled();
  });

  it("si solo cambian las notas, no invalida conversaciones, solicitudes ni reservas", async () => {
    const customer = makeCustomer();
    vi.spyOn(customersApi, "update").mockResolvedValue({ ...customer, notes: "Prefiere correo" });
    const { field, save, invalidate } = renderEdit(customer);

    fireEvent.change(field("Notas"), { target: { value: "Prefiere correo" } });
    fireEvent.click(save());
    expect(await screen.findByText("Datos guardados")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.customersAll });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: qk.conversationsAll });
  });

  it("al cambiar el teléfono de un cliente de WhatsApp avisa del destinatario y reenvía el país", async () => {
    const customer = makeCustomer();
    const update = vi.spyOn(customersApi, "update").mockResolvedValue({ ...customer, phone: "912 345 678" });
    const { dialog, field, save } = renderEdit(customer);

    expect(within(dialog).getByText("Es el número al que van las respuestas de WhatsApp.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Las respuestas de WhatsApp irán a este número/)).not.toBeInTheDocument();
    fireEvent.change(field("Teléfono"), { target: { value: "912 345 678" } });
    expect(within(dialog).getByText(/Las respuestas de WhatsApp irán a este número/)).toBeInTheDocument();

    fireEvent.click(save());
    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(customer.id, { phone: "912 345 678", phoneCountry: "PE" }));
  });

  it("borrar todo el contacto se bloquea en el cliente (regla de contacto)", () => {
    const customer = makeCustomer();
    const update = vi.spyOn(customersApi, "update");
    const { dialog, field, save } = renderEdit(customer);

    fireEvent.change(field("Teléfono"), { target: { value: "" } });
    fireEvent.change(field("Correo"), { target: { value: "" } });
    expect(within(dialog).getByText("Sin teléfono no se le podrá responder por WhatsApp.")).toBeInTheDocument();
    fireEvent.click(save());
    expect(within(dialog).getByText("Escribe un teléfono o un correo: hace falta al menos uno.")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("a un cliente de Facebook no le ofrece cambiar el canal y deja al backend la regla de contacto", async () => {
    const messenger = makeCustomer({ firstName: "Rosa Mamani", lastName: null, phone: null, phoneCountry: null, email: null, sourceChannel: "FACEBOOK" });
    const update = vi.spyOn(customersApi, "update").mockResolvedValue({ ...messenger, notes: "VIP" });
    const { dialog, field, save } = renderEdit(messenger);

    expect(within(dialog).queryByRole("combobox", { name: "Canal de origen" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/El canal de un cliente de Facebook no se cambia/)).toBeInTheDocument();
    fireEvent.change(field("Notas"), { target: { value: "VIP" } });
    fireEvent.click(save());
    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(messenger.id, { notes: "VIP" }));
  });

  it("a un cliente de Instagram sin teléfono ni correo le deja guardar el nombre, con el canal bloqueado", async () => {
    const instagram = makeCustomer({ firstName: null, lastName: null, phone: null, phoneCountry: null, email: null, sourceChannel: "INSTAGRAM" });
    const update = vi.spyOn(customersApi, "update").mockResolvedValue({ ...instagram, firstName: "Dushan", lastName: "Wqt" });
    const { dialog, field, save } = renderEdit(instagram);

    expect(within(dialog).queryByRole("combobox", { name: "Canal de origen" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("El canal de un cliente de Instagram no se cambia: Instagram no lo permite.")).toBeInTheDocument();
    fireEvent.change(field("Nombre"), { target: { value: "Dushan" } });
    fireEvent.change(field("Apellido"), { target: { value: "Wqt" } });
    fireEvent.click(save());

    expect(await within(dialog).findByText("Datos guardados")).toBeInTheDocument();
    expect(update).toHaveBeenCalledExactlyOnceWith(instagram.id, { firstName: "Dushan", lastName: "Wqt" });
    expect(within(dialog).queryByText(/hace falta al menos uno/)).not.toBeInTheDocument();
  });

  it("el 400 de cambio de canal deja el canal de Instagram y no lo vuelve a enviar", async () => {
    const instagram = makeCustomer({ firstName: "@dushan1812", lastName: null, phone: null, phoneCountry: null, email: null, sourceChannel: "INSTAGRAM" });
    const update = vi
      .spyOn(customersApi, "update")
      .mockRejectedValueOnce(new ApiError(400, ["No se puede cambiar el canal de una identidad del proveedor"]))
      .mockResolvedValueOnce({ ...instagram, firstName: "Dushan Wqt" });
    const { dialog, field, save } = renderEdit(instagram);

    fireEvent.change(field("Nombre"), { target: { value: "Dushan Wqt" } });
    fireEvent.click(save());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No se puede cambiar el canal de una identidad del proveedor.");
    expect(within(dialog).getByText("Instagram", { selector: "span" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Facebook", { selector: "span" })).not.toBeInTheDocument();

    // El reintento solo lleva el nombre: el canal volvió a INSTAGRAM, no a FACEBOOK.
    fireEvent.click(save());
    expect(await within(dialog).findByText("Datos guardados")).toBeInTheDocument();
    expect(update).toHaveBeenNthCalledWith(2, instagram.id, { firstName: "Dushan Wqt" });
  });

  it("muestra en el campo el error del backend (409 por duplicado)", async () => {
    vi.spyOn(customersApi, "update").mockRejectedValue(new ApiError(409, ["Ya existe un cliente con ese teléfono o correo"]));
    const { dialog, field, save } = renderEdit(makeCustomer());

    fireEvent.change(field("Correo"), { target: { value: "otro@correo.pe" } });
    fireEvent.click(save());
    expect(await within(dialog).findByText("Ya existe un cliente con ese teléfono o correo.")).toBeInTheDocument();
    expect(field("Correo")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Editar cliente: estado comercial", () => {
  it("se guarda al elegirlo y mezcla la respuesta en la ficha", async () => {
    const customer = makeCustomer();
    const setStatus = vi.spyOn(customersApi, "setStatus").mockResolvedValue({ ...customer, status: "LOST" });
    const { field, invalidate } = renderEdit(customer);

    expect(field("Estado comercial")).toHaveValue("INTERESTED");
    fireEvent.change(field("Estado comercial"), { target: { value: "LOST" } });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.customersAll }));
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(customer.id, "LOST");
    expect(field("Estado comercial")).toHaveValue("LOST");
  });

  it("si falla, vuelve al estado guardado y explica el motivo", async () => {
    vi.spyOn(customersApi, "setStatus").mockRejectedValue(new ApiError(403, ["No tienes permisos para realizar esta acción"]));
    const { dialog, field } = renderEdit(makeCustomer());

    fireEvent.change(field("Estado comercial"), { target: { value: "LOST" } });
    expect(await within(dialog).findByText(/No tienes permisos para realizar esta acción/)).toBeInTheDocument();
    expect(field("Estado comercial")).toHaveValue("INTERESTED");
  });
});

describe("Editar cliente: intereses", () => {
  it("lista los intereses y quita por el id del elemento comercial (un 404 «Interés no encontrado» cuenta como hecho)", async () => {
    const customer = makeCustomer();
    const remove = vi.spyOn(customersApi, "removeInterest").mockRejectedValue(new ApiError(404, ["Interés no encontrado"]));
    const { dialog, invalidate } = renderEdit(customer, [interest]);

    fireEvent.click(await within(dialog).findByRole("button", { name: "Quitar el interés en Trucha a la parrilla" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.customersAll }));
    expect(remove).toHaveBeenCalledExactlyOnceWith(customer.id, ITEM_ID);
    expect(within(dialog).queryByText(/No se pudo quitar el interés/)).not.toBeInTheDocument();
  });

  it("registra un interés con su nota y avisa si ya estaba registrado", async () => {
    const customer = makeCustomer();
    const add = vi.spyOn(customersApi, "addInterest").mockResolvedValue(interest);
    const { dialog, field, invalidate } = renderEdit(customer, [interest]);

    const register = within(dialog).getByRole("button", { name: "Registrar interés" });
    expect(register).toBeDisabled();
    await within(dialog).findByRole("option", { name: "Almuerzo familiar" });

    fireEvent.change(field("Servicio de interés"), { target: { value: ITEM_ID } });
    expect(within(dialog).getByText(/Ya está registrado/)).toBeInTheDocument();
    fireEvent.change(field("Servicio de interés"), { target: { value: OTHER_ITEM_ID } });
    fireEvent.change(field("Nota (opcional)"), { target: { value: " Consultó precio " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar interés" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.customersAll }));
    expect(add).toHaveBeenCalledExactlyOnceWith(customer.id, { commercialItemId: OTHER_ITEM_ID, notes: "Consultó precio" });
    await waitFor(() => expect(field("Servicio de interés")).toHaveValue(""));
  });

  it("sin intereses lo dice en vez de dejar la lista vacía", async () => {
    const { dialog } = renderEdit(makeCustomer());
    expect(await within(dialog).findByText("Sin intereses registrados.")).toBeInTheDocument();
  });
});
