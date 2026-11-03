"use client";

import { useEffect, useState } from "react";
import { useUrlParams } from "@/lib/hooks/use-url-state";
import { ChatPanel } from "./chat-panel";
import { ConversationList, LIST_PAGE } from "./conversation-list";
import { CustomerPanel } from "./customer-panel";
import { channelFromSlug, isUuid, slugFromChannel } from "./inbox-utils";
import { useConversation, useConversationList } from "./use-inbox";

const LIST_MAX = 100;

/**
 * Bandeja (mockup): lista de conversaciones | chat | solicitud y cliente.
 * Estado en la URL: `c` (conversación), `canal` (whatsapp|facebook|instagram|web) y `q` (búsqueda).
 */
export function BandejaView() {
  const url = useUrlParams();
  const selectedParam = url.get("c");
  const selectedId = selectedParam && isUuid(selectedParam) ? selectedParam : null;
  const channel = channelFromSlug(url.get("canal"));
  const search = (url.get("q") ?? "").trim().slice(0, 200);

  // "Mostrar más" amplía la lista; al cambiar de filtro vuelve a la primera tanda.
  const filterKey = `${channel ?? ""}|${search}`;
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = expanded === filterKey ? LIST_MAX : LIST_PAGE;

  const list = useConversationList({ channel, search, limit });
  const conversation = useConversation(selectedId);

  // Como en el mockup, siempre hay una conversación abierta: sin `c`, se abre la primera de la lista.
  const firstId = list.data?.data[0]?.id;
  useEffect(() => {
    if (!selectedParam && firstId) url.set({ c: firstId });
  }, [selectedParam, firstId, url]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)] gap-3">
      <ConversationList
        selectedId={selectedId}
        onSelect={(id) => url.set({ c: id })}
        channel={channel}
        onChannel={(next) => url.set({ canal: slugFromChannel(next) })}
        search={search}
        onSearch={(value) => url.set({ q: value || null })}
        limit={limit}
        onShowMore={() => setExpanded(filterKey)}
      />
      <ChatPanel
        selected={selectedParam !== null}
        invalid={selectedParam !== null && selectedId === null}
        conversation={conversation.data}
        isLoading={selectedId !== null && conversation.isLoading}
        error={conversation.error}
        onRetry={() => void conversation.refetch()}
      />
      <CustomerPanel conversation={conversation.data ?? null} />
    </div>
  );
}
