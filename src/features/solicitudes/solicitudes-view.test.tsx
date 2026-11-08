import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { catalogApi, requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { Paginated, ReservationRequest, ReservationRequestListQuery } from "@/lib/api/types";
import type { Action, RoleCode, ViewKey } from "@/lib/auth/permissions";
import { renderWithQuery } from "@/test/render";
import { SolicitudesView } from "./solicitudes-view";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
const session = vi.hoisted(() => ({ roles: ["OPERATOR"] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => "/solicitudes",
  useSearchParams: () => new URLSearchParams(nav.search),
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

vi.mock("@/lib/restaurant", () => ({
  useRestaurant: () => ({ config: null, timeZone: "America/Lima", currency: "PEN", missing: false, isLoading: false, error: null }),
}));

function makeRequest(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    id: "0b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a00",
    code: "RES-2026-000042",
    customerId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    commercialItemId: null,
    sourceChannel: "WHATSAPP",
    reservationAt: "2026-11-20T01:00:00.000Z",
    numberOfPeople: 4,
    quotedPrice: null,
    currency: null,
    comments: null,
    specialRequirements: null,
    status: "ACCEPTED",
    createdAt: "2026-11-02T15:00:00.000Z",
    updatedAt: "2026-11-02T16:00:00.000Z",
    customer: { id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", firstName: "Ana", lastName: "Prueba", phone: "+51987654321", email: null },
    commercialItem: null,
    ...overrides,
  };
}

function page(data: ReservationRequest[], total = data.length, pageNumber = 1): Paginated<ReservationRequest> {
  return { data, pagination: { page: pageNumber, limit: 50, total, totalPages: Math.max(1, Math.ceil(total / 50)) } };
}

/** Los KPI piden `limit: 1` por estado y usan `total`; la tabla pide la página de la pestaña. */
const COUNTS: Record<string, number> = { SENT_TO_OWNER: 2, WAITING_RESPONSE: 1, ACCEPTED: 7, REJECTED: 3 };

function mockBackend(list: () => Promise<Paginated<ReservationRequest>>) {
  return vi.spyOn(requestsApi, "list").mockImplementation(async (query: ReservationRequestListQuery) => {
    if (query.limit === 1 && query.status) return page([], COUNTS[query.status] ?? 0);
    return list();
  });
}

beforeEach(() => {
  nav.search = "";
  session.roles = ["OPERATOR"];
});

afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe("Solicitudes: estados de carga y error", () => {
  it("si falla una actualización en segundo plano, conserva la tabla y avisa", async () => {
    let fail = false;
    mockBackend(async () => {
      if (fail) throw new ApiError(503, ["El servidor del CRM no está disponible en este momento."]);
      return page([makeRequest()]);
    });
    const { client } = renderWithQuery(<SolicitudesView />);

    expect(await screen.findByText("RES-2026-000042")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    fail = true;
    await act(() => client.refetchQueries({ queryKey: qk.requestsAll }).catch(() => undefined));

    expect(await screen.findByText(/No se pudo actualizar la lista/)).toBeInTheDocument();
    expect(screen.getByText("RES-2026-000042")).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo cargar las solicitudes/)).not.toBeInTheDocument();
  });

  it("sin conexión no muestra «no hay solicitudes» ni KPI en 0", async () => {
    onlineManager.setOnline(false);
    const list = mockBackend(async () => page([]));
    renderWithQuery(<SolicitudesView />);

    expect(await screen.findByText("Sin conexión. Se cargará al recuperar la red.")).toBeInTheDocument();
    expect(screen.queryByText("No hay solicitudes en esta pestaña.")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it("si la primera carga falla, muestra el error con Reintentar", async () => {
    mockBackend(async () => {
      throw new ApiError(503, ["El servidor del CRM no está disponible en este momento."]);
    });
    renderWithQuery(<SolicitudesView />);

    expect(await screen.findByText("No se pudo cargar las solicitudes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("No hay solicitudes en esta pestaña.")).not.toBeInTheDocument();
  });

  it("distingue una pestaña vacía de una página que ya no existe", async () => {
    mockBackend(async () => page([]));
    const first = renderWithQuery(<SolicitudesView />);
    expect(await screen.findByText("No hay solicitudes en esta pestaña.")).toBeInTheDocument();
    first.unmount();

    nav.search = "pagina=3";
    mockBackend(async () => page([], 5, 3));
    renderWithQuery(<SolicitudesView />);
    expect(await screen.findByText(/No hay solicitudes en esta página/)).toBeInTheDocument();
    screen.getByRole("button", { name: "Ir a la primera página" }).click();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/solicitudes", { scroll: false }));
  });
});

const EMPTY_CATALOG = { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };

describe("Solicitudes: textos del flujo del dueño y página", () => {
  it("no promete el envío al dueño y avisa que esas pestañas llegarán próximamente", async () => {
    nav.search = "tab=aceptadas";
    mockBackend(async () => page([makeRequest()]));
    renderWithQuery(<SolicitudesView />);

    expect(await screen.findByText("RES-2026-000042")).toBeInTheDocument();
    expect(screen.queryByText(/Samanta envía cada solicitud/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Flujo del dueño: próximamente")).toHaveLength(3);
    expect(screen.getByText(/Esta pestaña depende del envío al dueño/)).toBeInTheDocument();
  });

  it("en «Todas» no muestra el aviso de la pestaña", async () => {
    mockBackend(async () => page([makeRequest()]));
    renderWithQuery(<SolicitudesView />);
    await screen.findByText("RES-2026-000042");
    expect(screen.queryByText(/Esta pestaña depende del envío al dueño/)).not.toBeInTheDocument();
  });

  it.each(["2.5", "1000001", "-3"])("lee `pagina=%s` con parsePage y pide la página 1", async (raw) => {
    nav.search = `pagina=${raw}`;
    const list = mockBackend(async () => page([makeRequest()]));
    renderWithQuery(<SolicitudesView />);
    await screen.findByText("RES-2026-000042");
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 50 });
  });
});

describe("Solicitudes: acciones por permiso y estado", () => {
  it("OWNER solo consulta: sin «Nueva solicitud», Editar ni Cancelar", async () => {
    session.roles = ["OWNER"];
    mockBackend(async () => page([makeRequest({ status: "READY_TO_SEND" })]));
    renderWithQuery(<SolicitudesView />);

    await screen.findByText("RES-2026-000042");
    expect(screen.queryByRole("button", { name: "Nueva solicitud" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar la solicitud/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancelar la solicitud/ })).not.toBeInTheDocument();
  });

  it("solo ofrece editar y cancelar en «Negociando» y «Lista para enviar»", async () => {
    mockBackend(async () =>
      page([
        makeRequest({ id: "a", code: "RES-1", status: "INCOMPLETE_DATA" }),
        makeRequest({ id: "b", code: "RES-2", status: "ACCEPTED" }),
        makeRequest({ id: "c", code: "RES-3", status: "CANCELLED" }),
      ]),
    );
    renderWithQuery(<SolicitudesView />);

    expect(await screen.findByRole("button", { name: "Editar la solicitud RES-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar la solicitud RES-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva solicitud" })).toBeInTheDocument();
    for (const code of ["RES-2", "RES-3"]) {
      expect(screen.queryByRole("button", { name: `Editar la solicitud ${code}` })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Cancelar la solicitud ${code}` })).not.toBeInTheDocument();
    }
  });

  it("cancela solo tras confirmar y avisa del resultado", async () => {
    const request = makeRequest({ status: "READY_TO_SEND" });
    mockBackend(async () => page([request]));
    const cancel = vi.spyOn(requestsApi, "cancel").mockResolvedValue({ ...request, status: "CANCELLED" });
    renderWithQuery(<SolicitudesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar la solicitud RES-2026-000042" }));
    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la solicitud?" });
    expect(within(dialog).getByText(/Es un estado final/)).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar solicitud" }));
    expect(await screen.findByText("Se canceló la solicitud RES-2026-000042.")).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledExactlyOnceWith(request.id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si la cancelación responde 409, muestra el motivo y no cierra", async () => {
    const request = makeRequest({ status: "READY_TO_SEND" });
    mockBackend(async () => page([request]));
    vi.spyOn(requestsApi, "cancel").mockRejectedValue(new ApiError(409, ["La solicitud no admite modificaciones en su estado actual"]));
    renderWithQuery(<SolicitudesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar la solicitud RES-2026-000042" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));
    expect(await screen.findByText(/La solicitud no admite modificaciones en su estado actual/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "¿Cancelar la solicitud?" })).toBeInTheDocument();
  });

  it("edita solo lo que cambió y no reenvía una fecha ya pasada", async () => {
    const request = makeRequest({ status: "READY_TO_SEND", reservationAt: "2026-01-10T01:00:00.000Z", numberOfPeople: 4 });
    mockBackend(async () => page([request]));
    vi.spyOn(catalogApi, "items").mockResolvedValue(EMPTY_CATALOG);
    const update = vi.spyOn(requestsApi, "update").mockResolvedValue({ ...request, numberOfPeople: 6 });
    renderWithQuery(<SolicitudesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar la solicitud RES-2026-000042" }));
    const dialog = screen.getByRole("dialog", { name: "Editar RES-2026-000042" });
    const save = within(dialog).getByRole("button", { name: "Guardar cambios" });
    expect(save).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Personas"), { target: { value: "6" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(await screen.findByText("Se guardó la solicitud RES-2026-000042: ahora está «Lista para enviar».")).toBeInTheDocument();
    expect(update).toHaveBeenCalledExactlyOnceWith(request.id, { numberOfPeople: 6 });
  });
});
