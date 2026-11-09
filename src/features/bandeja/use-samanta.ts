"use client";

/**
 * Borradores de Samanta (POST/GET/PATCH /conversations/:id/assistant-drafts). Samanta v1 no responde sola:
 * una persona pide el borrador, lo revisa y lo aprueba. Ver docs/frontend-api-completo.md, Parte 04
 * («Generar un borrador con Samanta» y siguientes) y Parte 05 («Bandeja»).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import { newIdempotencyKey } from "@/lib/api/client";
import { assistantDraftsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type {
  Conversation,
  Message,
  SamantaDraft,
  SamantaDraftListResponse,
  SamantaIntent,
} from "@/lib/api/types";
import { isSendableChannel, SAMANTA_DRAFT_MAX_LENGTH } from "@/lib/api/types";

const DRAFT_POLL_MS = 2500;
const EMPTY_IDS: ReadonlySet<string> = new Set();

/** Borradores de la conversación (los 50 más recientes), en WhatsApp, Messenger e Instagram. */
export function useAssistantDrafts(
  conversation: Pick<Conversation, "id" | "channel">,
) {
  return useQuery({
    queryKey: qk.assistantDrafts(conversation.id),
    queryFn: () => assistantDraftsApi.list(conversation.id),
    enabled: isSendableChannel(conversation.channel),
    // Al consultar, bk-crm recalcula los STALE (mensaje nuevo, pausa, vencimiento).
    refetchInterval: (query) =>
      hasPendingDraft(query.state.data) ? 15_000 : false,
  });
}

function hasPendingDraft(list: SamantaDraftListResponse | undefined): boolean {
  return Boolean(
    list?.data.some((d) => d.status === "GENERATING" || d.status === "READY"),
  );
}

/** Un borrador: mientras está en GENERATING se consulta cada 2,5 s. */
export function useAssistantDraft(
  conversationId: string,
  draftId: string | null,
  initial?: SamantaDraft,
) {
  return useQuery({
    queryKey: qk.assistantDraft(conversationId, draftId ?? ""),
    queryFn: () => assistantDraftsApi.get(conversationId, draftId!),
    enabled: draftId !== null,
    initialData: initial && initial.id === draftId ? initial : undefined,
    refetchInterval: (query) =>
      query.state.data?.status === "GENERATING" ? DRAFT_POLL_MS : false,
  });
}

/** Mensaje al que puede responder Samanta: el último cargado, si es un INBOUND de texto con contenido. */
export function draftSource(messages: readonly Message[]): Message | null {
  const last = messages.at(-1);
  if (
    !last ||
    last.direction !== "INBOUND" ||
    last.type !== "TEXT" ||
    !last.content?.trim()
  )
    return null;
  return last.content.length <= SAMANTA_DRAFT_MAX_LENGTH ? last : null;
}

/** Ids de los mensajes que salieron de un borrador aprobado, para etiquetarlos como «Samanta». */
export function samantaMessageIds(
  drafts: readonly SamantaDraft[] | undefined,
): ReadonlySet<string> {
  if (!drafts?.length) return EMPTY_IDS;
  return new Set(
    drafts.flatMap((d) =>
      d.status === "APPROVED" && d.outboundMessageId
        ? [d.outboundMessageId]
        : [],
    ),
  );
}

/** Borrador que se muestra en el panel: el más reciente, salvo que ya se haya aprobado o descartado. */
export function activeDraft(
  drafts: readonly SamantaDraft[] | undefined,
): SamantaDraft | null {
  const latest = drafts?.[0];
  return latest && latest.status !== "APPROVED" && latest.status !== "REJECTED"
    ? latest
    : null;
}

/**
 * El borrador ya no sirve aunque el backend todavía diga READY (se recalcula al consultarlo): llegó otro
 * mensaje, Samanta quedó en pausa o venció.
 */
export function isDraftOutdated(
  draft: Pick<SamantaDraft, "baselineSequence" | "expiresAt">,
  newestSequence: number | null,
  paused: boolean,
  now: number,
): boolean {
  return (
    paused ||
    (newestSequence !== null && newestSequence > draft.baselineSequence) ||
    Date.parse(draft.expiresAt) <= now
  );
}

export const INTENT_LABEL: Record<SamantaIntent, string> = {
  GENERAL: "Consulta general",
  RESERVATION: "Reserva",
  CANCELLATION: "Cancelación",
  HUMAN: "Pide hablar con una persona",
  OTHER: "Otro tema",
};

export function draftFailureText(
  draft: Pick<SamantaDraft, "errorCode">,
): string {
  switch (draft.errorCode) {
    case "AI_TIMEOUT":
    case "AI_GENERATION_EXPIRED":
      return "Samanta tardó demasiado en responder.";
    case "AI_RATE_LIMITED":
      return "El servicio de IA está limitando las solicitudes. Inténtalo en unos minutos.";
    default:
      return "Samanta no pudo preparar un borrador.";
  }
}

function storeDraft(
  queryClient: QueryClient,
  conversationId: string,
  draft: SamantaDraft,
) {
  queryClient.setQueryData(qk.assistantDraft(conversationId, draft.id), draft);
  queryClient.setQueryData<SamantaDraftListResponse>(
    qk.assistantDrafts(conversationId),
    (old) =>
      old
        ? { data: [draft, ...old.data.filter((d) => d.id !== draft.id)] }
        : { data: [draft] },
  );
}

/** Generar: una clave por clic, reutilizada solo al reintentar la misma fuente tras un fallo. */
export function useGenerateDraft(conversationId: string) {
  const queryClient = useQueryClient();
  const pending = useRef<{ sourceMessageId: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (sourceMessageId: string) => {
      if (pending.current?.sourceMessageId !== sourceMessageId) {
        pending.current = { sourceMessageId, key: newIdempotencyKey() };
      }
      return assistantDraftsApi.generate(
        conversationId,
        sourceMessageId,
        pending.current.key,
      );
    },
    onSuccess: (draft) => {
      pending.current = null;
      storeDraft(queryClient, conversationId, draft);
      void queryClient.invalidateQueries({
        queryKey: qk.assistantDrafts(conversationId),
      });
    },
  });
}

/**
 * Aprobar o rechazar con la revisión que se ve en pantalla. Si el texto se editó y no se guardó,
 * primero se guarda la edición (revision + 1) y se aprueba con la revisión nueva.
 */
export function useReviewDraft(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      draft,
      action,
      content,
    }: {
      draft: SamantaDraft;
      action: "approve" | "reject";
      content?: string;
    }) => {
      let current = draft;
      if (
        action === "approve" &&
        content !== undefined &&
        content !== draft.content
      ) {
        current = await assistantDraftsApi.edit(conversationId, draft.id, {
          revision: draft.revision,
          content,
        });
        storeDraft(queryClient, conversationId, current);
      }
      return action === "approve"
        ? assistantDraftsApi.approve(
            conversationId,
            current.id,
            current.revision,
          )
        : assistantDraftsApi.reject(
            conversationId,
            current.id,
            current.revision,
          );
    },
    onSuccess: (draft, { action }) => {
      storeDraft(queryClient, conversationId, draft);
      if (action === "approve") {
        void queryClient.invalidateQueries({
          queryKey: qk.messages(conversationId),
        });
        void queryClient.invalidateQueries({
          queryKey: qk.conversation(conversationId),
        });
        void queryClient.invalidateQueries({
          queryKey: ["conversations", "list"],
        });
      }
    },
    // Un 409 (revisión vieja, borrador desactualizado) se resuelve releyendo el borrador.
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: qk.assistantDrafts(conversationId),
      }),
  });
}
