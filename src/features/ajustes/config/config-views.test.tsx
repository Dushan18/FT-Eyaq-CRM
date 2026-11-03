import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { configApi, usersApi } from "@/lib/api/endpoints";
import type { PutRestaurantConfigRequest, RestaurantConfig } from "@/lib/api/types";
import type { Action, RoleCode, ViewKey } from "@/lib/auth/permissions";
import { renderWithQuery } from "@/test/render";
import { OWNER_2_ID, OWNER_ID, makeConfig, makeUser } from "./config-fixtures";
import { closedWeek, replaceSchedules, toPutRequest } from "./config-request";
import { SCHEDULE_MESSAGES } from "./config-schema";
import { NOT_CONFIGURED_TEXT, READ_ONLY_TEXT } from "./config-ui";
import { EmpresaView } from "./empresa-view";
import { HorariosView } from "./horarios-view";
import { PoliticasView } from "./politicas-view";
import { SamantaView } from "./samanta-view";

const session = vi.hoisted(() => ({ roles: ["ADMIN"] as string[] }));

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

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOT_FOUND = new ApiError(404, ["Configuración del restaurante no encontrada"]);

/** Respuesta del PUT simulada: el backend guarda el cuerpo tal cual y devuelve la forma del GET. */
function afterPut(previous: RestaurantConfig | null, body: PutRestaurantConfigRequest): RestaurantConfig {
  const responsible = body.approvalResponsibleId
    ? { id: body.approvalResponsibleId, firstName: "Ricardo", lastName: "Mora", email: "ricardo@sabormagico.pe" }
    : null;
  return {
    ...(previous ?? makeConfig()),
    ...body,
    approvalResponsible: responsible,
    updatedAt: "2026-10-14T15:00:00.000Z",
  };
}

function mockBackend(config: RestaurantConfig | ApiError, fresh: RestaurantConfig | null = null) {
  const get =
    config instanceof ApiError
      ? vi.spyOn(configApi, "get").mockRejectedValue(config)
      : vi.spyOn(configApi, "get").mockResolvedValueOnce(config).mockResolvedValue(fresh ?? config);
  const put = vi
    .spyOn(configApi, "put")
    .mockImplementation(async (body) => afterPut(config instanceof ApiError ? null : (fresh ?? config), body));
  return { get, put };
}

const buttons = () => ({
  save: screen.getByRole("button", { name: "Guardar cambios" }),
  discard: screen.getByRole("button", { name: "Descartar" }),
});

beforeEach(() => {
  session.roles = ["ADMIN"];
});

afterEach(() => vi.restoreAllMocks());

describe("Políticas", () => {
  it("habilita los botones solo con cambios, relee la configuración y envía el objeto completo", async () => {
    const config = makeConfig();
    const { get, put } = mockBackend(config);
    renderWithQuery(<PoliticasView />);

    const policy = await screen.findByLabelText("Política de reserva");
    expect(buttons().save).toBeDisabled();
    expect(buttons().discard).toBeDisabled();

    fireEvent.change(policy, { target: { value: "Nueva política de reserva." } });
    expect(buttons().save).toBeEnabled();
    fireEvent.click(buttons().save);

    expect(await screen.findByText("Cambios guardados")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledExactlyOnceWith({ ...toPutRequest(config), reservationPolicy: "Nueva política de reserva." });
    expect(policy).toHaveValue("Nueva política de reserva.");
    expect(buttons().save).toBeDisabled();
    expect(buttons().discard).toBeDisabled();
  });

  it("Descartar vuelve a la configuración vigente", async () => {
    mockBackend(makeConfig());
    renderWithQuery(<PoliticasView />);
    const policy = await screen.findByLabelText("Política de cancelación");
    fireEvent.change(policy, { target: { value: "Otra cosa" } });
    fireEvent.click(buttons().discard);
    expect(policy).toHaveValue(makeConfig().cancellationPolicy);
    expect(buttons().save).toBeDisabled();
  });

  it("no envía una política vacía y la marca junto al campo", async () => {
    const { put } = mockBackend(makeConfig());
    renderWithQuery(<PoliticasView />);
    const policy = await screen.findByLabelText("Política de reserva");
    fireEvent.change(policy, { target: { value: "   " } });
    fireEvent.click(buttons().save);
    expect(await screen.findByText("Escribe la política de reserva.")).toBeInTheDocument();
    expect(screen.getByText("Revisa los campos marcados.")).toBeInTheDocument();
    expect(policy).toHaveAttribute("aria-invalid", "true");
    expect(put).not.toHaveBeenCalled();
  });

  it("muestra el error del backend y señala la pestaña donde se corrige", async () => {
    mockBackend(makeConfig());
    vi.spyOn(configApi, "put").mockRejectedValue(new ApiError(400, ["El responsable de aprobación debe estar activo"]));
    renderWithQuery(<PoliticasView />);
    fireEvent.change(await screen.findByLabelText("Política de reserva"), { target: { value: "Cambio" } });
    fireEvent.click(buttons().save);
    const alert = await screen.findByText("No se pudieron guardar los cambios.");
    const notice = alert.parentElement as HTMLElement;
    expect(within(notice).getByText("El responsable de aprobación debe estar activo")).toBeInTheDocument();
    expect(within(notice).getByRole("link", { name: "Samanta" })).toHaveAttribute("href", "/ajustes/samanta");
    expect(buttons().save).toBeEnabled();
  });

  it("OPERATOR ve los datos en solo lectura", async () => {
    session.roles = ["OPERATOR"];
    mockBackend(makeConfig());
    renderWithQuery(<PoliticasView />);
    expect(await screen.findByText(READ_ONLY_TEXT)).toBeInTheDocument();
    expect(screen.getByLabelText("Política de reserva")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });
});

describe("Horarios", () => {
  it("envía solo el día cambiado sobre la configuración releída (no pisa otros cambios)", async () => {
    const first = makeConfig();
    const fresh = makeConfig({
      schedules: first.schedules.map((s) => (s.dayOfWeek === "SUNDAY" ? { ...s, closeTime: "20:00" } : s)),
    });
    const { put } = mockBackend(first, fresh);
    renderWithQuery(<HorariosView />);

    fireEvent.change(await screen.findByLabelText("Cierre del martes"), { target: { value: "21:00" } });
    fireEvent.click(buttons().save);
    await screen.findByText("Cambios guardados");

    const tuesday = { dayOfWeek: "TUESDAY", isOpen: true, openTime: "12:00", closeTime: "21:00" } as const;
    expect(put).toHaveBeenCalledExactlyOnceWith(replaceSchedules(toPutRequest(fresh), [tuesday]));
    expect(screen.getByLabelText("Cierre del domingo")).toHaveValue("20:00");
  });

  it("rechaza el cierre a las 00:00 junto a la fila y no envía nada", async () => {
    const { put } = mockBackend(makeConfig());
    renderWithQuery(<HorariosView />);
    const close = await screen.findByLabelText("Cierre del viernes");
    fireEvent.change(close, { target: { value: "00:00" } });
    fireEvent.click(buttons().save);
    expect(await screen.findByText(SCHEDULE_MESSAGES.closeMidnight)).toBeInTheDocument();
    expect(close).toHaveAttribute("aria-invalid", "true");
    expect(put).not.toHaveBeenCalled();
  });

  it("al abrir un día cerrado pide sus horas; al volver a cerrarlo ya no hay cambios", async () => {
    mockBackend(makeConfig());
    renderWithQuery(<HorariosView />);
    const monday = await screen.findByRole("switch", { name: "Abierto el lunes" });
    fireEvent.click(monday);
    expect(screen.getByLabelText("Apertura del lunes")).toHaveValue("");
    fireEvent.click(buttons().save);
    expect(await screen.findByText(`${SCHEDULE_MESSAGES.openRequired} ${SCHEDULE_MESSAGES.closeRequired}`)).toBeInTheDocument();
    fireEvent.click(monday);
    expect(screen.queryByText(SCHEDULE_MESSAGES.openRequired, { exact: false })).toBeNull();
    expect(buttons().save).toBeDisabled();
  });
});

describe("Empresa", () => {
  it("normaliza lo que el backend rechazaría: WhatsApp con espacios y descripción vacía", async () => {
    const config = makeConfig();
    const { put } = mockBackend(config);
    renderWithQuery(<EmpresaView />);
    fireEvent.change(await screen.findByLabelText("WhatsApp del negocio"), { target: { value: "+51 987 000 999" } });
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "" } });
    fireEvent.click(buttons().save);
    await screen.findByText("Cambios guardados");
    expect(put).toHaveBeenCalledExactlyOnceWith({ ...toPutRequest(config), whatsappNumber: "+51987000999", description: null });
  });

  it("marca la URL de localhost y la falta de idiomas sin llamar al backend", async () => {
    const { put } = mockBackend(makeConfig());
    renderWithQuery(<EmpresaView />);
    fireEvent.change(await screen.findByLabelText("Página web"), { target: { value: "http://localhost:3000" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Español" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Inglés" }));
    fireEvent.click(buttons().save);
    expect(await screen.findByText(/localhost no es válido/)).toBeInTheDocument();
    expect(screen.getByText("Elige al menos un idioma.")).toBeInTheDocument();
    expect(screen.getByLabelText("Página web")).toHaveAttribute("aria-invalid", "true");
    expect(put).not.toHaveBeenCalled();
  });

  it("sin configuración (404), ADMIN la crea con los 7 días cerrados e idioma español", async () => {
    const { put } = mockBackend(NOT_FOUND);
    renderWithQuery(<EmpresaView />);
    expect(await screen.findByText(/El restaurante aún no está configurado: sin estos datos/)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Guardar configuración" });
    fireEvent.click(submit);
    expect(await screen.findByText("Ingresa el nombre comercial.")).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();

    const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fill("Nombre comercial", "Sabor Mágico");
    fill("Dirección", "Av. Larco 1234, Lima");
    fill("WhatsApp del negocio", "+51 987 000 192");
    fill("Correo", "Reservas@SaborMagico.pe");
    fill("Política de reserva", "Se confirma al aprobar.");
    fill("Política de cancelación", "Sin costo hasta 4 horas antes.");
    fill("Tiempo máximo de respuesta", "15");
    fireEvent.click(submit);

    expect(await screen.findByText(/Configuración guardada\. Los 7 días quedaron cerrados/)).toBeInTheDocument();
    expect(put).toHaveBeenCalledExactlyOnceWith({
      businessName: "Sabor Mágico",
      logoUrl: null,
      description: null,
      address: "Av. Larco 1234, Lima",
      latitude: null,
      longitude: null,
      whatsappNumber: "+51987000192",
      email: "reservas@sabormagico.pe",
      website: null,
      currency: "PEN",
      timeZone: "America/Lima",
      reservationPolicy: "Se confirma al aprobar.",
      cancellationPolicy: "Sin costo hasta 4 horas antes.",
      responseTimeoutMinutes: 15,
      approvalResponsibleId: null,
      languages: ["ES"],
      schedules: closedWeek(),
    });
    // Ya configurado, la pestaña pasa a la edición normal con los datos guardados.
    expect(screen.getByLabelText("Nombre comercial")).toHaveValue("Sabor Mágico");
    expect(screen.queryByRole("button", { name: "Guardar configuración" })).toBeNull();
  });

  it("sin configuración (404), OWNER ve el aviso para pedírsela a un administrador", async () => {
    session.roles = ["OWNER"];
    mockBackend(NOT_FOUND);
    renderWithQuery(<EmpresaView />);
    expect(await screen.findByText(NOT_CONFIGURED_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar configuración" })).toBeNull();
  });

  it("sin configuración (404), las demás pestañas remiten a Empresa", async () => {
    mockBackend(NOT_FOUND);
    renderWithQuery(<HorariosView />);
    expect(await screen.findByRole("link", { name: "Empresa" })).toHaveAttribute("href", "/ajustes/empresa");
    expect(screen.getByText(/El restaurante aún no está configurado/)).toBeInTheDocument();
  });

  it("una falla de red se muestra como error con Reintentar, no como restaurante sin configurar", async () => {
    mockBackend(new ApiError(0, ["No se pudo conectar con el servidor."]));
    renderWithQuery(<PoliticasView />);
    expect(await screen.findByText("No se pudo cargar la configuración del restaurante.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText(/aún no está configurado/)).toBeNull();
  });
});

describe("Samanta", () => {
  const owners = [
    makeUser({ id: OWNER_ID, firstName: "Ricardo", lastName: "Mora", email: "ricardo@sabormagico.pe" }),
    makeUser({ id: OWNER_2_ID, firstName: "Ana", lastName: "Díaz", email: "ana@sabormagico.pe" }),
    makeUser({ id: "c9a1b2c3-d4e5-4f60-8a7b-9c0d1e2f3a4b", firstName: "Beto", isActive: false }),
    makeUser({ id: "d0e1f2a3-b4c5-4d6e-8f70-8192a3b4c5d6", firstName: "Frank", roles: ["ADMIN"] }),
  ];

  it("ADMIN elige entre propietarios activos y guarda responsable y tiempo de respuesta", async () => {
    const config = makeConfig();
    const { put } = mockBackend(config);
    vi.spyOn(usersApi, "list").mockResolvedValue(owners);
    renderWithQuery(<SamantaView />);

    const select = await screen.findByLabelText("Responsable de aprobación");
    await waitFor(() =>
      expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Sin responsable",
        "Ana Díaz · ana@sabormagico.pe",
        "Ricardo Mora · ricardo@sabormagico.pe",
      ]),
    );
    expect(select).toHaveValue(OWNER_ID);

    fireEvent.change(select, { target: { value: OWNER_2_ID } });
    fireEvent.change(screen.getByLabelText("Tiempo máximo de respuesta"), { target: { value: "45" } });
    fireEvent.click(buttons().save);

    await screen.findByText("Cambios guardados");
    expect(put).toHaveBeenCalledExactlyOnceWith({
      ...toPutRequest(config),
      approvalResponsibleId: OWNER_2_ID,
      responseTimeoutMinutes: 45,
    });
  });

  it("avisa si el responsable guardado ya no es propietario activo", async () => {
    mockBackend(makeConfig());
    vi.spyOn(usersApi, "list").mockResolvedValue([{ ...owners[0]!, roles: ["OPERATOR"] }, owners[1]!]);
    renderWithQuery(<SamantaView />);
    expect(await screen.findByText(/Ricardo Mora ya no está activo o perdió el rol Propietario/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Ricardo Mora .*\(ya no es válido\)/ })).toBeInTheDocument();
  });

  it("OWNER ve el responsable como texto y no consulta usuarios (GET /users es solo de ADMIN)", async () => {
    session.roles = ["OWNER"];
    mockBackend(makeConfig());
    const list = vi.spyOn(usersApi, "list");
    renderWithQuery(<SamantaView />);
    expect(await screen.findByLabelText("Responsable de aprobación")).toHaveValue("Ricardo Mora");
    expect(screen.getByLabelText("Tiempo máximo de respuesta")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("muestra canales y reglas sin inventar estado: solo la regla del backend aparece encendida", async () => {
    mockBackend(makeConfig());
    vi.spyOn(usersApi, "list").mockResolvedValue(owners);
    renderWithQuery(<SamantaView />);
    const whatsapp = await screen.findByRole("switch", { name: "WhatsApp: pendiente en el backend" });
    expect(whatsapp).toBeDisabled();
    expect(whatsapp).toHaveAttribute("aria-checked", "false");
    const rule = screen.getByRole("switch", { name: "Ofrecer solo servicios activos y precios registrados" });
    expect(rule).toBeDisabled();
    expect(rule).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByText("Pendiente en el backend")).toHaveLength(4);
  });
});
