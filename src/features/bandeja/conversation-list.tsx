"use client";

import { useEffect, useRef, useState } from "react";
import type { ContactChannel, Conversation } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta, INBOX_CHANNEL_FILTERS } from "@/lib/domain/channels";
import { customerInitials, customerName, messageText, previewPrefix } from "@/lib/domain/conversation";
import { formatAgoShort } from "@/lib/format/dates";
import { cn } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { useRestaurant } from "@/lib/restaurant";
import { Avatar, FilterChip, Tag } from "@/components/ui/primitives";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import { conversationTag } from "./inbox-utils";
import { useConversationList, useCustomerLatestRequest, useLastMessage, useLatestRequests, useUnreadSummary } from "./use-inbox";

export const LIST_PAGE = 50;
const LIST_MAX = 100;
const SEARCH_MAX = 200;

type LatestRequests = ReturnType<typeof useLatestRequests>;

export function ConversationList({
  selectedId,
  onSelect,
  channel,
  onChannel,
  search,
  onSearch,
  limit,
  onShowMore,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  channel: ContactChannel | undefined;
  onChannel: (channel: ContactChannel | undefined) => void;
  search: string;
  onSearch: (value: string) => void;
  limit: number;
  onShowMore: () => void;
}) {
  const { user } = useSession();
  const { timeZone } = useRestaurant();
  const now = useNow();
  const list = useConversationList({ channel, search, limit });
  const requests = useLatestRequests();
  const rows = list.data?.data ?? [];
  const total = list.data?.pagination.total ?? 0;
  const filtered = Boolean(channel || search);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-white" aria-label="Conversaciones">
      <div className="flex flex-col gap-3 border-b border-line px-4.5 pb-3.5 pt-5">
        <div className="flex items-baseline justify-between">
          <h1 className="m-0 text-xl font-bold">Bandeja</h1>
          <UnreadCount />
        </div>
        <SearchInput value={search} onChange={onSearch} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por canal">
          {INBOX_CHANNEL_FILTERS.map((f) => (
            <FilterChip key={f.label} active={f.channel === channel} onClick={() => onChannel(f.channel)}>
              {f.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isError && list.data ? (
          <div className="px-3 pt-3">
            <InlineNotice tone="warning">Sin conexión con el servidor. Se muestran los últimos datos recibidos.</InlineNotice>
          </div>
        ) : null}
        {list.isLoading ? (
          <LoadingState label="Cargando conversaciones…" />
        ) : list.isError && !list.data ? (
          <ErrorState error={list.error} subject="las conversaciones" onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState>{filtered ? "Sin conversaciones para este filtro." : "Aún no hay conversaciones."}</EmptyState>
        ) : (
          <>
            <ul className="m-0 list-none p-0">
              {rows.map((c) => (
                <li key={c.id}>
                  <ConversationRow
                    conversation={c}
                    selected={c.id === selectedId}
                    onSelect={onSelect}
                    meId={user?.id ?? null}
                    now={now}
                    timeZone={timeZone}
                    requests={requests}
                  />
                </li>
              ))}
            </ul>
            {total > rows.length ? (
              limit < LIST_MAX ? (
                <div className="p-3 text-center">
                  <button
                    type="button"
                    onClick={onShowMore}
                    className="h-8 cursor-pointer rounded-lg border border-button bg-white px-3 text-[12.5px] font-semibold text-brand hover:bg-brand-soft"
                  >
                    Mostrar más conversaciones
                  </button>
                </div>
              ) : (
                <p className="m-0 px-4 py-3 text-center text-xs text-subtle">
                  Se muestran las {rows.length} más recientes de {total}. Usa la búsqueda para encontrar otras.
                </p>
              )
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function UnreadCount() {
  const unread = useUnreadSummary();
  if (unread.isLoading) return <div className="text-xs text-faint">…</div>;
  if (!unread.data) {
    return (
      <div className="text-xs text-muted" title="No se pudo cargar">
        — sin leer
      </div>
    );
  }
  return (
    <div className="text-xs text-muted">
      {unread.data.messages}
      {unread.data.partial ? "+" : ""} sin leer
    </div>
  );
}

/**
 * Búsqueda con espera de 300 ms, sincronizada con `?q=`. Si la URL cambia desde fuera (por ejemplo, el
 * botón "Chat" de otra vista limpia los filtros), el texto se actualiza en vez de volver a escribirse.
 * El backend busca solo en los datos del cliente (nombre, apellido, teléfono o correo), no en los mensajes.
 */
function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [emitted, setEmitted] = useState<string | null>(null);
  if (value !== seen) {
    setSeen(value);
    if (value !== emitted) setText(value);
  }

  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === value) return;
    const id = window.setTimeout(() => {
      setEmitted(trimmed);
      latest.current(trimmed);
    }, 300);
    return () => window.clearTimeout(id);
  }, [text, value]);

  return (
    <input
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      maxLength={SEARCH_MAX}
      placeholder="Buscar cliente o teléfono"
      aria-label="Buscar por nombre, teléfono o correo del cliente"
      className="h-9.5 rounded-[10px] border border-field bg-surface-2 px-3 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-brand"
    />
  );
}

function ConversationRow({
  conversation: c,
  selected,
  onSelect,
  meId,
  now,
  timeZone,
  requests,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: string) => void;
  meId: string | null;
  now: number;
  timeZone: string;
  requests: LatestRequests;
}) {
  const ch = channelMeta(c.channel);
  const name = customerName(c.customer, c.channel);
  const unread = c.unreadCount > 0;

  const last = useLastMessage(c);
  const preview =
    c.lastMessageAt === null
      ? "Sin mensajes"
      : last.data
        ? `${previewPrefix(last.data, meId)}${messageText(last.data)}`
        : last.isError
          ? "No se pudo cargar el último mensaje"
          : "…";

  const known = requests.map.get(c.customerId);
  const needsLookup = !known && !requests.complete && !requests.isLoading && !requests.isError;
  const fallback = useCustomerLatestRequest(c.customerId, needsLookup);
  // Sin datos de solicitudes no se muestra etiqueta: "Consulta" sería una suposición.
  const tagKnown = known !== undefined || requests.complete || fallback.data !== undefined;
  const tag = tagKnown ? conversationTag(c, known ?? fallback.data) : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${name}, ${ch.label}${unread ? `, ${c.unreadCount} sin leer` : ""}`}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] gap-2.5 border-0 border-b border-l-[3px] border-solid border-b-line-3 py-3.25 pl-3.5 pr-4 text-left",
        selected ? "border-l-brand bg-brand-soft" : "border-l-transparent bg-white hover:bg-hover-row",
      )}
    >
      <Avatar text={customerInitials(c.customer)} size={40} badge={c.channel} />
      <div className="flex min-w-0 flex-col gap-0.75">
        <div className={cn("truncate text-sm", unread ? "font-bold" : "font-semibold")}>{name}</div>
        <div className="truncate text-[12.5px] text-muted">{preview}</div>
        {tag ? (
          <div className="mt-0.5 flex gap-1.25">
            <Tag tone={tag.tone}>{tag.label}</Tag>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <div className="whitespace-nowrap text-[11.5px] text-subtle">
          {c.lastMessageAt ? formatAgoShort(c.lastMessageAt, now, timeZone) : ""}
        </div>
        {unread ? (
          <div className="grid h-4.75 min-w-4.75 place-items-center rounded-full bg-brand px-1.25 text-[11px] font-bold text-white">
            {c.unreadCount}
          </div>
        ) : null}
      </div>
    </button>
  );
}
