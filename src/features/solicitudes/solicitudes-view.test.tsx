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
    externalReference: null,
    customerId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    commercialItemId: null,
    conversationId: null,
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

describe("Solicitudes: textos del flujo del propietario y página", () => {
  it("describe el flujo real y ya no dice que el flujo del dueño llegará próximamente", async () => {
    nav.search = "tab=aceptadas";
    mockBackend(async () => page([makeRequest()]));
    renderWithQuery(<SolicitudesView />);

    expect(await screen.findByText("RES-2026-000042")).toBeInTheDocument();
    expect(screen.getByText(/se envían al WhatsApp del propietario; cuando las acepta, la reserva entra al calendario/)).toBeInTheDocument();
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Esta pestaña depende del envío al dueño/)).not.toBeInTheDocument();
    // KPI con datos: Esperando = SENT_TO_OWNER + WAITING_RESPONSE.
    expect(within(screen.getByText("Esperando al propietario").parentElement!).getByText("3")).toBeInTheDocument();
  });

  it("«Cambio propuesto» tiene pestaña y KPI propios, y avisa que necesita a una persona", async () => {
    COUNTS.MODIFICATION_REQUESTED = 2;
    const list = mockBackend(async () => page([makeRequest({ status: "MODIFICATION_REQUESTED" })]));
    try {
      const first = renderWithQuery(<SolicitudesView />);
      expect(await screen.findByText(/2 solicitudes tienen un cambio propuesto por el propietario/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Ver" }));
      expect(nav.replace).toHaveBeenCalledWith("/solicitudes?tab=cambio", { scroll: false });
      first.unmount();

      nav.search = "tab=cambio";
      renderWithQuery(<SolicitudesView />);
      expect(await screen.findByText("RES-2026-000042")).toBeInTheDocument();
      expect(list).toHaveBeenCalledWith({ page: 1, limit: 50, status: "MODIFICATION_REQUESTED" });
      expect(screen.getByRole("tab", { name: "Cambio propuesto", selected: true })).toBeInTheDocument();
      // En su propia pestaña no se repite el aviso.
      expect(screen.queryByText(/tienen un cambio propuesto/)).not.toBeInTheDocument();
    } finally {
      delete COUNTS.MODIFICATION_REQUESTED;
    }
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
    expect(cancel).toHaveBeenCalledExactlyOnceWith(request.id, undefined);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("envía el motivo de la cancelación, recortado", async () => {
    const request = makeRequest({ status: "INCOMPLETE_DATA" });
    mockBackend(async () => page([request]));
    const cancel = vi.spyOn(requestsApi, "cancel").mockResolvedValue({ ...request, status: "CANCELLED" });
    renderWithQuery(<SolicitudesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar la solicitud RES-2026-000042" }));
    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la solicitud?" });
    fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), { target: { value: "  Reservó por teléfono  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar solicitud" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledExactlyOnceWith(request.id, "Reservó por teléfono"));
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

describe("Solicitudes: aprobar y rechazar (ADMIN y OWNER)", () => {
  const ROWS = () =>
    page([
      makeRequest({ id: "1b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a01", code: "RES-1", status: "INCOMPLETE_DATA" }),
      makeRequest({ id: "2b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a02", code: "RES-2", status: "READY_TO_SEND" }),
      makeRequest({ id: "3b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a03", code: "RES-3", status: "WAITING_RESPONSE" }),
      makeRequest({ id: "4b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a04", code: "RES-4", status: "MODIFICATION_REQUESTED" }),
      makeRequest({ id: "5b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a05", code: "RES-5", status: "ACCEPTED" }),
    ]);

  it("OWNER aprueba en Lista/Enviada/Esperando y rechaza también en Negociando; no edita ni cancela", async () => {
    session.roles = ["OWNER"];
    mockBackend(async () => ROWS());
    renderWithQuery(<SolicitudesView />);

    await screen.findByText("RES-1");
    const has = (name: string) => screen.queryByRole("button", { name }) !== null;
    expect([1, 2, 3, 4, 5].map((n) => has(`Aprobar la solicitud RES-${n}`))).toEqual([false, true, true, false, false]);
    expect([1, 2, 3, 4, 5].map((n) => has(`Rechazar la solicitud RES-${n}`))).toEqual([true, true, true, false, false]);
    expect(has("Editar la solicitud RES-2")).toBe(false);
    expect(has("Cancelar la solicitud RES-2")).toBe(false);
  });

  it("OPERATOR no ve Aprobar ni Rechazar, y en Esperando tampoco Editar ni Cancelar (el backend responde 409)", async () => {
    mockBackend(async () => ROWS());
    renderWithQuery(<SolicitudesView />);

    await screen.findByText("RES-1");
    expect(screen.queryByRole("button", { name: /^Aprobar la solicitud/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rechazar la solicitud/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar la solicitud RES-2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar la solicitud RES-3" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar la solicitud RES-3" })).not.toBeInTheDocument();
  });

  it("aprobar pide confirmación, avisa que no se informa al cliente e invalida solicitudes, reservas y estadísticas", async () => {
    session.roles = ["ADMIN"];
    const request = makeRequest({ status: "WAITING_RESPONSE" });
    mockBackend(async () => page([request]));
    const approve = vi.spyOn(requestsApi, "approve").mockResolvedValue({
      request: { ...request, status: "ACCEPTED" },
      reservation: {
        id: "9d0f5a3e-6b1c-4e2a-8f7d-3c4b5a6e7f81",
        code: "R-2026-000031",
        reservationRequestId: request.id,
        customerId: request.customerId,
        commercialItemId: null,
        reservationAt: request.reservationAt!,
        numberOfPeople: 4,
        status: "CONFIRMED",
        notes: null,
        assignedUserId: null,
        assignedUser: null,
        createdAt: "2026-11-03T04:02:11.498Z",
        updatedAt: "2026-11-03T04:02:11.498Z",
        customer: request.customer,
        commercialItem: null,
      },
    });
    const { client } = renderWithQuery(<SolicitudesView />);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(await screen.findByRole("button", { name: "Aprobar la solicitud RES-2026-000042" }));
    const dialog = screen.getByRole("dialog", { name: "¿Aprobar la solicitud?" });
    expect(within(dialog).getByText("Aprobar o rechazar desde el CRM no avisa al cliente: avísale por la Bandeja.")).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Aprobar y crear la reserva" }));
    expect(await screen.findByText(/la reserva R-2026-000031 ya está en el calendario/)).toBeInTheDocument();
    expect(approve).toHaveBeenCalledExactlyOnceWith(request.id);
    for (const queryKey of [qk.requestsAll, qk.reservationsAll, qk.statsAll]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: qk.request(request.id) });
  });

  it("un 409 al aprobar se muestra tal cual y no cierra el diálogo", async () => {
    session.roles = ["OWNER"];
    const request = makeRequest({ status: "READY_TO_SEND" });
    mockBackend(async () => page([request]));
    vi.spyOn(requestsApi, "approve").mockRejectedValue(new ApiError(409, ["La fecha de la solicitud ya pasó: edítala antes de aprobarla"]));
    renderWithQuery(<SolicitudesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Aprobar la solicitud RES-2026-000042" }));
    fireEvent.click(screen.getByRole("button", { name: "Aprobar y crear la reserva" }));
    expect(await screen.findByText(/La fecha de la solicitud ya pasó: edítala antes de aprobarla/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "¿Aprobar la solicitud?" })).toBeInTheDocument();
  });

  it("rechazar envía el motivo opcional e invalida solicitudes y estadísticas (no el calendario)", async () => {
    session.roles = ["OWNER"];
    const request = makeRequest({ status: "INCOMPLETE_DATA" });
    mockBackend(async () => page([request]));
    const reject = vi.spyOn(requestsApi, "reject").mockResolvedValue({ ...request, status: "REJECTED" });
    const { client } = renderWithQuery(<SolicitudesView />);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(await screen.findByRole("button", { name: "Rechazar la solicitud RES-2026-000042" }));
    const dialog = screen.getByRole("dialog", { name: "¿Rechazar la solicitud?" });
    expect(within(dialog).getByText(/no avisa al cliente/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), { target: { value: " No hay mesas ese día " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rechazar solicitud" }));

    expect(await screen.findByText(/Se rechazó la solicitud RES-2026-000042/)).toBeInTheDocument();
    expect(reject).toHaveBeenCalledExactlyOnceWith(request.id, "No hay mesas ese día");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.requestsAll });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.statsAll });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: qk.reservationsAll });
  });

  it("rechazar sin motivo no envía reason", async () => {
    session.roles = ["ADMIN"];
    const request = makeRequest({ status: "READY_TO_SEND" });
    mockBackend(async () => page([request]));
    const reject = vi.spyOn(requestsApi, "reject").mockResolvedValue({ ...request, status: "REJECTED" });
    renderWithQuery(<SolicitudesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Rechazar la solicitud RES-2026-000042" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
    await waitFor(() => expect(reject).toHaveBeenCalledExactlyOnceWith(request.id, undefined));
  });

  it("el código abre el detalle (solicitud en la URL)", async () => {
    mockBackend(async () => page([makeRequest()]));
    renderWithQuery(<SolicitudesView />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver la solicitud RES-2026-000042" }));
    expect(nav.replace).toHaveBeenCalledWith("/solicitudes?solicitud=0b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a00", { scroll: false });
  });
});
