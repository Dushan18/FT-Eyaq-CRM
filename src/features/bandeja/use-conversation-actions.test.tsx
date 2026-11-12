import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { conversationsApi } from "@/lib/api/endpoints";
import type { Conversation, Message } from "@/lib/api/types";
import { SendFailedError, useConversationActions } from "./use-conversation-actions";

const ME = "11111111-1111-4111-8111-111111111111";

const conversation: Conversation = {
  id: "c-1",
  customerId: "cu-1",
  channel: "WHATSAPP",
  isAssistantPaused: false,
  assistantPauseReason: null,
  assistantPausedAt: null,
  assignedUserId: null,
  lastMessageAt: "2026-10-14T17:00:00.000Z",
  createdAt: "2026-10-14T16:00:00.000Z",
  updatedAt: "2026-10-14T17:00:00.000Z",
  customer: { id: "cu-1", firstName: "María", lastName: null, phone: "+51987000111", email: null },
  assignedUser: null,
  unreadCount: 0,
};

/** Registra el orden real de las llamadas al backend. */
function spyBackend(fail: Partial<Record<"pause" | "send" | "assign", unknown>> = {}, initial: Conversation = conversation) {
  const calls: string[] = [];
  let state = { ...initial };
  vi.spyOn(conversationsApi, "setAssistantPaused").mockImplementation(async (_id, paused) => {
    calls.push(`pausa:${paused}`);
    if (fail.pause) throw fail.pause;
    state = { ...state, isAssistantPaused: paused };
    return state;
  });
  vi.spyOn(conversationsApi, "assign").mockImplementation(async (_id, body) => {
    calls.push(`asignar:${body.assignedUserId ?? "nadie"}`);
    if (fail.assign) throw fail.assign;
    state = { ...state, assignedUserId: body.assignedUserId };
    return state;
  });
  vi.spyOn(conversationsApi, "send").mockImplementation(async (_id, content, key) => {
    calls.push(`enviar:${content}:${key}`);
    if (fail.send) throw fail.send;
    return { id: "m-1", conversationId: "c-1", sequence: 9, direction: "OUTBOUND", status: "QUEUED" } as Message;
  });
  return calls;
}

function setup(target: Conversation = conversation) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useConversationActions(target, ME), { wrapper }).result;
}

afterEach(() => vi.restoreAllMocks());

const forbidden = new ApiError(403, ["Solo puedes tomar conversaciones libres o desasignarte de las propias"]);

describe("enviar toma el control (regla 7)", () => {
  it("pausa a Samanta, envía con la clave de idempotencia y luego asigna a quien escribe", async () => {
    const calls = spyBackend();
    const actions = setup();
    let result: { warning: string | null } | undefined;
    await act(async () => {
      result = await actions.current.mutateAsync({ kind: "send", content: "Hola", idempotencyKey: "clave-000000000001", plan: { pause: true, assign: true } });
    });
    expect(calls).toEqual(["pausa:true", "enviar:Hola:clave-000000000001", `asignar:${ME}`]);
    expect(result).toEqual({ warning: null });
  });

  it("si no se pudo pausar, no envía el mensaje", async () => {
    const calls = spyBackend({ pause: new ApiError(503, ["caído"]) });
    const actions = setup();
    await act(async () => {
      await expect(
        actions.current.mutateAsync({ kind: "send", content: "Hola", idempotencyKey: "clave-000000000002", plan: { pause: true, assign: true } }),
      ).rejects.toThrow(/no se envió/);
    });
    expect(calls).toEqual(["pausa:true"]);
  });

  it("si el envío falla, no se asigna y el error conserva la causa para reintentar", async () => {
    const paused = { ...conversation, isAssistantPaused: true };
    const calls = spyBackend({ send: new ApiError(409, ["Ventana de WhatsApp cerrada; se requiere una plantilla aprobada"]) }, paused);
    const actions = setup(paused);
    await act(async () => {
      await expect(
        actions.current.mutateAsync({ kind: "send", content: "Hola", idempotencyKey: "clave-000000000003", plan: { pause: false, assign: true } }),
      ).rejects.toBeInstanceOf(SendFailedError);
    });
    expect(calls).toEqual(["enviar:Hola:clave-000000000003"]);
  });

  it("si el mensaje salió pero no se pudo asignar, avisa sin ocultar que se envió", async () => {
    spyBackend({ assign: forbidden });
    const actions = setup();
    let result: { warning: string | null } | undefined;
    await act(async () => {
      result = await actions.current.mutateAsync({ kind: "send", content: "Hola", idempotencyKey: "clave-000000000004", plan: { pause: true, assign: true } });
    });
    expect(result?.warning).toMatch(/Tu mensaje se envió/);
  });
});

describe("pasar a humano y devolver a Samanta", () => {
  it("pasar a humano: primero pausa y luego asigna; si la asignación falla, lo dice", async () => {
    const calls = spyBackend({ assign: forbidden });
    const actions = setup();
    await act(async () => {
      await expect(actions.current.mutateAsync({ kind: "take" })).rejects.toThrow(/Samanta quedó en pausa/);
    });
    expect(calls).toEqual(["pausa:true", `asignar:${ME}`]);
  });

  it("devolver: primero quita al responsable y luego reanuda (nunca responden los dos a la vez)", async () => {
    const mine = { ...conversation, isAssistantPaused: true, assignedUserId: ME };
    const calls = spyBackend({}, mine);
    const actions = setup(mine);
    await act(async () => {
      await actions.current.mutateAsync({ kind: "release" });
    });
    expect(calls).toEqual(["asignar:nadie", "pausa:false"]);
  });
});
