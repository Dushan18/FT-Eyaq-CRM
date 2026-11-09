import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { assistantDraftsApi } from "@/lib/api/endpoints";
import type { Conversation, Message, SamantaDraft } from "@/lib/api/types";
import type { Action, RoleCode } from "@/lib/auth/permissions";
import { renderWithQuery } from "@/test/render";
import { SamantaPanel } from "./samanta-panel";
import {
  activeDraft,
  draftSource,
  isDraftOutdated,
  samantaMessageIds,
  useAssistantDrafts,
} from "./use-samanta";

const ME = "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d";
const OTHER = "2e4a6c8e-0b2d-4f6a-8c1e-3a5c7e9b1d3f";
const CONV = "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14";

const session = vi.hoisted(() => ({ roles: ["ADMIN"] as string[] }));

vi.mock("@/lib/auth/session", async () => {
  const permissions = await import("@/lib/auth/permissions");
  return {
    useSession: () => {
      const roles = session.roles as RoleCode[];
      return {
        user: { id: "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d" },
        roles,
        status: "ready",
        can: (action: Action) => permissions.can(roles, action),
        canView: () => true,
      };
    },
  };
});

function message(
  partial: Partial<Message> & Pick<Message, "sequence">,
): Message {
  return {
    id: `m-${partial.sequence}`,
    conversationId: CONV,
    channel: "WHATSAPP",
    externalMessageId: null,
    direction: "INBOUND",
    status: "PROCESSED",
    type: "TEXT",
    content: "¿Tienen mesa para 4 este sábado?",
    authorUserId: null,
    occurredAt: "2026-11-03T02:32:09.000Z",
    receivedAt: null,
    processedAt: null,
    sentAt: null,
    deliveredAt: null,
    providerReadAt: null,
    failedAt: null,
    readAt: null,
    errorCode: null,
    createdAt: "2026-11-03T02:32:11.000Z",
    updatedAt: "2026-11-03T02:32:11.000Z",
    attachments: [],
    ...partial,
  };
}

function conversation(partial: Partial<Conversation> = {}): Conversation {
  return {
    id: CONV,
    customerId: "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
    channel: "WHATSAPP",
    isAssistantPaused: false,
    assignedUserId: null,
    lastMessageAt: "2026-11-03T02:32:11.000Z",
    createdAt: "2026-10-28T19:14:05.000Z",
    updatedAt: "2026-11-03T02:32:11.000Z",
    customer: {
      id: "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
      firstName: "Lucía",
      lastName: "Quispe",
      phone: "+51987654321",
      email: null,
    },
    assignedUser: null,
    unreadCount: 1,
    ...partial,
  };
}

function draft(partial: Partial<SamantaDraft> = {}): SamantaDraft {
  return {
    id: "d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c",
    conversationId: CONV,
    sourceMessageId: "m-7",
    baselineSequence: 7,
    idempotencyKey: "clave-de-prueba-0001",
    createdById: ME,
    reviewedById: null,
    editedById: null,
    status: "READY",
    revision: 1,
    model: "mock",
    promptVersion: "samanta-drafts-v1",
    knowledgeHash: "abc",
    originalContent:
      "¡Hola! Con gusto te ayudamos. ¿A nombre de quién la registramos?",
    content: "¡Hola! Con gusto te ayudamos. ¿A nombre de quién la registramos?",
    intent: "RESERVATION",
    requiresHuman: true,
    missingFields: ["nombre"],
    inputTokens: 10,
    outputTokens: 5,
    errorCode: null,
    generationExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    reviewedAt: null,
    outboundMessageId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function Harness({
  conv,
  messages,
}: {
  conv: Conversation;
  messages: Message[];
}) {
  const drafts = useAssistantDrafts(conv);
  return (
    <SamantaPanel conversation={conv} messages={messages} drafts={drafts} />
  );
}

const LAST = message({ sequence: 7 });

beforeEach(() => {
  session.roles = ["ADMIN"];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("borradores de Samanta: reglas", () => {
  it("solo responde al último mensaje si es un entrante de texto con contenido", () => {
    expect(draftSource([message({ sequence: 1 }), LAST])?.id).toBe("m-7");
    expect(
      draftSource([
        LAST,
        message({ sequence: 8, direction: "OUTBOUND", authorUserId: ME }),
      ]),
    ).toBeNull();
    expect(
      draftSource([message({ sequence: 9, type: "IMAGE", content: null })]),
    ).toBeNull();
    expect(
      draftSource([message({ sequence: 10, content: "x".repeat(4097) })]),
    ).toBeNull();
  });

  it("marca como Samanta solo los mensajes de borradores aprobados y muestra el borrador vigente", () => {
    const approved = draft({
      id: "d1",
      status: "APPROVED",
      outboundMessageId: "m-20",
    });
    expect([...samantaMessageIds([approved, draft({ id: "d2" })])]).toEqual([
      "m-20",
    ]);
    expect(activeDraft([approved])).toBeNull();
    expect(
      activeDraft([draft({ id: "d3", status: "STALE" }), approved])?.id,
    ).toBe("d3");
  });

  it("un borrador READY queda desactualizado con un mensaje nuevo, en pausa o vencido", () => {
    const d = draft({
      baselineSequence: 7,
      expiresAt: "2026-11-03T03:00:00.000Z",
    });
    const now = Date.parse("2026-11-03T02:40:00.000Z");
    expect(isDraftOutdated(d, 7, false, now)).toBe(false);
    expect(isDraftOutdated(d, 8, false, now)).toBe(true);
    expect(isDraftOutdated(d, 7, true, now)).toBe(true);
    expect(
      isDraftOutdated(d, 7, false, Date.parse("2026-11-03T03:00:00.000Z")),
    ).toBe(true);
  });
});

describe("panel de Samanta", () => {
  it("genera un borrador, permite editarlo y lo aprueba con la revisión nueva", async () => {
    const ready = draft();
    const list = vi
      .spyOn(assistantDraftsApi, "list")
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValue({ data: [ready] });
    const generate = vi
      .spyOn(assistantDraftsApi, "generate")
      .mockResolvedValue(ready);
    const edited = draft({
      revision: 2,
      content: "¡Hola, Lucía! ¿A nombre de quién la registramos?",
    });
    const edit = vi.spyOn(assistantDraftsApi, "edit").mockResolvedValue(edited);
    const approve = vi
      .spyOn(assistantDraftsApi, "approve")
      .mockResolvedValue({
        ...edited,
        status: "APPROVED",
        outboundMessageId: "m-8",
      });

    renderWithQuery(<Harness conv={conversation()} messages={[LAST]} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Generar borrador" }),
    );

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const [conversationId, sourceMessageId, key] = generate.mock.calls[0]!;
    expect([conversationId, sourceMessageId]).toEqual([CONV, "m-7"]);
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,80}$/);

    const textarea = await screen.findByRole("textbox", {
      name: "Texto del borrador de Samanta",
    });
    expect(screen.getByText(/Reserva · vence en/)).toBeInTheDocument();
    expect(screen.getByText("nombre")).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: edited.content } });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar y enviar" }));

    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith(CONV, ready.id, 2),
    );
    expect(edit).toHaveBeenCalledWith(CONV, ready.id, {
      revision: 1,
      content: edited.content,
    });
    expect(list).toHaveBeenCalled();
  });

  it("con Samanta en pausa explica por qué no se puede generar", async () => {
    vi.spyOn(assistantDraftsApi, "list").mockResolvedValue({ data: [] });
    renderWithQuery(
      <Harness
        conv={conversation({ isAssistantPaused: true })}
        messages={[LAST]}
      />,
    );
    expect(
      await screen.findByText(/Samanta está en pausa en esta conversación/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generar borrador" }),
    ).toBeDisabled();
  });

  it("un operador no usa a Samanta si la conversación la atiende otra persona", async () => {
    session.roles = ["OPERATOR"];
    vi.spyOn(assistantDraftsApi, "list").mockResolvedValue({ data: [] });
    renderWithQuery(
      <Harness
        conv={conversation({ assignedUserId: OTHER })}
        messages={[LAST]}
      />,
    );
    expect(
      await screen.findByText(/Otra persona atiende esta conversación/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generar borrador" }),
    ).toBeDisabled();
  });

  it("si Samanta está desactivada en el servidor (503 sin code) lo dice, no «sin conexión»", async () => {
    vi.spyOn(assistantDraftsApi, "list").mockResolvedValue({ data: [] });
    vi.spyOn(assistantDraftsApi, "generate").mockRejectedValue(
      new ApiError(503, ["Samanta está desactivada"]),
    );
    renderWithQuery(<Harness conv={conversation()} messages={[LAST]} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Generar borrador" }),
    );
    expect(
      await screen.findByText(/Samanta está desactivada en el servidor/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo conectar/)).not.toBeInTheDocument();
  });

  it("muestra el borrador desactualizado si llegó otro mensaje después de generarlo", async () => {
    vi.spyOn(assistantDraftsApi, "list").mockResolvedValue({
      data: [draft({ baselineSequence: 6 })],
    });
    renderWithQuery(<Harness conv={conversation()} messages={[LAST]} />);
    expect(
      await screen.findByText(/El borrador quedó desactualizado/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar otro" })).toBeEnabled();
  });

  it("el propietario ve el borrador sin poder aprobarlo", async () => {
    session.roles = ["OWNER"];
    vi.spyOn(assistantDraftsApi, "list").mockResolvedValue({ data: [draft()] });
    renderWithQuery(<Harness conv={conversation()} messages={[LAST]} />);
    expect(
      await screen.findByText(/A nombre de quién la registramos/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aprobar y enviar" }),
    ).not.toBeInTheDocument();
  });

  it("en un canal sin envío (la web) no se muestra ni se consultan borradores", () => {
    const list = vi
      .spyOn(assistantDraftsApi, "list")
      .mockResolvedValue({ data: [] });
    renderWithQuery(
      <Harness conv={conversation({ channel: "WEBSITE" })} messages={[LAST]} />,
    );
    expect(
      screen.queryByRole("region", { name: "Borrador de Samanta" }),
    ).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it.each(["FACEBOOK", "INSTAGRAM"] as const)(
    "en %s también se puede pedir un borrador",
    async (channel) => {
      const list = vi
        .spyOn(assistantDraftsApi, "list")
        .mockResolvedValue({ data: [] });
      renderWithQuery(
        <Harness conv={conversation({ channel })} messages={[LAST]} />,
      );
      expect(
        await screen.findByRole("button", { name: "Generar borrador" }),
      ).toBeInTheDocument();
      expect(list).toHaveBeenCalled();
    },
  );
});
