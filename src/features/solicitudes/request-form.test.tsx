import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { catalogApi, customersApi, requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CommercialItem, Customer, Paginated, ReservationRequest } from "@/lib/api/types";
import { zonedInputsToIso } from "@/lib/format/date-inputs";
import { renderWithQuery } from "@/test/render";
import { NewRequestDialog } from "./request-form";

vi.mock("@/lib/restaurant", () => ({
  useRestaurant: () => ({ config: null, timeZone: "America/Lima", currency: "PEN", missing: false, isLoading: false, error: null }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ITEM_ID = "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57";

const customer: Customer = {
  id: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  firstName: "Carlos",
  lastName: "Quispe",
  phone: "987 654 321",
  phoneCountry: "PE",
  email: null,
  sourceChannel: "WHATSAPP",
  status: "NEW",
  firstContactAt: "2026-11-01T10:00:00.000Z",
  lastContactAt: "2026-11-01T10:00:00.000Z",
  notes: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

function created(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    id: "c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93",
    code: "RES-2026-000042",
    customerId: customer.id,
    commercialItemId: null,
    sourceChannel: "WHATSAPP",
    reservationAt: null,
    numberOfPeople: null,
    quotedPrice: null,
    currency: null,
    comments: null,
    specialRequirements: null,
    status: "INCOMPLETE_DATA",
    createdAt: "2026-11-03T02:35:20.418Z",
    updatedAt: "2026-11-03T02:35:20.418Z",
    customer,
    commercialItem: null,
    ...overrides,
  };
}

/** El selector solo usa id y nombres del catálogo. */
const catalog = {
  data: [{ id: ITEM_ID, nameEs: "Trucha a la parrilla", nameEn: null }],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
} as unknown as Paginated<CommercialItem>;

function renderDialog(props: Partial<Parameters<typeof NewRequestDialog>[0]> = {}) {
  vi.spyOn(catalogApi, "items").mockResolvedValue(catalog);
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const view = renderWithQuery(<NewRequestDialog open onClose={onClose} onCreated={onCreated} initialCustomer={customer} {...props} />);
  const dialog = screen.getByRole("dialog", { name: "Nueva solicitud" });
  const field = (label: string) => within(dialog).getByLabelText(label);
  const submit = () => fireEvent.click(within(dialog).getByRole("button", { name: /Crear solicitud|Creando…/ }));
  return { ...view, dialog, field, submit, onClose, onCreated };
}

afterEach(() => vi.restoreAllMocks());

describe("Nueva solicitud", () => {
  it("parte del cliente y su canal, envía solo lo completado e invalida solicitudes y estadísticas", async () => {
    const create = vi.spyOn(requestsApi, "create").mockResolvedValue(created({ status: "READY_TO_SEND" }));
    const { client, field, submit, onClose, onCreated } = renderDialog();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(field("Canal de la solicitud")).toHaveValue("WHATSAPP");
    await screen.findByRole("option", { name: "Trucha a la parrilla" });
    fireEvent.change(field("Servicio"), { target: { value: ITEM_ID } });
    fireEvent.change(field("Fecha y hora: día"), { target: { value: "2030-05-10" } });
    fireEvent.change(field("Fecha y hora: hora"), { target: { value: "20:00" } });
    fireEvent.change(field("Personas"), { target: { value: "4" } });
    fireEvent.change(field("Precio cotizado"), { target: { value: "150" } });
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledExactlyOnceWith({
      customerId: customer.id,
      sourceChannel: "WHATSAPP",
      commercialItemId: ITEM_ID,
      reservationAt: zonedInputsToIso({ day: "2030-05-10", time: "20:00" }, "America/Lima"),
      numberOfPeople: 4,
      quotedPrice: "150",
    });
    expect(onClose).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.requestsAll });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.statsAll });
  });

  it("la moneda propone la del restaurante y solo se habilita (y envía) con precio", async () => {
    const create = vi.spyOn(requestsApi, "create").mockResolvedValue(created());
    const { field, submit, onCreated } = renderDialog();

    expect(field("Moneda")).toHaveValue("PEN");
    expect(field("Moneda")).toBeDisabled();
    fireEvent.change(field("Precio cotizado"), { target: { value: "45.50" } });
    expect(field("Moneda")).toBeEnabled();
    fireEvent.change(field("Moneda"), { target: { value: "USD" } });
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(create).toHaveBeenCalledExactlyOnceWith({
      customerId: customer.id,
      sourceChannel: "WHATSAPP",
      quotedPrice: "45.50",
      currency: "USD",
    });
  });

  it("no envía una fecha pasada, personas que no son un entero ni un precio con coma", async () => {
    const create = vi.spyOn(requestsApi, "create");
    const { dialog, field, submit } = renderDialog();

    fireEvent.change(field("Fecha y hora: día"), { target: { value: "2020-01-01" } });
    fireEvent.change(field("Fecha y hora: hora"), { target: { value: "10:00" } });
    fireEvent.change(field("Personas"), { target: { value: "0" } });
    fireEvent.change(field("Precio cotizado"), { target: { value: "1,5" } });
    submit();

    expect(within(dialog).getByText("Elige una fecha y hora futuras.")).toBeInTheDocument();
    expect(within(dialog).getByText("Escribe un número entero mayor que 0.")).toBeInTheDocument();
    expect(within(dialog).getByText(/^Escribe un importe/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("no es idempotente: mientras guarda el botón queda deshabilitado", async () => {
    const create = vi.spyOn(requestsApi, "create").mockReturnValue(new Promise<ReservationRequest>(() => undefined));
    const { dialog, submit } = renderDialog();

    submit();
    const button = await within(dialog).findByRole("button", { name: "Creando…" });
    expect(button).toBeDisabled();
    submit();
    expect(create).toHaveBeenCalledTimes(1);
    // Mientras guarda, el diálogo no se cierra.
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
  });

  it("si la conexión falla, pide revisar la lista antes de reintentar", async () => {
    vi.spyOn(requestsApi, "create").mockRejectedValue(
      new ApiError(504, ["El servidor del CRM tardó demasiado en responder. Inténtalo de nuevo."], "BACKEND_UNAVAILABLE"),
    );
    const { client, dialog, submit, onCreated } = renderDialog();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    submit();

    expect(await within(dialog).findByText(/No se pudo confirmar si la solicitud se creó/)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.requestsAll });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("sin configuración del restaurante enlaza a Ajustes › Empresa", async () => {
    vi.spyOn(requestsApi, "create").mockRejectedValue(new ApiError(409, ["Configura el restaurante antes de crear solicitudes o reservas"]));
    const { dialog, submit } = renderDialog();
    submit();

    expect(await within(dialog).findByRole("link", { name: "Ajustes › Empresa" })).toHaveAttribute("href", "/ajustes/empresa");
  });

  it("los errores de negocio van a su campo", async () => {
    vi.spyOn(requestsApi, "create").mockRejectedValue(new ApiError(400, ["El elemento comercial debe estar activo y aprobado"]));
    const { dialog, submit } = renderDialog();
    submit();
    expect(await within(dialog).findByText("El elemento comercial debe estar activo y aprobado.")).toBeInTheDocument();
  });

  it("al buscar y elegir un cliente, el canal pasa a ser el suyo salvo que ya se haya elegido otro", async () => {
    const messenger: Customer = { ...customer, id: "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81", firstName: "Rosa", lastName: "Mamani", sourceChannel: "FACEBOOK" };
    const list = vi.spyOn(customersApi, "list").mockResolvedValue({ data: [messenger], pagination: { page: 1, limit: 8, total: 1, totalPages: 1 } });
    const create = vi.spyOn(requestsApi, "create");
    const { dialog, field, submit } = renderDialog({ initialCustomer: null });

    expect(field("Canal de la solicitud")).toHaveValue("");
    submit();
    expect(within(dialog).getByText("Elige un cliente.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(field("Cliente"), { target: { value: "Rosa" } });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Rosa Mamani/ }));
    expect(list).toHaveBeenCalledWith({ search: "Rosa", limit: 8 });
    expect(field("Canal de la solicitud")).toHaveValue("FACEBOOK");

    // Si la persona eligió otro canal, cambiar de cliente no lo pisa.
    fireEvent.change(field("Canal de la solicitud"), { target: { value: "PHONE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cambiar" }));
    fireEvent.change(field("Cliente"), { target: { value: "Rosa" } });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Rosa Mamani/ }));
    expect(field("Canal de la solicitud")).toHaveValue("PHONE");
  });
});
