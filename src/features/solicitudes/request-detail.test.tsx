import { fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestsApi } from "@/lib/api/endpoints";
import type { ReservationRequestDetail, ReservationRequestStatusEntry } from "@/lib/api/types";
import type { Action, RoleCode, ViewKey } from "@/lib/auth/permissions";
import { renderWithQuery } from "@/test/render";
import { RequestDetailSheet } from "./request-detail";
import {
  CUSTOMER_NOTICE_ERROR_TEXT,
  actorLabel,
  calendarHref,
  canApproveRequest,
  canRejectRequest,
  commentLines,
  decidedWithoutNotice,
  detailRefetchMs,
  noticeMessageView,
  ownerMessageView,
  reasonError,
  reasonValue,
} from "./request-detail-logic";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const session = vi.hoisted(() => ({ roles: ["ADMIN"] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => "/solicitudes",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
        can: (action: Action) => permissions.can(roles, action),
        canView: (view: ViewKey) => permissions.canView(roles, view),
      };
    },
  };
});

const ID = "c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93";
const CONV = "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14";

function entry(partial: Partial<ReservationRequestStatusEntry>): ReservationRequestStatusEntry {
  return {
    id: crypto.randomUUID(),
    previousStatus: "READY_TO_SEND",
    newStatus: "SENT_TO_OWNER",
    actorType: "SYSTEM",
    actorId: null,
    reason: "Enviada al WhatsApp del propietario para su aprobación.",
    createdAt: "2026-11-10T15:00:00.000Z",
    actor: null,
    ...partial,
  };
}

function makeDetail(partial: Partial<ReservationRequestDetail> = {}): ReservationRequestDetail {
  return {
    id: ID,
    code: "RES-2026-000043",
    externalReference: null,
    customerId: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    commercialItemId: null,
    conversationId: CONV,
    sourceChannel: "WHATSAPP",
    reservationAt: "2026-11-21T00:30:00.000Z",
    numberOfPeople: 4,
    quotedPrice: null,
    currency: null,
    comments: "Es un cumpleaños\nCRM: registrada por Samanta con la confirmación del cliente en la conversación.",
    specialRequirements: "Mesa junto a la ventana",
    status: "WAITING_RESPONSE",
    createdAt: "2026-11-10T14:59:00.000Z",
    updatedAt: "2026-11-10T15:00:05.000Z",
    customer: { id: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42", firstName: "Lucía", lastName: "Rojas", phone: "+51987654321", email: null },
    commercialItem: null,
    statusHistory: [],
    reservation: null,
    ownerMessage: null,
    customerNoticeMessage: null,
    customerNoticeError: null,
    ...partial,
  };
}

const actions = () => ({ onApprove: vi.fn(), onReject: vi.fn(), onEdit: vi.fn(), onCancel: vi.fn() });

function renderSheet(detail: ReservationRequestDetail, a = actions()) {
  vi.spyOn(requestsApi, "get").mockResolvedValue(detail);
  renderWithQuery(<RequestDetailSheet requestId={detail.id} onClose={vi.fn()} actions={a} />);
  return a;
}

beforeEach(() => {
  session.roles = ["ADMIN"];
  nav.push.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("lógica del detalle", () => {
  it("aprobar en Lista/Enviada/Esperando; rechazar también en Negociando", () => {
    expect((["INCOMPLETE_DATA", "READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE", "MODIFICATION_REQUESTED", "ACCEPTED"] as const).map(canApproveRequest)).toEqual([
      false, true, true, true, false, false,
    ]);
    expect((["INCOMPLETE_DATA", "READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE", "MODIFICATION_REQUESTED", "REJECTED"] as const).map(canRejectRequest)).toEqual([
      true, true, true, true, false, false,
    ]);
  });

  it("actor: Propietario con su nombre, Samanta, Sistema o el usuario", () => {
    const user = { id: "u", firstName: "Rosa", lastName: "Huamán" };
    expect(actorLabel({ actorType: "OWNER", actor: user })).toBe("Propietario · Rosa Huamán");
    expect(actorLabel({ actorType: "OWNER", actor: null })).toBe("Propietario");
    expect(actorLabel({ actorType: "SAMANTA", actor: user })).toBe("Samanta");
    expect(actorLabel({ actorType: "SYSTEM", actor: null })).toBe("Sistema");
    expect(actorLabel({ actorType: "USER", actor: { id: "u", firstName: "Lucía", lastName: "Torres" } })).toBe("Lucía Torres");
  });

  it("mensaje al propietario: No enviada, Enviada, Entregada, Leída o Falló con su código", () => {
    expect(ownerMessageView(null)).toMatchObject({ label: "No enviada", tone: "none" });
    const base = { id: "m", errorCode: null, createdAt: "", sentAt: null, deliveredAt: null, providerReadAt: null };
    expect(ownerMessageView({ ...base, status: "SENT" }).label).toBe("Enviada");
    expect(ownerMessageView({ ...base, status: "DELIVERED" }).label).toBe("Entregada");
    expect(ownerMessageView({ ...base, status: "READ" }).label).toBe("Leída");
    expect(ownerMessageView({ ...base, status: "FAILED", errorCode: "WHATSAPP_SEND_REJECTED" })).toMatchObject({
      label: "Falló",
      tone: "error",
      detail: "WHATSAPP_SEND_REJECTED",
    });
  });

  it("aviso al cliente: estado, canal y si fue plantilla", () => {
    const notice = {
      id: "n",
      conversationId: CONV,
      channel: "INSTAGRAM" as const,
      templateName: null,
      status: "SENT" as const,
      errorCode: null,
      createdAt: "",
      sentAt: null,
      deliveredAt: null,
      providerReadAt: null,
    };
    expect(noticeMessageView(notice)).toMatchObject({ label: "Cliente avisado", channel: "Instagram", template: false });
    expect(noticeMessageView({ ...notice, channel: "WHATSAPP", status: "READ", templateName: "decision_aceptada" })).toMatchObject({
      label: "Leído",
      channel: "WhatsApp",
      template: true,
    });
  });

  it("decidida sin aviso ni error = decidida en el CRM", () => {
    expect(decidedWithoutNotice(makeDetail({ status: "ACCEPTED" }))).toBe(true);
    expect(decidedWithoutNotice(makeDetail({ status: "REJECTED", customerNoticeError: "PERSON_ATTENDING" }))).toBe(false);
    expect(decidedWithoutNotice(makeDetail({ status: "WAITING_RESPONSE" }))).toBe(false);
  });

  it("comentarios línea a línea, con las notas CRM marcadas", () => {
    expect(commentLines("Hola\nCRM: propuesta del propietario (10/11 19:00): a las 21:00")).toEqual([
      { text: "Hola", crm: false },
      { text: "CRM: propuesta del propietario (10/11 19:00): a las 21:00", crm: true },
    ]);
    expect(commentLines(null)).toEqual([]);
  });

  it("motivo: vacío se omite, se recorta y tope de 1000", () => {
    expect(reasonValue("   ")).toBeNull();
    expect(reasonValue(" Sin mesas ")).toBe("Sin mesas");
    expect(reasonError("x".repeat(1001))).toMatch(/1000/);
    expect(reasonError("ok")).toBeUndefined();
  });

  it("enlace al calendario en el día de la reserva (zona del restaurante) y polling más rápido mientras espera", () => {
    expect(calendarHref({ id: "r1", reservationAt: "2026-11-21T00:30:00.000Z" }, "America/Lima")).toBe(
      "/calendario?vista=dia&fecha=2026-11-20&reserva=r1",
    );
    expect(detailRefetchMs("WAITING_RESPONSE")).toBeLessThan(detailRefetchMs("ACCEPTED"));
  });
});

describe("panel de detalle", () => {
  it("muestra el historial con el actor, el motivo y las notas CRM destacadas", async () => {
    renderSheet(
      makeDetail({
        status: "REJECTED",
        statusHistory: [
          entry({}),
          entry({ previousStatus: "SENT_TO_OWNER", newStatus: "WAITING_RESPONSE", reason: "WhatsApp aceptó el mensaje al propietario (SENT)." }),
          entry({
            previousStatus: "WAITING_RESPONSE",
            newStatus: "REJECTED",
            actorType: "OWNER",
            actorId: "o1",
            actor: { id: "o1", firstName: "Rosa", lastName: "Huamán" },
            reason: "Rechazada por el propietario por WhatsApp.",
          }),
        ],
        customerNoticeMessage: {
          id: "n1",
          conversationId: CONV,
          channel: "WHATSAPP",
          templateName: null,
          status: "DELIVERED",
          errorCode: null,
          createdAt: "2026-11-10T15:10:00.000Z",
          sentAt: "2026-11-10T15:10:01.000Z",
          deliveredAt: "2026-11-10T15:10:02.000Z",
          providerReadAt: null,
        },
      }),
    );

    const history = await screen.findByRole("list", { name: "Historial de estados" });
    const items = within(history).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[2]).toHaveTextContent("Esperando al propietario → Rechazada");
    expect(items[2]).toHaveTextContent("Propietario · Rosa Huamán");
    expect(items[2]).toHaveTextContent("Rechazada por el propietario por WhatsApp.");
    expect(items[0]).toHaveTextContent("Sistema");
    expect(screen.getByText(/Entregado/)).toHaveTextContent("por WhatsApp");
    expect(screen.getByText("CRM: registrada por Samanta con la confirmación del cliente en la conversación.")).toBeInTheDocument();
    expect(screen.getByText("Es un cumpleaños")).toBeInTheDocument();
  });

  it("sin mensaje al propietario dice «No enviada»; con reserva, enlaza al calendario", async () => {
    renderSheet(
      makeDetail({
        status: "ACCEPTED",
        reservation: { id: "r-31", code: "R-2026-000031", status: "CONFIRMED", reservationAt: "2026-11-21T00:30:00.000Z" },
      }),
    );
    expect(await screen.findByText("No enviada")).toBeInTheDocument();
    expect(screen.getByText("R-2026-000031")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver en el calendario" })).toHaveAttribute(
      "href",
      "/calendario?vista=dia&fecha=2026-11-20&reserva=r-31",
    );
    expect(screen.getByText("Decidida en el CRM; el cliente no fue avisado automáticamente.")).toBeInTheDocument();
  });

  it("con customerNoticeError muestra «Avisar al cliente» con el motivo y abre su chat", async () => {
    renderSheet(makeDetail({ status: "ACCEPTED", customerNoticeError: "WINDOW_CLOSED" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Avisar al cliente");
    expect(alert).toHaveTextContent(CUSTOMER_NOTICE_ERROR_TEXT.WINDOW_CLOSED);
    fireEvent.click(within(alert).getByRole("button", { name: "Abrir el chat del cliente" }));
    expect(nav.push).toHaveBeenCalledWith(`/bandeja?c=${CONV}`);
    expect(screen.queryByText(/Decidida en el CRM/)).not.toBeInTheDocument();
  });

  it("«Cambio propuesto» explica que necesita a una persona y no ofrece aprobar, rechazar, editar ni cancelar", async () => {
    const a = renderSheet(makeDetail({ status: "MODIFICATION_REQUESTED", comments: "CRM: propuesta del propietario (10/11 19:00): mejor a las 21:00" }));
    expect(await screen.findByText(/El propietario propuso un cambio/)).toBeInTheDocument();
    expect(screen.getByText("CRM: propuesta del propietario (10/11 19:00): mejor a las 21:00")).toBeInTheDocument();
    for (const name of ["Aprobar", "Rechazar", "Editar", "Cancelar"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(a.onApprove).not.toHaveBeenCalled();
  });

  it("acciones según rol y estado: OWNER aprueba y rechaza; OPERATOR edita y cancela en Lista para enviar", async () => {
    session.roles = ["OWNER"];
    const a = renderSheet(makeDetail({ status: "READY_TO_SEND" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    expect(a.onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: ID }));
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("OPERATOR no decide; en Esperando tampoco edita ni cancela", async () => {
    session.roles = ["OPERATOR"];
    renderSheet(makeDetail({ status: "WAITING_RESPONSE" }));
    await screen.findByText("RES-2026-000043");
    for (const name of ["Aprobar", "Rechazar", "Editar", "Cancelar"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
});
