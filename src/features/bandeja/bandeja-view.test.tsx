import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conversationsApi, customersApi, requestsApi, reservationsApi } from "@/lib/api/endpoints";
import type { Conversation, CustomerDetail, Message, Paginated } from "@/lib/api/types";
import type { Action, RoleCode, ViewKey } from "@/lib/auth/permissions";
import { renderWithQuery } from "@/test/render";
import { BandejaView } from "./bandeja-view";

const CONV = "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14";
const CUSTOMER = "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => "/bandeja",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/restaurant", () => ({
  useRestaurant: () => ({ config: null, timeZone: "America/Lima", currency: "PEN", missing: false, isLoading: false, error: null }),
}));

vi.mock("@/lib/auth/session", async () => {
  const permissions = await import("@/lib/auth/permissions");
  const roles: RoleCode[] = ["ADMIN"];
  return {
    useSession: () => ({
      user: { id: "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d", firstName: "Frank", lastName: "Quispe" },
      roles,
      status: "ready",
      can: (action: Action) => permissions.can(roles, action),
      canView: (view: ViewKey) => permissions.canView(roles, view),
    }),
  };
});

const conversation: Conversation = {
  id: CONV,
  customerId: CUSTOMER,
  channel: "WHATSAPP",
  isAssistantPaused: false,
  assignedUserId: null,
  lastMessageAt: null,
  createdAt: "2026-10-28T19:14:05.000Z",
  updatedAt: "2026-11-03T02:32:11.000Z",
  customer: { id: CUSTOMER, firstName: "Lucía", lastName: "Quispe", phone: "+51987654321", email: null },
  assignedUser: null,
  unreadCount: 0,
};

const empty = <T,>(): Paginated<T> => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });

function mockBackend() {
  vi.spyOn(conversationsApi, "list").mockResolvedValue({ data: [conversation], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
  vi.spyOn(conversationsApi, "get").mockResolvedValue(conversation);
  vi.spyOn(conversationsApi, "messages").mockResolvedValue(empty<Message>() as never);
  vi.spyOn(requestsApi, "list").mockResolvedValue(empty());
  vi.spyOn(reservationsApi, "list").mockResolvedValue(empty());
  vi.spyOn(customersApi, "get").mockResolvedValue({
    id: CUSTOMER,
    firstName: "Lucía",
    lastName: "Quispe",
    phone: "+51987654321",
    phoneCountry: "PE",
    email: null,
    sourceChannel: "WHATSAPP",
    status: "NEW",
    firstContactAt: "2026-10-28T19:14:05.000Z",
    lastContactAt: "2026-11-03T02:32:11.000Z",
    notes: null,
    createdAt: "2026-10-28T19:14:05.000Z",
    updatedAt: "2026-11-03T02:32:11.000Z",
    interests: [],
  } satisfies CustomerDetail);
}

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  nav.push.mockReset();
  mockBackend();
});

afterEach(() => vi.restoreAllMocks());

describe("Bandeja según el ancho de la pantalla", () => {
  it("con lista y chat a la vista abre la primera conversación", async () => {
    window.innerWidth = 1440;
    renderWithQuery(<BandejaView />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/bandeja?c=${CONV}`, { scroll: false }));
  });

  it("en una sola columna (móvil) no abre ninguna: se queda en la lista", async () => {
    window.innerWidth = 390;
    renderWithQuery(<BandejaView />);
    expect(await screen.findByRole("button", { name: /^Lucía Quispe/ })).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("en una sola columna, «Volver» quita la conversación de la URL", async () => {
    window.innerWidth = 390;
    nav.search = `c=${CONV}`;
    renderWithQuery(<BandejaView />);
    fireEvent.click(await screen.findByRole("button", { name: "Volver a las conversaciones" }));
    expect(nav.replace).toHaveBeenCalledWith("/bandeja", { scroll: false });
  });

  it("sin sitio para la tercera columna, «Cliente» abre la ficha en un panel lateral", async () => {
    window.innerWidth = 1100;
    nav.search = `c=${CONV}`;
    renderWithQuery(<BandejaView />);
    expect(screen.queryByRole("complementary", { name: "Datos del cliente" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Cliente" }));
    const sheet = screen.getByRole("dialog", { name: "Datos del cliente" });
    expect(sheet).toHaveFocus();
    expect(await within(sheet).findByText("+51987654321")).toBeInTheDocument();
  });

  it("en pantalla ancha la ficha es la tercera columna y no hay botón «Cliente»", async () => {
    window.innerWidth = 1440;
    nav.search = `c=${CONV}`;
    renderWithQuery(<BandejaView />);
    expect(await screen.findByRole("complementary", { name: "Datos del cliente" })).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Lucía Quispe" });
    expect(screen.queryByRole("button", { name: "Cliente" })).not.toBeInTheDocument();
  });
});
