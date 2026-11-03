"use client";

import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { conversationsApi, requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ContactChannel, Conversation, Message, Paginated } from "@/lib/api/types";
import { MAX_PAGE_SIZE } from "@/lib/api/types";
import { CHAT_POLL_MS, INBOX_POLL_MS } from "@/lib/config";
import { latestRequestByCustomer, mergeMessages } from "./inbox-utils";

/**
 * Datos de la Bandeja. bk-crm no tiene WebSocket: todo se mantiene al día por sondeo, que TanStack
 * Query detiene solo cuando la pestaña no está visible. Si un sondeo falla se conservan los datos.
 */

const LIST_PREFIX = ["conversations", "list"] as const;

export function useConversationList(filters: { channel?: ContactChannel; search?: string; limit: number }) {
  const query = { channel: filters.channel, search: filters.search || undefined, limit: filters.limit };
  return useQuery({
    queryKey: qk.conversations(query),
    queryFn: () => conversationsApi.list(query),
    placeholderData: keepPreviousData,
    refetchInterval: INBOX_POLL_MS,
  });
}

const UNREAD_LIMIT = MAX_PAGE_SIZE;

/** "N sin leer": suma de mensajes sin leer (como el mockup); exacto hasta 100 conversaciones con pendientes. */
export function useUnreadSummary() {
  return useQuery({
    queryKey: qk.conversations({ unreadOnly: true, limit: UNREAD_LIMIT }),
    queryFn: async () => {
      const page = await conversationsApi.list({ unreadOnly: true, limit: UNREAD_LIMIT });
      return {
        messages: page.data.reduce((sum, c) => sum + c.unreadCount, 0),
        partial: page.pagination.total > page.data.length,
      };
    },
    refetchInterval: INBOX_POLL_MS,
  });
}

const RECENT_REQUESTS_LIMIT = MAX_PAGE_SIZE;

/**
 * Última solicitud por cliente para las etiquetas de la lista: una sola consulta con las 100 más
 * recientes. `complete` indica que ahí están todas; si no, cada fila sin coincidencia consulta la suya.
 */
export function useLatestRequests() {
  const query = useQuery({
    queryKey: qk.requests({ recent: RECENT_REQUESTS_LIMIT }),
    queryFn: () => requestsApi.list({ limit: RECENT_REQUESTS_LIMIT }),
    refetchInterval: 30_000,
  });
  const map = useMemo(() => latestRequestByCustomer(query.data?.data ?? []), [query.data]);
  const complete = query.data ? query.data.pagination.total <= query.data.data.length : false;
  return { map, complete, isLoading: query.isLoading, isError: query.isError };
}

/** Última solicitud de un cliente que no apareció entre las recientes (rara vez se usa). */
export function useCustomerLatestRequest(customerId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.requests({ customerId, limit: 1 }),
    queryFn: () => requestsApi.list({ customerId, limit: 1 }).then((r) => r.data[0] ?? null),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Vista previa: el backend no la incluye en la lista; se pide el último mensaje cuando cambia lastMessageAt. */
export function useLastMessage(conversation: Pick<Conversation, "id" | "lastMessageAt">) {
  return useQuery({
    queryKey: qk.lastMessage(conversation.id, conversation.lastMessageAt),
    queryFn: () => conversationsApi.messages(conversation.id, { limit: 1 }).then((r) => r.data[0] ?? null),
    enabled: conversation.lastMessageAt !== null,
    staleTime: Infinity,
  });
}

/** Conversación seleccionada; se lee por id para que siga visible aunque el filtro la oculte. */
export function useConversation(id: string | null) {
  return useQuery({
    queryKey: qk.conversation(id ?? ""),
    queryFn: () => conversationsApi.get(id!),
    enabled: id !== null,
    refetchInterval: INBOX_POLL_MS,
    retry: (count, error) => !(error instanceof ApiError && (error.isNotFound || error.status === 400)) && count < 2,
  });
}

// ---------------------------------------------------------------- mensajes del chat

const MESSAGES_PAGE = 50;
const FAST_POLL_MS = 1500;
const NO_MESSAGES: Message[] = [];

function hasPendingOutbound(page: Paginated<Message> | undefined): boolean {
  return Boolean(page?.data.some((m) => m.direction === "OUTBOUND" && (m.status === "QUEUED" || m.status === "SENDING")));
}

/**
 * Historial del chat. La página 1 (más reciente) se sondea; mientras haya envíos en cola se sondea
 * más rápido para mostrar el cambio de estado. "Cargar anteriores" pide páginas más antiguas y las une
 * por id (el desplazamiento cambia cuando llegan mensajes nuevos, así que puede haber solapes).
 */
export function useConversationMessages(conversationId: string | null) {
  const recent = useQuery({
    queryKey: qk.messages(conversationId ?? ""),
    queryFn: () => conversationsApi.messages(conversationId!, { page: 1, limit: MESSAGES_PAGE }),
    enabled: conversationId !== null,
    refetchInterval: (query) => (hasPendingOutbound(query.state.data) ? FAST_POLL_MS : CHAT_POLL_MS),
  });

  const [older, setOlder] = useState<{ conversationId: string | null; rows: Message[] }>({ conversationId: null, rows: [] });
  const [olderState, setOlderState] = useState<{ conversationId: string | null; loading: boolean; error: unknown }>({
    conversationId: null,
    loading: false,
    error: null,
  });
  const olderRows = older.conversationId === conversationId ? older.rows : NO_MESSAGES;
  const olderStatus = olderState.conversationId === conversationId ? olderState : { loading: false, error: null };

  const messages = useMemo(() => mergeMessages(recent.data?.data ?? NO_MESSAGES, olderRows), [recent.data, olderRows]);
  const total = recent.data?.pagination.total ?? 0;
  const hasOlder = recent.data !== undefined && messages.length < total;

  const loadOlder = useCallback(async () => {
    if (!conversationId) return;
    setOlderState({ conversationId, loading: true, error: null });
    try {
      const oldest = messages[0]?.sequence ?? Number.POSITIVE_INFINITY;
      let page = Math.floor(messages.length / MESSAGES_PAGE) + 1;
      let found: Message[] = [];
      // Si llegaron mensajes nuevos la página puede venir corrida: se intenta una página más.
      for (let attempt = 0; attempt < 2 && found.length === 0; attempt += 1, page += 1) {
        const result = await conversationsApi.messages(conversationId, { page, limit: MESSAGES_PAGE });
        found = result.data.filter((m) => m.sequence < oldest);
        if (result.data.length === 0) break;
      }
      setOlder((prev) => ({
        conversationId,
        rows: [...(prev.conversationId === conversationId ? prev.rows : []), ...found],
      }));
      setOlderState({ conversationId, loading: false, error: null });
    } catch (error) {
      setOlderState({ conversationId, loading: false, error });
    }
  }, [conversationId, messages]);

  return {
    messages,
    hasOlder,
    loadOlder,
    loadingOlder: olderStatus.loading,
    olderError: olderStatus.error,
    isLoading: recent.isLoading,
    error: recent.error,
    /** Hay datos, pero el último sondeo falló. */
    stale: recent.isError && recent.data !== undefined,
    refetch: recent.refetch,
  };
}

// ---------------------------------------------------------------- caché

/** Reemplaza una conversación en el detalle y en todas las listas cargadas (respuesta de un PATCH). */
export function storeConversation(queryClient: QueryClient, conversation: Conversation) {
  queryClient.setQueryData(qk.conversation(conversation.id), conversation);
  queryClient.setQueriesData<Paginated<Conversation>>({ queryKey: LIST_PREFIX }, (page) =>
    page && Array.isArray(page.data)
      ? { ...page, data: page.data.map((c) => (c.id === conversation.id ? conversation : c)) }
      : page,
  );
}

/** Marca como leídos en la caché local los mensajes de una conversación. */
export function storeConversationRead(queryClient: QueryClient, conversationId: string) {
  queryClient.setQueryData<Conversation>(qk.conversation(conversationId), (c) => (c ? { ...c, unreadCount: 0 } : c));
  queryClient.setQueriesData<Paginated<Conversation>>({ queryKey: LIST_PREFIX }, (page) =>
    page && Array.isArray(page.data)
      ? { ...page, data: page.data.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)) }
      : page,
  );
}

/** Agrega el mensaje recién encolado (respuesta 202) a la página reciente del chat. */
export function storeSentMessage(queryClient: QueryClient, message: Message) {
  queryClient.setQueryData<Paginated<Message>>(qk.messages(message.conversationId), (page) => {
    if (!page) return page;
    if (page.data.some((m) => m.id === message.id)) return page;
    return {
      data: [message, ...page.data],
      pagination: { ...page.pagination, total: page.pagination.total + 1 },
    };
  });
}

export function useInvalidateInbox() {
  const queryClient = useQueryClient();
  return useCallback(
    (conversationId?: string) => {
      void queryClient.invalidateQueries({ queryKey: LIST_PREFIX });
      if (conversationId) void queryClient.invalidateQueries({ queryKey: qk.conversation(conversationId) });
    },
    [queryClient],
  );
}
