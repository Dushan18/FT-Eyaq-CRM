import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { catalogApi, customersApi, reservationsApi, usersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ReservationDetail } from "@/lib/api/types";
import type { Action, RoleCode, ViewKey } from "@/lib/auth/permissions";
import { isoToZonedInputs, zonedInputsToIso } from "@/lib/format/date-inputs";
import { renderWithQuery } from "@/test/render";
import { ReservationDetailPanel } from "./reservation-detail";
import {
  EMPTY_ITEMS,
  ME_ID,
  OTHER_ID,
  RESERVATION_ID,
  hoursFromNow,
  makeCustomer,
  makeDetail,
  makeNote,
  makeRescheduleEntry,
  makeReservation,
  makeUser,
} from "./reservation-fixtures";

const LIMA = "America/Lima";
const LATER = "2026-11-02T12:00:00.000Z";

const session = vi.hoisted(() => ({ roles: ["ADMIN"] as string[], userId: "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35" }));

vi.mock("@/lib/auth/session", async () => {
  const permissions = await import("@/lib/auth/permissions");
  return {
    useSession: () => {
      const roles = session.roles as RoleCode[];
      return {
        user: { id: session.userId, sessionId: "s-1", firstName: "María", lastName: "Huamán", email: "maria@example.com", roles },
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

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function mockDetail(detail: ReservationDetail) {
  vi.spyOn(customersApi, "get").mockResolvedValue(makeCustomer());
  vi.spyOn(catalogApi, "items").mockResolvedValue(EMPTY_ITEMS);
  return vi.spyOn(reservationsApi, "get").mockResolvedValue(detail);
}

const renderPanel = () => renderWithQuery(<ReservationDetailPanel reservationId={RESERVATION_ID} enabled />);

beforeEach(() => {
  session.roles = ["ADMIN"];
});

afterEach(() => vi.restoreAllMocks());

describe("Detalle de reserva: estado", () => {
  it("«Marcar como preparada» pide confirmación sin decir que no se puede deshacer y conserva las observaciones", async () => {
    const detail = makeDetail({ noteHistory: [makeNote()] });
    const get = mockDetail(detail);
    const updated = makeReservation({ status: "UPCOMING", updatedAt: LATER });
    const setStatus = vi.spyOn(reservationsApi, "setStatus").mockImplementation(async () => {
      get.mockResolvedValue({ ...detail, ...updated });
      return updated;
    });
    const { client } = renderPanel();

    expect(await screen.findByText("Pidió mesa junto a la ventana")).toBeInTheDocument();
    // La hora aún no llega: Iniciar servicio y No asistió esperan.
    expect(screen.getByRole("button", { name: "Iniciar servicio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No asistió" })).toBeDisabled();
    expect(screen.getByText(/se habilitan a la hora de la reserva/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Marcar como preparada" }));
    expect(screen.getByText(/salvo que la reprogrames/)).toBeInTheDocument();
    expect(screen.queryByText(/No se puede deshacer/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver" })).toHaveFocus();
    expect(setStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Estado actualizado: Preparada.")).toBeInTheDocument();
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, "UPCOMING");
    expect(screen.queryByRole("button", { name: "Marcar como preparada" })).not.toBeInTheDocument();
    expect(screen.getByText("Pidió mesa junto a la ventana")).toBeInTheDocument();
    expect(client.getQueryData<ReservationDetail>(qk.reservation(RESERVATION_ID))).toMatchObject({
      status: "UPCOMING",
      noteHistory: [makeNote()],
    });
  });

  it("los estados finales piden confirmación y «Volver» no envía nada", async () => {
    mockDetail(makeDetail());
    const setStatus = vi.spyOn(reservationsApi, "setStatus").mockResolvedValue(makeReservation({ status: "CANCELLED", updatedAt: LATER }));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    expect(screen.getByText(/una reserva cancelada no se puede reactivar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toHaveFocus();
    expect(setStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Estado actualizado: Cancelada.")).toBeInTheDocument();
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, "CANCELLED");
    // Finalizada: sin botones de estado, sin Editar ni Reprogramar; las observaciones siguen abiertas.
    expect(screen.queryByRole("group", { name: "Cambiar estado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.getByText(/Reserva finalizada/)).toBeInTheDocument();
    expect(screen.getByLabelText("Nueva observación")).toBeInTheDocument();
  });

  it("ya llegada la hora, «Iniciar servicio» se aplica sin confirmar; un 409 se muestra y refresca el detalle", async () => {
    const get = mockDetail(makeDetail({ reservationAt: hoursFromNow(-1) }));
    const setStatus = vi
      .spyOn(reservationsApi, "setStatus")
      .mockRejectedValue(new ApiError(409, ["Todavía no ha llegado la hora de la reserva"]));
    renderPanel();

    const start = await screen.findByRole("button", { name: "Iniciar servicio" });
    expect(start).toBeEnabled();
    expect(screen.queryByText(/se habilitan a la hora de la reserva/)).not.toBeInTheDocument();
    fireEvent.click(start);

    expect(await screen.findByText("No se pudo cambiar el estado. Todavía no ha llegado la hora de la reserva")).toBeInTheDocument();
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, "IN_SERVICE");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("desde Reprogramada se puede volver a confirmar; en servicio solo se completa", async () => {
    mockDetail(makeDetail({ status: "RESCHEDULED" }));
    const first = renderPanel();
    expect(await screen.findByRole("button", { name: "Confirmar nueva fecha" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Marcar como preparada" })).toBeEnabled();
    first.unmount();
    vi.restoreAllMocks();

    mockDetail(makeDetail({ status: "IN_SERVICE", reservationAt: hoursFromNow(-1) }));
    renderPanel();
    expect(await screen.findByRole("button", { name: "Marcar como completada" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });
});

describe("Detalle de reserva: editar y reprogramar", () => {
  it("«Editar» envía solo lo que cambió y nunca la fecha", async () => {
    mockDetail(makeDetail());
    const update = vi
      .spyOn(reservationsApi, "update")
      .mockResolvedValue(makeReservation({ numberOfPeople: 6, notes: null, updatedAt: LATER }));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog", { name: "Editar reserva R-2026-000015" });
    const people = within(dialog).getByLabelText("Personas");
    expect(people).toHaveFocus();
    const save = within(dialog).getByRole("button", { name: "Guardar cambios" });
    expect(save).toBeDisabled();

    fireEvent.change(people, { target: { value: "6" } });
    fireEvent.change(within(dialog).getByLabelText("Notas"), { target: { value: "   " } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(update).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, { numberOfPeople: 6, notes: null });
    // El panel muestra la respuesta del PATCH: 6 personas y sin notas.
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.queryByText("Cumpleaños")).not.toBeInTheDocument();
  });

  it("«Editar» muestra el error del backend junto al campo", async () => {
    mockDetail(makeDetail());
    vi.spyOn(reservationsApi, "update").mockRejectedValue(
      new ApiError(400, ["numberOfPeople must not be greater than 2147483647"], undefined, {
        statusCode: 400,
        message: ["numberOfPeople must not be greater than 2147483647"],
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Personas"), { target: { value: "9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(dialog).findByText("El valor máximo es 2147483647.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Personas")).toHaveAttribute("aria-invalid", "true");
  });

  it("«Reprogramar» envía la fecha nueva en la zona del restaurante con el motivo y muestra el historial", async () => {
    const detail = makeDetail();
    const get = mockDetail(detail);
    const day = isoToZonedInputs(hoursFromNow(24 * 6), LIMA).day;
    const newAt = zonedInputsToIso({ day, time: "13:00" }, LIMA)!;
    const updated = makeReservation({ status: "RESCHEDULED", reservationAt: newAt, updatedAt: LATER });
    const reschedule = vi.spyOn(reservationsApi, "reschedule").mockImplementation(async () => {
      get.mockResolvedValue({ ...detail, ...updated, rescheduleHistory: [makeRescheduleEntry({ reason: "Cambio de horario" })] });
      return updated;
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Reprogramar" }));
    const dialog = screen.getByRole("dialog", { name: "Reprogramar reserva R-2026-000015" });
    expect(within(dialog).getByLabelText("Nueva fecha y hora: día")).toHaveFocus();

    // Sin cambiar la fecha no se envía.
    fireEvent.click(within(dialog).getByRole("button", { name: "Reprogramar" }));
    expect(await within(dialog).findByText("Elige una fecha u hora distinta de la actual.")).toBeInTheDocument();
    expect(reschedule).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Nueva fecha y hora: día"), { target: { value: day } });
    fireEvent.change(within(dialog).getByLabelText("Nueva fecha y hora: hora"), { target: { value: "13:00" } });
    fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), { target: { value: " Cambio de horario " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reprogramar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(reschedule).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, { reservationAt: newAt, reason: "Cambio de horario" });
    expect(await screen.findByRole("region", { name: "Cambios de fecha" })).toHaveTextContent("Cambio de horario");
    expect(screen.getAllByText("Reprogramada").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Confirmar nueva fecha" })).toBeInTheDocument();
  });

  it("una fecha pasada no se envía", async () => {
    mockDetail(makeDetail());
    const reschedule = vi.spyOn(reservationsApi, "reschedule");
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Reprogramar" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nueva fecha y hora: día"), {
      target: { value: isoToZonedInputs(hoursFromNow(-48), LIMA).day },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reprogramar" }));
    expect(await within(dialog).findByText("Elige una fecha y hora futuras.")).toBeInTheDocument();
    expect(reschedule).not.toHaveBeenCalled();
  });
});

describe("Detalle de reserva: responsable", () => {
  it("ADMIN elige entre los usuarios activos con ADMIN u OPERATOR y ve el aviso de responsable no elegible", async () => {
    mockDetail(
      makeDetail({
        assignedUserId: OTHER_ID,
        assignedUser: { id: OTHER_ID, firstName: "Pedro", lastName: "Salas", isActive: false, isEligible: false },
      }),
    );
    vi.spyOn(usersApi, "list").mockResolvedValue([
      makeUser(ME_ID, "María", ["ADMIN"]),
      makeUser("b1", "Beto", ["OWNER"]),
      makeUser("a1", "Ana", ["OPERATOR"]),
      makeUser("c1", "Ciro", ["OPERATOR"], false),
    ]);
    const assign = vi.spyOn(reservationsApi, "assign").mockResolvedValue(
      makeReservation({
        assignedUserId: "a1",
        assignedUser: { id: "a1", firstName: "Ana", lastName: "Prueba", isActive: true, isEligible: true },
        updatedAt: LATER,
      }),
    );
    renderPanel();

    expect(await screen.findByText(/Pedro Salas ya no puede atender reservas/)).toHaveTextContent("Elige otro responsable.");
    const select = screen.getByLabelText("Cambiar responsable");
    await waitFor(() => expect(select).toBeEnabled());
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Sin responsable",
      "Pedro Salas (no disponible)",
      "Ana Prueba",
      "María Prueba",
    ]);
    expect(screen.getByRole("button", { name: "Asignar" })).toBeDisabled();

    fireEvent.change(select, { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, { assignedUserId: "a1" }));
    const section = screen.getByRole("region", { name: "Responsable" });
    await waitFor(() => expect(section).not.toHaveTextContent("ya no puede atender"));
    expect(within(section).getByText("Ana Prueba", { selector: "span" })).toBeInTheDocument();
  });

  it("ADMIN puede dejarla sin responsable", async () => {
    mockDetail(
      makeDetail({
        assignedUserId: "a1",
        assignedUser: { id: "a1", firstName: "Ana", lastName: "Prueba", isActive: true, isEligible: true },
      }),
    );
    vi.spyOn(usersApi, "list").mockResolvedValue([makeUser("a1", "Ana", ["OPERATOR"])]);
    const assign = vi.spyOn(reservationsApi, "assign").mockResolvedValue(makeReservation({ updatedAt: LATER }));
    renderPanel();

    const select = await screen.findByLabelText("Cambiar responsable");
    await waitFor(() => expect(select).toBeEnabled());
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Quitar responsable" }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, { assignedUserId: null }));
  });

  it("OPERATOR toma una reserva libre sin listar usuarios; un 403 se muestra y refresca", async () => {
    session.roles = ["OPERATOR"];
    const get = mockDetail(makeDetail());
    const list = vi.spyOn(usersApi, "list");
    const assign = vi
      .spyOn(reservationsApi, "assign")
      .mockRejectedValue(new ApiError(403, ["Un operador solo puede tomar una reserva libre o gestionar su propia asignación"]));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Tomar" }));
    expect(
      await screen.findByText(
        "No se pudo cambiar el responsable. Un operador solo puede tomar una reserva libre o gestionar su propia asignación",
      ),
    ).toBeInTheDocument();
    expect(assign).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, { assignedUserId: ME_ID });
    expect(list).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Cambiar responsable")).not.toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("OPERATOR libera la suya y no ve acciones en la de otra persona", async () => {
    session.roles = ["OPERATOR"];
    const mine = { id: ME_ID, firstName: "María", lastName: "Huamán", isActive: true, isEligible: true };
    mockDetail(makeDetail({ assignedUserId: ME_ID, assignedUser: mine }));
    const assign = vi.spyOn(reservationsApi, "assign").mockResolvedValue(makeReservation({ updatedAt: LATER }));
    const first = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Liberar" }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, { assignedUserId: null }));
    expect(await screen.findByRole("button", { name: "Tomar" })).toBeInTheDocument();
    first.unmount();
    vi.restoreAllMocks();

    const other = { id: OTHER_ID, firstName: "Pedro", lastName: "Salas", isActive: true, isEligible: true };
    mockDetail(makeDetail({ assignedUserId: OTHER_ID, assignedUser: other }));
    renderPanel();
    const section = await screen.findByRole("region", { name: "Responsable" });
    expect(await within(section).findByText("Pedro Salas")).toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  });

  it("en un estado final nadie cambia el responsable", async () => {
    mockDetail(makeDetail({ status: "NO_SHOW", reservationAt: hoursFromNow(-5) }));
    renderPanel();
    const section = await screen.findByRole("region", { name: "Responsable" });
    expect(within(section).getByText("Sin responsable")).toBeInTheDocument();
    expect(within(section).queryByLabelText("Cambiar responsable")).not.toBeInTheDocument();
  });
});

describe("Detalle de reserva: observaciones e historial", () => {
  it("agrega una observación (también en estados finales) al final de la lista", async () => {
    mockDetail(makeDetail({ status: "COMPLETED", reservationAt: hoursFromNow(-3), noteHistory: [makeNote()] }));
    const note = makeNote({ id: "b8c4d2e6-0a1b-4c2d-9e3f-4a5b6c7d8e9f", content: "Dejó propina", createdAt: "2026-11-02T23:00:00.000Z" });
    const addNote = vi.spyOn(reservationsApi, "addNote").mockResolvedValue(note);
    renderPanel();

    const add = await screen.findByRole("button", { name: "Agregar observación" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nueva observación"), { target: { value: "  Dejó propina " } });
    fireEvent.click(add);

    const section = screen.getByRole("region", { name: "Observaciones" });
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(2));
    expect(addNote).toHaveBeenCalledExactlyOnceWith(RESERVATION_ID, "Dejó propina");
    expect(within(section).getAllByRole("listitem").map((li) => li.firstChild?.textContent)).toEqual([
      "Pidió mesa junto a la ventana",
      "Dejó propina",
    ]);
    expect(screen.getByLabelText("Nueva observación")).toHaveValue("");
  });

  it("tras un error de conexión avisa que la observación pudo guardarse", async () => {
    const get = mockDetail(makeDetail());
    vi.spyOn(reservationsApi, "addNote").mockRejectedValue(new ApiError(504, ["Tardó demasiado."], "BACKEND_UNAVAILABLE"));
    renderPanel();
    fireEvent.change(await screen.findByLabelText("Nueva observación"), { target: { value: "Alergia al maní" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar observación" }));
    expect(await screen.findByText(/No se pudo confirmar si la observación se guardó/)).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("muestra los cambios de fecha con motivo y autor", async () => {
    mockDetail(makeDetail({ status: "RESCHEDULED", rescheduleHistory: [makeRescheduleEntry()] }));
    renderPanel();
    const history = await screen.findByRole("region", { name: "Cambios de fecha" });
    expect(history).toHaveTextContent("Sáb 7 nov · 20:00");
    expect(history).toHaveTextContent("Dom 8 nov · 13:00");
    expect(history).toHaveTextContent("Cliente solicitó cambio de horario");
    expect(history).toHaveTextContent("María Huamán");
  });
});

describe("Detalle de reserva: origen y roles", () => {
  it("la etiqueta de origen sigue el dato real", async () => {
    mockDetail(makeDetail());
    const first = renderPanel();
    expect(await screen.findByText("Registrada en el CRM")).toBeInTheDocument();
    expect(screen.queryByText("Aceptada por el propietario")).not.toBeInTheDocument();
    first.unmount();
    vi.restoreAllMocks();

    mockDetail(makeDetail({ reservationRequestId: "0b7f8a52-6c2d-4e1f-9a3b-5d4c3e2f1a00" }));
    renderPanel();
    expect(await screen.findByText("Aceptada por el propietario")).toBeInTheDocument();
  });

  it("OWNER solo lee: sin cambios de estado, edición, responsable ni observaciones nuevas", async () => {
    session.roles = ["OWNER"];
    mockDetail(makeDetail({ noteHistory: [makeNote()] }));
    renderPanel();
    expect(await screen.findByText("Pidió mesa junto a la ventana")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar como preparada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tomar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva observación")).not.toBeInTheDocument();
  });
});
