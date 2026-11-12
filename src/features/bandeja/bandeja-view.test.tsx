import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conversationsApi, customersApi, requestsApi, reservationsApi } from "@/lib/api/endpoints";
import type { Conversation, CustomerDetail, Message, Paginated, ReservationRequestDetail } from "@/lib/api/types";
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
  assistantPauseReason: null,
  assistantPausedAt: null,
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

describe("Bandeja › filtro Web: correos de la web en solo lectura", () => {
  const WEB_REQUEST = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const webRequest: ReservationRequestDetail = {
    id: WEB_REQUEST,
    code: "RES-2026-000466",
    externalReference: "SM-20261110-9E49B1",
    customerId: CUSTOMER,
    commercialItemId: null,
    conversationId: null,
    sourceChannel: "WEBSITE",
    reservationAt: "2026-11-21T00:30:00.000Z",
    numberOfPeople: 4,
    quotedPrice: null,
    currency: null,
    comments: "Es el cumpleaños de mi mamá\nPaís: Perú\nCRM: correo del formulario: ana@example.com",
    specialRequirements: "Terraza",
    status: "WAITING_RESPONSE",
    createdAt: "2026-11-10T14:00:00.000Z",
    updatedAt: "2026-11-10T14:00:05.000Z",
    customer: { id: CUSTOMER, firstName: "Lucía", lastName: "Quispe", phone: "+51987654321", email: null },
    commercialItem: null,
    statusHistory: [],
    reservation: null,
    ownerMessage: null,
    customerNoticeMessage: null,
    customerNoticeError: null,
  };

  it("lista las solicitudes WEBSITE (no conversaciones) y muestra el correo sin cuadro de respuesta", async () => {
    window.innerWidth = 1440;
    nav.search = `canal=web&correo=${WEB_REQUEST}`;
    const list = vi.spyOn(requestsApi, "list").mockResolvedValue({ data: [webRequest], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } });
    vi.spyOn(requestsApi, "get").mockResolvedValue(webRequest);
    renderWithQuery(<BandejaView />);

    expect(await screen.findByRole("heading", { name: "Nueva reserva SM-20261110-9E49B1" })).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ channel: "WEBSITE", limit: 50 });
    expect(conversationsApi.list).not.toHaveBeenCalledWith(expect.objectContaining({ channel: "WEBSITE" }));
    expect(screen.getByText("Es el cumpleaños de mi mamá")).toBeInTheDocument();
    expect(screen.getByText("CRM: correo del formulario: ana@example.com")).toBeInTheDocument();
    expect(screen.getByText(/no se responden desde el CRM/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Mensaje" })).not.toBeInTheDocument();
    // Sin la columna del cliente: el correo no es una conversación.
    expect(screen.queryByRole("complementary", { name: "Datos del cliente" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver solicitud RES-2026-000466" })).toHaveAttribute(
      "href",
      `/solicitudes?solicitud=${WEB_REQUEST}`,
    );
  });

  it("con lista y correo a la vista abre el primer correo", async () => {
    window.innerWidth = 1440;
    nav.search = "canal=web";
    vi.spyOn(requestsApi, "list").mockResolvedValue({ data: [webRequest], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } });
    renderWithQuery(<BandejaView />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/bandeja?canal=web&correo=${WEB_REQUEST}`, { scroll: false }));
  });
});
