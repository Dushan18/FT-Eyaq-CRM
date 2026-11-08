import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { catalogApi, conversationsApi, customersApi, reservationsApi } from "@/lib/api/endpoints";
import type { CommercialItem, Customer, Paginated, Reservation } from "@/lib/api/types";
import type { Action, RoleCode, ViewKey } from "@/lib/auth/permissions";
import { renderWithQuery } from "@/test/render";
import { ClientesView } from "./clientes-view";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
const session = vi.hoisted(() => ({ roles: ["OPERATOR"] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => "/clientes",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/restaurant", () => ({
  useRestaurant: () => ({ config: null, timeZone: "America/Lima", currency: "PEN", missing: false, isLoading: false, error: null }),
}));

vi.mock("@/lib/auth/session", async () => {
  const permissions = await import("@/lib/auth/permissions");
  return {
    useSession: () => {
      const roles = session.roles as RoleCode[];
      return {
        user: null,
        roles,
        status: "ready",
        error: null,
        retry: () => undefined,
        can: (action: Action) => permissions.can(roles, action),
        canView: (view: ViewKey) => permissions.canView(roles, view),
        logout: async () => undefined,
      };
    },
  };
});

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    firstName: "Carlos",
    lastName: "Quispe",
    phone: "987 654 321",
    phoneCountry: "PE",
    email: null,
    sourceChannel: "WHATSAPP",
    status: "NEW",
    firstContactAt: "2026-11-03T02:32:11.984Z",
    lastContactAt: "2026-11-03T02:40:05.120Z",
    notes: null,
    createdAt: "2026-11-03T02:32:11.991Z",
    updatedAt: "2026-11-03T02:41:37.502Z",
    ...overrides,
  };
}

const messenger = makeCustomer({
  id: "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
  firstName: null,
  lastName: null,
  phone: null,
  phoneCountry: null,
  sourceChannel: "FACEBOOK",
});

const instagram = makeCustomer({
  id: "5c9a1e3f-7b2d-4c68-a0f4-2e8b6d1c9a37",
  firstName: null,
  lastName: null,
  phone: null,
  phoneCountry: null,
  sourceChannel: "INSTAGRAM",
});

function mockBackend(customers: Customer[]) {
  const page = (data: Customer[]): Paginated<Customer> => ({ data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 } });
  vi.spyOn(customersApi, "list").mockResolvedValue(page(customers));
  vi.spyOn(customersApi, "get").mockImplementation(async (id) => ({ ...customers.find((c) => c.id === id)!, interests: [] }));
  vi.spyOn(reservationsApi, "list").mockResolvedValue({ data: [] as Reservation[], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } });
  vi.spyOn(catalogApi, "items").mockResolvedValue({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } } as Paginated<CommercialItem>);
  return { openChat: vi.spyOn(conversationsApi, "list") };
}

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  nav.push.mockReset();
  session.roles = ["OPERATOR"];
});

afterEach(() => vi.restoreAllMocks());

describe("Clientes", () => {
  it("titula «Cliente de Messenger» a un cliente de Facebook sin datos", async () => {
    mockBackend([messenger]);
    renderWithQuery(<ClientesView />);
    expect(await screen.findByRole("button", { name: "Abrir la conversación de Cliente de Messenger" })).toBeInTheDocument();
  });

  it("titula «Cliente de Instagram» a un cliente de Instagram sin datos", async () => {
    mockBackend([instagram]);
    renderWithQuery(<ClientesView />);
    expect(await screen.findByRole("button", { name: "Abrir la conversación de Cliente de Instagram" })).toBeInTheDocument();
  });

  it("OWNER solo consulta: sin «Nuevo cliente» ni «Editar»", async () => {
    session.roles = ["OWNER"];
    mockBackend([makeCustomer()]);
    renderWithQuery(<ClientesView />);

    await screen.findByText("Carlos Quispe");
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar a / })).not.toBeInTheDocument();
  });

  it("«Editar» abre la ficha sin abrir la conversación", async () => {
    const { openChat } = mockBackend([makeCustomer()]);
    renderWithQuery(<ClientesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar a Carlos Quispe" }));
    expect(screen.getByRole("dialog", { name: "Editar cliente" })).toBeInTheDocument();
    expect(openChat).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("tras crear un cliente avisa y permite abrir su ficha", async () => {
    mockBackend([makeCustomer()]);
    const created = makeCustomer({ id: "7c2e9a41-3d8b-4f16-a2c9-5e1b7d4f0a83", firstName: "Ana", lastName: "Prueba", phone: null, email: "ana@correo.pe" });
    vi.spyOn(customersApi, "create").mockResolvedValue(created);
    renderWithQuery(<ClientesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Nuevo cliente" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo cliente" });
    fireEvent.change(within(dialog).getByLabelText("Canal de origen"), { target: { value: "EMAIL" } });
    fireEvent.change(within(dialog).getByLabelText("Correo"), { target: { value: "ana@correo.pe" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByText(/Se creó el cliente Ana Prueba/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Nuevo cliente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir su ficha" }));
    expect(screen.getByRole("dialog", { name: "Editar cliente" })).toHaveAccessibleDescription(/Ana Prueba/);
  });

  it("ante un duplicado, «Buscar ese cliente» lo busca en la lista", async () => {
    mockBackend([makeCustomer()]);
    vi.spyOn(customersApi, "create").mockRejectedValue(new ApiError(409, ["Ya existe un cliente con ese teléfono o correo"]));
    renderWithQuery(<ClientesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Nuevo cliente" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo cliente" });
    fireEvent.change(within(dialog).getByLabelText("Canal de origen"), { target: { value: "EMAIL" } });
    fireEvent.change(within(dialog).getByLabelText("Correo"), { target: { value: "carlos@correo.pe" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear cliente" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Buscar ese cliente" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/clientes?q=carlos%40correo.pe", { scroll: false }));
    expect(screen.queryByRole("dialog", { name: "Nuevo cliente" })).not.toBeInTheDocument();
  });
});
