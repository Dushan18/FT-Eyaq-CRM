"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { conversationsApi } from "@/lib/api/endpoints";
import type { Conversation } from "@/lib/api/types";
import { storeConversation, storeSentMessage, useInvalidateInbox } from "./use-inbox";

/**
 * Acciones sobre una conversación. El backend no tiene operaciones atómicas de "tomar" o "devolver":
 * se encadenan dos PATCH en un orden que, si el segundo falla, deja la conversación en un estado
 * seguro (Samanta en pausa, nunca respondiendo a la vez que una persona).
 */

export type ConversationAction =
  | { kind: "pause"; paused: boolean }
  | { kind: "take" }
  | { kind: "release" }
  | { kind: "send"; content: string; idempotencyKey: string; plan: { pause: boolean; assign: boolean } };

/** Error de envío: el componente lo traduce con `sendErrorText` y conserva el borrador para reintentar. */
export class SendFailedError extends Error {
  constructor(readonly reason: unknown) {
    super("send-failed");
  }
}

export function actionErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isUnavailable) return "No se pudo conectar con el servidor.";
    return error.messages.join(" ");
  }
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

export function useConversationActions(conversation: Conversation | null, meId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateInbox();

  return useMutation({
    mutationFn: async (action: ConversationAction): Promise<{ warning: string | null }> => {
      if (!conversation) throw new Error("No hay una conversación seleccionada.");
      const id = conversation.id;
      let current = conversation;
      const save = (next: Conversation) => {
        current = next;
        storeConversation(queryClient, next);
      };

      if (action.kind === "pause") {
        save(await conversationsApi.setAssistantPaused(id, action.paused));
        return { warning: null };
      }

      if (action.kind === "take") {
        // Primero se pausa (Samanta deja de responder de inmediato) y luego se asigna.
        const pausedNow = !current.isAssistantPaused;
        if (pausedNow) save(await conversationsApi.setAssistantPaused(id, true));
        if (current.assignedUserId !== meId) {
          try {
            save(await conversationsApi.assign(id, { assignedUserId: meId }));
          } catch (error) {
            if (!pausedNow) throw error;
            throw new Error(`Samanta quedó en pausa, pero no se pudo asignarte la conversación. ${actionErrorText(error)}`);
          }
        }
        return { warning: null };
      }

      if (action.kind === "release") {
        // Primero se quita el responsable; si reanudar falla, queda "En pausa" (estado seguro).
        const unassigned = current.assignedUserId !== null;
        if (unassigned) save(await conversationsApi.assign(id, { assignedUserId: null }));
        if (current.isAssistantPaused) {
          try {
            save(await conversationsApi.setAssistantPaused(id, false));
          } catch (error) {
            if (!unassigned) throw error;
            throw new Error(`La conversación quedó sin responsable, pero Samanta sigue en pausa. ${actionErrorText(error)}`);
          }
        }
        return { warning: null };
      }

      // Envío (regla 7: quien escribe toma el control): pausar → enviar → asignar.
      if (action.plan.pause) {
        try {
          save(await conversationsApi.setAssistantPaused(id, true));
        } catch (error) {
          throw new Error(`No se pudo pausar a Samanta, así que el mensaje no se envió. ${actionErrorText(error)}`);
        }
      }
      try {
        storeSentMessage(queryClient, await conversationsApi.send(id, action.content, action.idempotencyKey));
      } catch (error) {
        throw new SendFailedError(error);
      }
      if (action.plan.assign && meId && current.assignedUserId === null) {
        try {
          save(await conversationsApi.assign(id, { assignedUserId: meId }));
        } catch (error) {
          return { warning: `Tu mensaje se envió, pero no se pudo asignarte la conversación. ${actionErrorText(error)}` };
        }
      }
      return { warning: null };
    },
    onSettled: () => invalidate(conversation?.id),
  });
}
