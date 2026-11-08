import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conversationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ListMessagesQuery, Message } from "@/lib/api/types";
import { useConversationMessages } from "./use-inbox";

const CONVERSATION = "3f6a1c2e-9b8d-4e7f-a1b2-c3d4e5f6a7b8";

function message(sequence: number): Message {
  return {
    id: `m-${sequence}`,
    conversationId: CONVERSATION,
    sequence,
    channel: "WHATSAPP",
    externalMessageId: null,
    direction: "INBOUND",
    status: "PROCESSED",
    type: "TEXT",
    content: `mensaje ${sequence}`,
    authorUserId: null,
    occurredAt: null,
    receivedAt: null,
    processedAt: null,
    sentAt: null,
    deliveredAt: null,
    providerReadAt: null,
    failedAt: null,
    readAt: null,
    errorCode: null,
    createdAt: "2026-10-14T17:00:00.000Z",
    updatedAt: "2026-10-14T17:00:00.000Z",
    attachments: [],
  };
}

/** Backend simulado: paginación por desplazamiento, la página 1 es la más reciente (sequence desc). */
function mockHistory(initial: number) {
  let count = initial;
  vi.spyOn(conversationsApi, "messages").mockImplementation(async (_id: string, query: ListMessagesQuery = {}) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const all = Array.from({ length: count }, (_, i) => message(count - i));
    const data = all.slice((page - 1) * limit, page * limit);
    return { data, pagination: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) } };
  });
  return {
    receive: (n: number) => {
      count += n;
    },
  };
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

const sequences = (messages: Message[]) => messages.map((m) => m.sequence);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("historial del chat", () => {
  it("no deja huecos cuando llegan mensajes nuevos después de cargar los anteriores", async () => {
    const backend = mockHistory(60);
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useConversationMessages(CONVERSATION), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(50));
    expect(sequences(result.current.messages)).toEqual(range(11, 60));
    expect(result.current.hasOlder).toBe(true);

    await act(() => result.current.loadOlder());
    expect(sequences(result.current.messages)).toEqual(range(1, 60));
    expect(result.current.hasOlder).toBe(false);

    // Llegan 5 mensajes: la página reciente pasa a 16..65 y 11..15 salen de ella.
    backend.receive(5);
    await poll(client, result, 65);

    expect(sequences(result.current.messages)).toEqual(range(1, 65));
    expect(result.current.hasOlder).toBe(false);
  });

  it("los mensajes ya vistos no desaparecen del chat aunque salgan de la página reciente", async () => {
    const backend = mockHistory(50);
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useConversationMessages(CONVERSATION), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(50));

    backend.receive(3);
    await poll(client, result, 53);
    expect(sequences(result.current.messages)).toEqual(range(1, 53));
    expect(result.current.hasOlder).toBe(false);
  });

  it("si llegan más mensajes de los que caben en una página, vuelve a la última página sin huecos", async () => {
    const backend = mockHistory(50);
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useConversationMessages(CONVERSATION), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(50));

    // Pestaña oculta (sin sondeo) mientras llegan 60: la página nueva no se solapa con la vista.
    backend.receive(60);
    await poll(client, result, 110);
    expect(sequences(result.current.messages)).toEqual(range(61, 110));
    expect(result.current.hasOlder).toBe(true);

    await act(() => result.current.loadOlder());
    await act(() => result.current.loadOlder());
    expect(sequences(result.current.messages)).toEqual(range(1, 110));
    expect(result.current.hasOlder).toBe(false);
  });
});

/** Sondeo de la página reciente. TanStack notifica con un setTimeout: se espera a ver el mensaje nuevo. */
async function poll(
  client: QueryClient,
  result: { current: ReturnType<typeof useConversationMessages> },
  newestSequence: number,
) {
  await act(() => client.refetchQueries({ queryKey: qk.messages(CONVERSATION) }));
  await waitFor(() => expect(result.current.messages.at(-1)?.sequence).toBe(newestSequence));
}
