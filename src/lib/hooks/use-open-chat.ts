"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { conversationsApi } from "@/lib/api/endpoints";
import type { ContactChannel } from "@/lib/api/types";

/**
 * Abre en la Bandeja la conversación de un cliente. La conversación es única por (cliente, canal):
 * se busca primero por el canal indicado y, si no existe, la más reciente del cliente.
 */
export function useOpenChat() {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const open = useCallback(
    async (customerId: string, channel?: ContactChannel) => {
      setPendingId(customerId);
      setNotFound(null);
      setFailed(null);
      try {
        let page = channel ? await conversationsApi.list({ customerId, channel, limit: 1 }) : null;
        if (!page?.data.length) page = await conversationsApi.list({ customerId, limit: 1 });
        const conversation = page.data[0];
        if (conversation) router.push(`/bandeja?c=${conversation.id}`);
        else setNotFound(customerId);
      } catch {
        setFailed(customerId);
      } finally {
        setPendingId(null);
      }
    },
    [router],
  );

  return { open, pendingId, notFound, failed };
}
