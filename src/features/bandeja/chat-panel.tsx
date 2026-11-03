"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ApiError, newIdempotencyKey } from "@/lib/api/client";
import { conversationsApi } from "@/lib/api/endpoints";
import type { Conversation, Message } from "@/lib/api/types";
import { OUTBOUND_CONTENT_MAX_LENGTH } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta } from "@/lib/domain/channels";
import { conversationMode, customerName, messageAuthor, messageText, MODE_META } from "@/lib/domain/conversation";
import { formatAgoShort, formatMessageTime } from "@/lib/format/dates";
import { cn, initials, personName } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { useRestaurant } from "@/lib/restaurant";
import { Avatar, Button, Panel } from "@/components/ui/primitives";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import {
  composerState,
  conversationControls,
  estimateReplyWindow,
  lastInboundAt,
  messageTimestamp,
  outboundAuthorLabel,
  outboundStatusView,
  sendErrorText,
  type ComposerState,
} from "./inbox-utils";
import { actionErrorText, SendFailedError, useConversationActions } from "./use-conversation-actions";
import { storeConversationRead, useConversationMessages, useInvalidateInbox } from "./use-inbox";

/** Panel central: cabecera con el modo de atención, historial y cuadro de texto. */
export function ChatPanel({
  selected,
  invalid,
  conversation,
  isLoading,
  error,
  onRetry,
}: {
  /** Hay una conversación indicada en la URL. */
  selected: boolean;
  /** El id de la URL no tiene formato válido. */
  invalid: boolean;
  conversation: Conversation | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (!selected) {
    return (
      <Panel as="main" className="grid place-items-center">
        <EmptyState>Selecciona una conversación para ver sus mensajes.</EmptyState>
      </Panel>
    );
  }
  if (!conversation) {
    const notFound = invalid || (error instanceof ApiError && (error.isNotFound || error.status === 400));
    return (
      <Panel as="main" className="grid place-items-center">
        {isLoading ? (
          <LoadingState label="Cargando conversación…" />
        ) : notFound ? (
          <EmptyState>No se encontró la conversación. Puede que el enlace no sea válido.</EmptyState>
        ) : (
          <ErrorState error={error} subject="la conversación" onRetry={onRetry} />
        )}
      </Panel>
    );
  }
  // La clave reinicia el borrador y el desplazamiento al cambiar de conversación.
  return <ChatConversation key={conversation.id} conversation={conversation} />;
}

function ChatConversation({ conversation }: { conversation: Conversation }) {
  const session = useSession();
  const meId = session.user?.id ?? null;
  const { timeZone } = useRestaurant();
  const now = useNow(30_000);
  const history = useConversationMessages(conversation.id);
  const actions = useConversationActions(conversation, meId);
  const [actionError, setActionError] = useState<string | null>(null);

  useMarkAsRead(conversation, history.messages, session.can("conversation.read"));

  const name = customerName(conversation.customer);
  const ch = channelMeta(conversation.channel);
  const lastInbound = lastInboundAt(history.messages);
  const controls = conversationControls(conversation, meId, session.roles);
  const replyWindow =
    conversation.channel === "WHATSAPP" && history.messages.length > 0 ? estimateReplyWindow(history.messages, now) : null;
  const composer = composerState(conversation, meId, session.roles, history.isLoading ? null : replyWindow);

  const run = async (action: Parameters<typeof actions.mutateAsync>[0]) => {
    setActionError(null);
    try {
      await actions.mutateAsync(action);
    } catch (error) {
      setActionError(actionErrorText(error));
    }
  };

  return (
    <Panel as="main" className="flex min-h-0 flex-col overflow-hidden" aria-label={`Conversación con ${name}`}>
      <header className="flex items-center gap-2 border-b border-line px-[18px] py-3.5">
        <Avatar text={initials(name)} size={38} />
        <div className="min-w-[120px] flex-1">
          <h2 className="m-0 truncate text-base font-bold">{name}</h2>
          <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-[12.5px] text-muted">
            <span>{ch.label}</span>
            {lastInbound !== null ? (
              <>
                <span className="size-[3px] shrink-0 rounded-full bg-dot" aria-hidden="true" />
                <span title="Último mensaje del cliente">Activo {formatAgoShort(lastInbound, now, timeZone)}</span>
              </>
            ) : null}
          </div>
        </div>
        <ModePill conversation={conversation} />
        {controls.pause.visible ? (
          <Button
            variant="outline"
            className="h-[34px] shrink-0 px-3.5"
            disabled={actions.isPending}
            onClick={() => void run({ kind: "pause", paused: !controls.pause.paused })}
          >
            {controls.pause.paused ? "Reanudar" : "Pausar"}
          </Button>
        ) : null}
        {controls.transfer.visible ? (
          <Button
            variant={controls.transfer.kind === "take" ? "orange" : "soft"}
            className="h-[34px] shrink-0 px-3.5"
            disabled={actions.isPending || !controls.transfer.enabled}
            title={controls.transfer.reason ?? undefined}
            onClick={() => void run({ kind: controls.transfer.kind })}
          >
            {controls.transfer.kind === "take" ? "Pasar a humano" : "Devolver a Samanta"}
          </Button>
        ) : null}
      </header>

      {actionError ? (
        <div className="border-b border-line px-[18px] py-2">
          <InlineNotice tone="error">{actionError}</InlineNotice>
        </div>
      ) : null}

      <MessageList conversation={conversation} history={history} meId={meId} timeZone={timeZone} now={now} />

      <Composer conversation={conversation} state={composer} actions={actions} />
    </Panel>
  );
}

function ModePill({ conversation }: { conversation: Conversation }) {
  const mode = conversationMode(conversation);
  const meta = MODE_META[mode];
  const holder = conversation.assignedUser
    ? personName(conversation.assignedUser.firstName, conversation.assignedUser.lastName, "")
    : "";
  return (
    <div
      className="flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[12.5px] font-semibold"
      style={{ background: meta.bg, color: meta.fg }}
      title={holder ? `Responsable: ${holder}` : undefined}
    >
      <span className="size-[7px] rounded-full" style={{ background: meta.dot }} aria-hidden="true" />
      <span>
        {meta.label}
        {mode === "operador" && holder ? <span className="sr-only">: {holder}</span> : null}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- lectura

/**
 * Lectura compartida del equipo: al ver el chat se marcan como leídos los mensajes del cliente hasta
 * el último visible (con una espera de 500 ms). OWNER no puede marcar (403): no se llama.
 */
function useMarkAsRead(conversation: Conversation, messages: Message[], allowed: boolean) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateInbox();
  const marked = useRef<string | null>(null);
  const newestId = messages.at(-1)?.id ?? null;
  const { id, unreadCount } = conversation;

  useEffect(() => {
    if (!allowed || !newestId || unreadCount === 0) return;
    const key = `${id}:${newestId}:${unreadCount}`;
    if (marked.current === key) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      marked.current = key;
      conversationsApi
        .markRead(id, newestId)
        .then(() => {
          storeConversationRead(queryClient, id);
          invalidate(id);
        })
        .catch(() => {
          // Se reintenta con el siguiente cambio; no bloquea la lectura del chat.
          marked.current = null;
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [allowed, id, newestId, unreadCount, queryClient, invalidate]);
}

// ---------------------------------------------------------------- historial

type History = ReturnType<typeof useConversationMessages>;

function MessageList({
  conversation,
  history,
  meId,
  timeZone,
  now,
}: {
  conversation: Conversation;
  history: History;
  meId: string | null;
  timeZone: string;
  now: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const restoreFromBottom = useRef<number | null>(null);
  const firstId = history.messages[0]?.id;
  const lastId = history.messages.at(-1)?.id;

  // Al cargar mensajes anteriores se conserva la posición visible.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || restoreFromBottom.current === null) return;
    el.scrollTop = el.scrollHeight - restoreFromBottom.current;
    restoreFromBottom.current = null;
  }, [firstId]);

  // Mensajes nuevos: se baja al final solo si ya se estaba al final.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = () => {
    const el = scroller.current;
    if (el) restoreFromBottom.current = el.scrollHeight - el.scrollTop;
    void history.loadOlder();
  };

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface px-[26px] py-[22px]"
      role="log"
      aria-label="Mensajes"
    >
      {history.stale ? <InlineNotice tone="warning">Sin conexión: los mensajes pueden no estar al día.</InlineNotice> : null}
      {history.isLoading ? (
        <LoadingState label="Cargando mensajes…" className="my-auto" />
      ) : history.error && history.messages.length === 0 ? (
        <ErrorState error={history.error} subject="los mensajes" onRetry={() => void history.refetch()} className="my-auto" />
      ) : history.messages.length === 0 ? (
        <EmptyState className="my-auto">Aún no hay mensajes en esta conversación.</EmptyState>
      ) : (
        <>
          {history.hasOlder ? (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={loadOlder}
                disabled={history.loadingOlder}
                className="h-7 cursor-pointer rounded-full border border-button bg-white px-3 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-60"
              >
                {history.loadingOlder ? "Cargando…" : "Cargar mensajes anteriores"}
              </button>
              {history.olderError ? (
                <span className="text-xs text-[#b42323]">No se pudieron cargar los mensajes anteriores.</span>
              ) : null}
            </div>
          ) : null}
          {history.messages.map((m) => (
            <Bubble key={m.id} message={m} meId={meId} assignee={conversation.assignedUser} timeZone={timeZone} now={now} />
          ))}
        </>
      )}
    </div>
  );
}

const STATUS_CLASS = { muted: "", warning: "font-semibold text-[#b14a0b]", error: "font-semibold text-[#b42323]" } as const;

function Bubble({
  message: m,
  meId,
  assignee,
  timeZone,
  now,
}: {
  message: Message;
  meId: string | null;
  assignee: Conversation["assignedUser"];
  timeZone: string;
  now: number;
}) {
  const author = messageAuthor(m);
  const time = formatMessageTime(messageTimestamp(m), timeZone, now);
  const text = messageText(m) || "—";

  if (author === "cliente") {
    return (
      <div className="flex w-fit max-w-[62%] flex-col gap-1 self-start">
        <div className="whitespace-pre-wrap wrap-break-word rounded-[4px_16px_16px_16px] border border-bubble bg-white px-3.5 py-2.5 text-sm leading-[1.45] text-pretty">
          {text}
        </div>
        <div className="whitespace-nowrap pl-1 text-[11px] text-faint">
          <span className="sr-only">Cliente · </span>
          {time}
        </div>
      </div>
    );
  }

  const status = outboundStatusView(m);
  return (
    <div className="flex w-fit max-w-[62%] flex-col items-end gap-1 self-end">
      <div
        className={cn(
          "whitespace-pre-wrap wrap-break-word rounded-[16px_4px_16px_16px] px-3.5 py-2.5 text-sm leading-[1.45] text-pretty",
          author === "samanta" ? "bg-brand-bubble text-ink" : "bg-brand text-white",
        )}
      >
        {text}
      </div>
      <div className="flex flex-wrap justify-end gap-x-1 pr-1 text-right text-[11px] text-faint">
        <span className="whitespace-nowrap">
          {outboundAuthorLabel(m, meId, assignee)} · {time}
        </span>
        {status ? <span className={STATUS_CLASS[status.tone]}>· {status.text}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- cuadro de texto

const MAX_TEXTAREA_PX = 132;

function Composer({
  conversation,
  state,
  actions,
}: {
  conversation: Conversation;
  state: ComposerState;
  actions: ReturnType<typeof useConversationActions>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // La misma clave se reutiliza al reintentar el mismo texto: el backend no duplica el envío.
  const pendingKey = useRef<{ content: string; key: string } | null>(null);

  const resize = () => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  };

  const submit = async () => {
    const content = draft.trim();
    if (!content || !state.enabled || sending) return;
    if (pendingKey.current?.content !== content) pendingKey.current = { content, key: newIdempotencyKey() };
    setSending(true);
    setError(null);
    setWarning(null);
    try {
      const result = await actions.mutateAsync({
        kind: "send",
        content,
        idempotencyKey: pendingKey.current.key,
        plan: state.plan,
      });
      pendingKey.current = null;
      setDraft("");
      requestAnimationFrame(resize);
      if (result.warning) setWarning(result.warning);
    } catch (failure) {
      setError(failure instanceof SendFailedError ? sendErrorText(failure.reason) : actionErrorText(failure));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const hint = state.enabled ? state.notice : state.reason;
  const nearLimit = draft.length > OUTBOUND_CONTENT_MAX_LENGTH - 300;

  return (
    <div className="flex flex-col gap-2 border-t border-line px-[22px] py-3.5">
      {hint ? (
        <div className="text-xs text-muted" id={`composer-hint-${conversation.id}`}>
          {hint}
        </div>
      ) : null}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {warning ? <InlineNotice tone="warning">{warning}</InlineNotice> : null}
      <form
        className="flex items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          ref={textarea}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
          disabled={!state.enabled}
          maxLength={OUTBOUND_CONTENT_MAX_LENGTH}
          placeholder="Escribe un mensaje"
          aria-label="Mensaje"
          aria-describedby={hint ? `composer-hint-${conversation.id}` : undefined}
          className="h-11 min-w-0 flex-1 resize-none rounded-xl border border-field bg-white px-3.5 py-[11px] text-sm leading-[1.45] text-ink outline-none placeholder:text-faint focus:border-brand disabled:cursor-not-allowed disabled:bg-surface"
        />
        <button
          type="submit"
          disabled={!state.enabled || sending || draft.trim() === ""}
          className="h-11 shrink-0 cursor-pointer rounded-xl border-0 bg-brand px-5 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </form>
      {nearLimit ? (
        <div className="text-right text-[11px] text-subtle">
          {draft.length}/{OUTBOUND_CONTENT_MAX_LENGTH}
        </div>
      ) : null}
    </div>
  );
}
