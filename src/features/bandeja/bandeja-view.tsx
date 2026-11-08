"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/format/text";
import { BREAKPOINTS, useMediaQuery } from "@/lib/hooks/use-media-query";
import { useUrlParams } from "@/lib/hooks/use-url-state";
import { ChatPanel } from "./chat-panel";
import { ConversationList, LIST_PAGE } from "./conversation-list";
import { CustomerPanel, CustomerSheet } from "./customer-panel";
import { channelFromSlug, isUuid, slugFromChannel } from "./inbox-utils";
import { useConversation, useConversationList } from "./use-inbox";

const LIST_MAX = 100;

/**
 * Bandeja (mockup): lista de conversaciones | chat | solicitud y cliente.
 * Estado en la URL: `c` (conversación), `canal` (whatsapp|facebook|instagram|web) y `q` (búsqueda).
 *
 * Según el ancho:
 * - xl: las tres columnas.
 * - lg: lista y chat; la ficha del cliente se abre en un panel lateral («Cliente» en el chat).
 * - más estrecho: una sola columna. Sin `c` se ve la lista; con `c`, el chat con «Volver».
 */
export function BandejaView() {
  const url = useUrlParams();
  const selectedParam = url.get("c");
  const selectedId = selectedParam && isUuid(selectedParam) ? selectedParam : null;
  const channel = channelFromSlug(url.get("canal"));
  const search = (url.get("q") ?? "").trim().slice(0, 200);
  const twoPanes = useMediaQuery(BREAKPOINTS.lg);
  const customerColumn = useMediaQuery(BREAKPOINTS.xl);
  const [customerOpen, setCustomerOpen] = useState(false);

  // "Mostrar más" amplía la lista; al cambiar de filtro vuelve a la primera tanda.
  const filterKey = `${channel ?? ""}|${search}`;
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = expanded === filterKey ? LIST_MAX : LIST_PAGE;

  const list = useConversationList({ channel, search, limit });
  const conversation = useConversation(selectedId);

  // Como en el mockup, con lista y chat a la vista siempre hay una conversación abierta: sin `c`, se abre la
  // primera. En una sola columna no: abrirla taparía la lista.
  const firstId = list.data?.data[0]?.id;
  useEffect(() => {
    if (twoPanes && !selectedParam && firstId) url.set({ c: firstId });
  }, [twoPanes, selectedParam, firstId, url]);

  const showingChat = selectedParam !== null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_300px]">
      <div className={cn("grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)]", showingChat && "max-lg:hidden")}>
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
      </div>
      <div className={cn("grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)]", !showingChat && "max-lg:hidden")}>
        <ChatPanel
          selected={showingChat}
          invalid={showingChat && selectedId === null}
          conversation={conversation.data}
          isLoading={selectedId !== null && conversation.isLoading}
          error={conversation.error}
          onRetry={() => void conversation.refetch()}
          onBack={() => url.set({ c: null })}
          onShowCustomer={customerColumn ? undefined : () => setCustomerOpen(true)}
        />
      </div>
      {customerColumn ? <CustomerPanel conversation={conversation.data ?? null} /> : null}
      <CustomerSheet
        conversation={conversation.data ?? null}
        open={customerOpen && !customerColumn}
        onClose={() => setCustomerOpen(false)}
      />
    </div>
  );
}
