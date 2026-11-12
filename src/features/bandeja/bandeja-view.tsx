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
import { useWebMailList, WebMailPanel } from "./web-mail";

const LIST_MAX = 100;

/**
 * Bandeja (mockup): lista de conversaciones | chat | solicitud y cliente.
 * Estado en la URL: `c` (conversación), `canal` (whatsapp|facebook|instagram|web), `q` (búsqueda) y, con el
 * filtro Web, `correo` (la solicitud de la web abierta: bk-crm no crea conversaciones de la web, así que ese
 * filtro muestra sus correos en solo lectura y sin la columna del cliente).
 *
 * Según el ancho:
 * - xl: las tres columnas.
 * - lg: lista y chat; la ficha del cliente se abre en un panel lateral («Cliente» en el chat).
 * - más estrecho: una sola columna. Sin `c` se ve la lista; con `c`, el chat con «Volver».
 */
export function BandejaView() {
  const url = useUrlParams();
  const selectedParam = url.get("c");
  const selectedId =
    selectedParam && isUuid(selectedParam) ? selectedParam : null;
  const channel = channelFromSlug(url.get("canal"));
  const search = (url.get("q") ?? "").trim().slice(0, 200);
  const twoPanes = useMediaQuery(BREAKPOINTS.lg);
  const customerColumn = useMediaQuery(BREAKPOINTS.xl);
  const [customerOpen, setCustomerOpen] = useState(false);

  // "Mostrar más" amplía la lista; al cambiar de filtro vuelve a la primera tanda.
  const filterKey = `${channel ?? ""}|${search}`;
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = expanded === filterKey ? LIST_MAX : LIST_PAGE;

  const webMail = channel === "WEBSITE";
  const mailParam = url.get("correo");
  const mailId = mailParam && isUuid(mailParam) ? mailParam : null;

  const list = useConversationList({
    channel,
    search,
    limit,
    enabled: !webMail,
  });
  const mails = useWebMailList({ search, limit, enabled: webMail });
  const conversation = useConversation(selectedId);

  // Como en el mockup, con lista y chat a la vista siempre hay una conversación (o un correo) abierto: sin
  // `c` (o `correo`), se abre el primero. En una sola columna no: abrirlo taparía la lista.
  const firstId = list.data?.data[0]?.id;
  const firstMailId = mails.data?.data[0]?.id;
  useEffect(() => {
    if (!twoPanes) return;
    if (webMail) {
      if (!mailParam && firstMailId) url.set({ correo: firstMailId });
    } else if (!selectedParam && firstId) url.set({ c: firstId });
  }, [twoPanes, webMail, mailParam, firstMailId, selectedParam, firstId, url]);

  const showingChat = webMail ? mailParam !== null : selectedParam !== null;
  const withCustomer = customerColumn && !webMail;

  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]",
        !webMail && "xl:grid-cols-[280px_minmax(0,1fr)_300px]",
      )}
    >
      <div
        className={cn(
          "grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)]",
          showingChat && "max-lg:hidden",
        )}
      >
        <ConversationList
          selectedId={selectedId}
          onSelect={(id) => url.set({ c: id })}
          channel={channel}
          onChannel={(next) =>
            url.set({ canal: slugFromChannel(next), correo: null })
          }
          selectedMailId={mailId}
          onSelectMail={(id) => url.set({ correo: id })}
          search={search}
          onSearch={(value) => url.set({ q: value || null })}
          limit={limit}
          onShowMore={() => setExpanded(filterKey)}
        />
      </div>
      <div
        className={cn(
          "grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)]",
          !showingChat && "max-lg:hidden",
        )}
      >
        {webMail ? (
          <WebMailPanel
            requestId={mailId}
            onBack={() => url.set({ correo: null })}
          />
        ) : (
          <ChatPanel
            selected={showingChat}
            invalid={showingChat && selectedId === null}
            conversation={conversation.data}
            isLoading={selectedId !== null && conversation.isLoading}
            error={conversation.error}
            onRetry={() => void conversation.refetch()}
            onBack={() => url.set({ c: null })}
            onShowCustomer={
              customerColumn ? undefined : () => setCustomerOpen(true)
            }
          />
        )}
      </div>
      {withCustomer ? (
        <CustomerPanel conversation={conversation.data ?? null} />
      ) : null}
      <CustomerSheet
        conversation={conversation.data ?? null}
        open={customerOpen && !customerColumn && !webMail}
        onClose={() => setCustomerOpen(false)}
      />
    </div>
  );
}
