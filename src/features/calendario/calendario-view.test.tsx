import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { catalogApi, customersApi, reservationsApi } from "@/lib/api/endpoints";
import type { Reservation } from "@/lib/api/types";
import type { Action, RoleCode, ViewKey } from "@/lib/auth/permissions";
import { isoToZonedInputs, zonedInputsToIso } from "@/lib/format/date-inputs";
import { renderWithQuery } from "@/test/render";
import { CalendarioView } from "./calendario-view";
import { CONFIG_MISSING_MESSAGE } from "./reservation-actions";
import { CUSTOMER_ID, EMPTY_ITEMS, hoursFromNow, makeCustomer, makeReservation, page } from "./reservation-fixtures";

const LIMA = "America/Lima";
const NEW_ID = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
const session = vi.hoisted(() => ({ roles: ["ADMIN"] as string[] }));
const restaurant = vi.hoisted(() => ({ missing: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => "/calendario",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/auth/session", async () => {
  const permissions = await import("@/lib/auth/permissions");
  return {
    useSession: () => {
      const roles = session.roles as RoleCode[];
      return {
        user: { id: "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35", sessionId: "s-1", firstName: "Ana", lastName: "Admin", email: "ana@example.com", roles },
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
  useRestaurant: () => ({
    config: null,
    timeZone: "America/Lima",
    currency: "PEN",
    missing: restaurant.missing,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** Un día futuro (nunca hoy) en la zona del restaurante. */
const futureDay = () => isoToZonedInputs(hoursFromNow(24 * 6), LIMA).day;

function mockBackend(rows: Reservation[] = []) {
  vi.spyOn(customersApi, "list").mockResolvedValue(page([makeCustomer()]));
  vi.spyOn(customersApi, "get").mockResolvedValue(makeCustomer());
  vi.spyOn(catalogApi, "items").mockResolvedValue(EMPTY_ITEMS);
  return vi.spyOn(reservationsApi, "list").mockResolvedValue(page(rows));
}

async function openDialog() {
  fireEvent.click((await screen.findAllByRole("button", { name: "Nueva reserva" }))[0]!);
  return screen.getByRole("dialog", { name: "Nueva reserva" });
}

async function fillForm(dialog: HTMLElement, day = futureDay()) {
  const search = within(dialog).getByLabelText("Cliente");
  fireEvent.change(search, { target: { value: "Carlos" } });
  fireEvent.click(await within(dialog).findByRole("button", { name: /Carlos Quispe/ }));
  fireEvent.change(within(dialog).getByLabelText("Fecha y hora: día"), { target: { value: day } });
  fireEvent.change(within(dialog).getByLabelText("Fecha y hora: hora"), { target: { value: "20:00" } });
  fireEvent.change(within(dialog).getByLabelText("Personas"), { target: { value: "4" } });
}

beforeEach(() => {
  nav.search = "";
  nav.replace.mockClear();
  session.roles = ["ADMIN"];
  restaurant.missing = false;
});

afterEach(() => vi.restoreAllMocks());

describe("Calendario: textos y estado vacío", () => {
  it("ADMIN ve cómo se registran las reservas y el botón «Nueva reserva»", async () => {
    mockBackend();
    renderWithQuery(<CalendarioView />);

    expect(await screen.findByText("Sin reservas esta semana.")).toBeInTheDocument();
    expect(screen.getByText(/Las reservas se registran con «Nueva reserva»/)).toBeInTheDocument();
    // Una en el encabezado y otra en el estado vacío.
    expect(screen.getAllByRole("button", { name: "Nueva reserva" })).toHaveLength(2);
    expect(screen.getByText(/^Reservas registradas, sin las canceladas\. Semana del/)).toBeInTheDocument();
    expect(screen.queryByText(/aceptadas/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("OPERATOR no puede crear: el estado vacío explica que lo hace un administrador", async () => {
    session.roles = ["OPERATOR"];
    mockBackend();
    nav.search = "vista=mes";
    renderWithQuery(<CalendarioView />);

    expect(await screen.findByText("Sin reservas este mes.")).toBeInTheDocument();
    expect(screen.getByText(/Las reservas las registra un administrador con «Nueva reserva»/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva reserva" })).not.toBeInTheDocument();
  });

  it("con reservas no muestra el estado vacío", async () => {
    const reservationAt = hoursFromNow(30);
    mockBackend([makeReservation({ reservationAt })]);
    nav.search = `vista=dia&fecha=${isoToZonedInputs(reservationAt, LIMA).day}`;
    renderWithQuery(<CalendarioView />);
    expect(await screen.findByText("Carlos Quispe")).toBeInTheDocument();
    expect(screen.queryByText("Sin reservas este día.")).not.toBeInTheDocument();
  });
});

describe("Calendario: nueva reserva", () => {
  it("crea la reserva con la hora del restaurante, deshabilita mientras guarda y abre su detalle", async () => {
    const list = mockBackend();
    const day = futureDay();
    const reservationAt = zonedInputsToIso({ day, time: "20:00" }, LIMA)!;
    let resolve: (value: Reservation) => void = () => undefined;
    const create = vi.spyOn(reservationsApi, "create").mockReturnValue(new Promise((r) => (resolve = r)));
    vi.spyOn(reservationsApi, "get").mockResolvedValue({ ...makeReservation({ id: NEW_ID }), noteHistory: [], rescheduleHistory: [] });
    renderWithQuery(<CalendarioView />);

    const dialog = await openDialog();
    expect(within(dialog).getByLabelText("Cliente")).toHaveFocus();
    await fillForm(dialog, day);
    fireEvent.change(within(dialog).getByLabelText("Notas (opcional)"), { target: { value: "  Aniversario " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear reserva" }));

    const saving = await within(dialog).findByRole("button", { name: "Guardando…" });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(create).toHaveBeenCalledExactlyOnceWith({ customerId: CUSTOMER_ID, reservationAt, numberOfPeople: 4, notes: "Aniversario" });

    const callsBefore = list.mock.calls.length;
    resolve(makeReservation({ id: NEW_ID, reservationAt }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(nav.replace).toHaveBeenCalledWith(`/calendario?reserva=${NEW_ID}&fecha=${day}`, { scroll: false });
    // Se vuelve a leer el calendario.
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("no envía un formulario incompleto y marca cada campo", async () => {
    mockBackend();
    const create = vi.spyOn(reservationsApi, "create");
    renderWithQuery(<CalendarioView />);

    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear reserva" }));
    expect(await within(dialog).findByText("Elige un cliente.")).toBeInTheDocument();
    expect(within(dialog).getByText("Elige el día y la hora.")).toBeInTheDocument();
    expect(within(dialog).getByText("Escribe un número entero mayor o igual a 1.")).toBeInTheDocument();
    expect(within(dialog).getByText("Revisa los campos marcados.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Fecha y hora: día"), { target: { value: isoToZonedInputs(hoursFromNow(-48), LIMA).day } });
    fireEvent.change(within(dialog).getByLabelText("Fecha y hora: hora"), { target: { value: "20:00" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear reserva" }));
    expect(await within(dialog).findByText("Elige una fecha y hora futuras.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("el 409 de configuración enlaza a Ajustes › Empresa", async () => {
    mockBackend();
    vi.spyOn(reservationsApi, "create").mockRejectedValue(new ApiError(409, [CONFIG_MISSING_MESSAGE]));
    renderWithQuery(<CalendarioView />);

    const dialog = await openDialog();
    await fillForm(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear reserva" }));
    expect(await within(dialog).findByText(CONFIG_MISSING_MESSAGE, { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Ir a Ajustes › Empresa" })).toHaveAttribute("href", "/ajustes/empresa");
    expect(within(dialog).getByRole("button", { name: "Crear reserva" })).toBeEnabled();
  });

  it("el 400 de fecha del servidor se muestra junto al campo", async () => {
    mockBackend();
    vi.spyOn(reservationsApi, "create").mockRejectedValue(
      new ApiError(400, ["La fecha de reserva debe ser válida y futura"], undefined, {
        statusCode: 400,
        message: "La fecha de reserva debe ser válida y futura",
      }),
    );
    renderWithQuery(<CalendarioView />);

    const dialog = await openDialog();
    await fillForm(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear reserva" }));
    expect(await within(dialog).findByText("La fecha de reserva debe ser válida y futura")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Fecha y hora: día")).toHaveAttribute("aria-invalid", "true");
  });

  it("tras un error de conexión pide revisar el calendario antes de repetir", async () => {
    const list = mockBackend();
    vi.spyOn(reservationsApi, "create").mockRejectedValue(
      new ApiError(504, ["El servidor del CRM tardó demasiado en responder. Inténtalo de nuevo."], "BACKEND_UNAVAILABLE"),
    );
    renderWithQuery(<CalendarioView />);

    const dialog = await openDialog();
    await fillForm(dialog);
    const callsBefore = list.mock.calls.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear reserva" }));
    expect(await within(dialog).findByText(/No se pudo confirmar si la reserva se creó/)).toBeInTheDocument();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("sin configuración del restaurante avisa y no deja crear", async () => {
    restaurant.missing = true;
    mockBackend();
    renderWithQuery(<CalendarioView />);

    const dialog = await openDialog();
    expect(within(dialog).getByText(/El restaurante aún no está configurado/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Ajustes › Empresa" })).toHaveAttribute("href", "/ajustes/empresa");
    expect(within(dialog).getByRole("button", { name: "Crear reserva" })).toBeDisabled();
  });
});
