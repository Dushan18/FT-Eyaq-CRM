"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ApiError, newIdempotencyKey } from "@/lib/api/client";
import { conversationsApi } from "@/lib/api/endpoints";
import type { Conversation, Message, SamantaReservationOutcome } from "@/lib/api/types";
import {
  isSendableChannel,
  OUTBOUND_CONTENT_MAX_LENGTH,
} from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta } from "@/lib/domain/channels";
import {
  conversationMode,
  customerInitials,
  customerName,
  messageAuthor,
  messageText,
  MODE_META,
} from "@/lib/domain/conversation";
import { formatAgoShort, formatMessageTime } from "@/lib/format/dates";
import { cn, personName } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { useRestaurant } from "@/lib/restaurant";
import { ChevronLeft } from "lucide-react";
import { Avatar, Button, Panel, Tag } from "@/components/ui/primitives";
import { TONES } from "@/lib/domain/tones";
import {
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingState,
} from "@/components/ui/state";
import {
  composerState,
  conversationControls,
  estimateReplyWindow,
  isOwnerConversation,
  lastInboundAt,
  OWNER_CONVERSATION_NOTICE,
  messageTimestamp,
  outboundAuthorLabel,
  outboundStatusView,
  sendErrorText,
  type ComposerState,
} from "./inbox-utils";
import { replyMaxBytes, replyMaxLength, utf8Length } from "./channel-utils";
import { SamantaPanel } from "./samanta-panel";
import {
  actionErrorText,
  SendFailedError,
  useConversationActions,
} from "./use-conversation-actions";
import {
  storeConversationRead,
  useConversationMessages,
  useInvalidateInbox,
} from "./use-inbox";
import {
  RESERVATION_OUTCOME_LABEL,
  samantaMessageIds,
  samantaReservationOutcomes,
  useAssistantDrafts,
} from "./use-samanta";

/** Panel central: cabecera con el modo de atención, historial y cuadro de texto. */
export function ChatPanel({
  selected,
  invalid,
  conversation,
  isLoading,
  error,
  onRetry,
  onBack,
  onShowCustomer,
}: {
  /** Hay una conversación indicada en la URL. */
  selected: boolean;
  /** El id de la URL no tiene formato válido. */
  invalid: boolean;
  conversation: Conversation | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Vuelve a la lista; el botón solo se ve cuando la Bandeja muestra una columna (por debajo de lg). */
  onBack?: () => void;
  /** Abre la ficha del cliente cuando no cabe como columna. */
  onShowCustomer?: () => void;
}) {
  if (!selected) {
    return (
      <Panel as="main" className="grid place-items-center">
        <EmptyState>
          Selecciona una conversación para ver sus mensajes.
        </EmptyState>
      </Panel>
    );
  }
  if (!conversation) {
    const notFound =
      invalid ||
      (error instanceof ApiError && (error.isNotFound || error.status === 400));
    return (
      <Panel as="main" className="flex min-h-0 flex-col">
        {onBack ? (
          <div className="border-b border-line px-3 py-2.5 lg:hidden">
            <BackButton onClick={onBack} withLabel />
          </div>
        ) : null}
        <div className="grid flex-1 place-items-center">
          {isLoading ? (
            <LoadingState label="Cargando conversación…" />
          ) : notFound ? (
            <EmptyState>
              No se encontró la conversación. Puede que el enlace no sea válido.
            </EmptyState>
          ) : (
            <ErrorState
              error={error}
              subject="la conversación"
              onRetry={onRetry}
            />
          )}
        </div>
      </Panel>
    );
  }
  // La clave reinicia el borrador y el desplazamiento al cambiar de conversación.
  return (
    <ChatConversation
      key={conversation.id}
      conversation={conversation}
      onBack={onBack}
      onShowCustomer={onShowCustomer}
    />
  );
}

/** «‹ Conversaciones»: vuelve a la lista en la Bandeja de una sola columna. */
function BackButton({
  onClick,
  withLabel = false,
}: {
  onClick: () => void;
  withLabel?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={withLabel ? undefined : "Volver a las conversaciones"}
      title="Volver a las conversaciones"
      className="flex h-8.5 shrink-0 cursor-pointer items-center gap-1 rounded-lg border-0 bg-transparent px-1.5 text-[13px] font-semibold text-brand hover:bg-surface lg:hidden"
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
      {withLabel ? "Conversaciones" : null}
    </button>
  );
}

function ChatConversation({
  conversation,
  onBack,
  onShowCustomer,
}: {
  conversation: Conversation;
  onBack?: () => void;
  onShowCustomer?: () => void;
}) {
  const session = useSession();
  const meId = session.user?.id ?? null;
  const { timeZone, config } = useRestaurant();
  const now = useNow(30_000);
  const history = useConversationMessages(conversation.id);
  const actions = useConversationActions(conversation, meId);
  const drafts = useAssistantDrafts(conversation);
  const samantaIds = useMemo(
    () => samantaMessageIds(drafts.data?.data),
    [drafts.data],
  );
  const outcomes = useMemo(() => samantaReservationOutcomes(drafts.data?.data), [drafts.data]);
  const owner = isOwnerConversation(conversation, config?.ownerWhatsappNumber);
  const [actionError, setActionError] = useState<string | null>(null);

  useMarkAsRead(
    conversation,
    history.messages,
    session.can("conversation.read"),
  );

  const name = customerName(conversation.customer, conversation.channel);
  const ch = channelMeta(conversation.channel);
  const lastInbound = lastInboundAt(history.messages);
  const controls = conversationControls(conversation, meId, session.roles, { owner });
  // Ventana de 24 h estimada en los dos canales con envío (WhatsApp y Messenger); el backend manda.
  const replyWindow =
    isSendableChannel(conversation.channel) && history.messages.length > 0
      ? estimateReplyWindow(history.messages, now)
      : null;
  const composer = composerState(
    conversation,
    meId,
    session.roles,
    history.isLoading ? null : replyWindow,
  );

  const run = async (action: Parameters<typeof actions.mutateAsync>[0]) => {
    setActionError(null);
    try {
      await actions.mutateAsync(action);
    } catch (error) {
      setActionError(actionErrorText(error));
    }
  };

  return (
    <Panel
      as="main"
      className="flex min-h-0 flex-col overflow-hidden"
      aria-label={`Conversación con ${name}`}
    >
      {/* Si no caben en una línea, el modo y los botones bajan a una segunda fila. */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-3 sm:px-4.5 sm:py-3.5">
        {onBack ? <BackButton onClick={onBack} /> : null}
        <Avatar text={customerInitials(conversation.customer)} size={38} />
        <div className="min-w-0 flex-1 basis-36">
          <h2 className="m-0 flex items-center gap-2 truncate text-base font-bold">
            <span className="truncate">{name}</span>
            {owner ? <Tag tone={TONES.orange}>Propietario</Tag> : null}
          </h2>
          <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-[12.5px] text-muted">
            <span>{ch.label}</span>
            {lastInbound !== null ? (
              <>
                <span
                  className="size-0.75 shrink-0 rounded-full bg-dot"
                  aria-hidden="true"
                />
                <span title="Último mensaje del cliente">
                  Activo {formatAgoShort(lastInbound, now, timeZone)}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {onShowCustomer ? (
          <Button
            variant="outline"
            className="h-8.5 shrink-0 px-3 xl:hidden"
            onClick={onShowCustomer}
          >
            Cliente
          </Button>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <ModePill conversation={conversation} />
          {controls.pause.visible ? (
            <Button
              variant="outline"
              className="h-8.5 shrink-0 px-3.5"
              disabled={actions.isPending}
              onClick={() =>
                void run({ kind: "pause", paused: !controls.pause.paused })
              }
            >
              {controls.pause.paused ? "Reanudar" : "Pausar"}
            </Button>
          ) : null}
          {controls.transfer.visible ? (
            <Button
              variant={controls.transfer.kind === "take" ? "orange" : "soft"}
              className="h-8.5 shrink-0 px-3.5"
              disabled={actions.isPending || !controls.transfer.enabled}
              title={controls.transfer.reason ?? undefined}
              onClick={() => void run({ kind: controls.transfer.kind })}
            >
              {controls.transfer.kind === "take"
                ? "Pasar a humano"
                : "Devolver a Samanta"}
            </Button>
          ) : null}
        </div>
      </header>

      {owner ? (
        <div className="border-b border-line px-4.5 py-2">
          <InlineNotice tone="warning">{OWNER_CONVERSATION_NOTICE}</InlineNotice>
        </div>
      ) : null}

      {actionError ? (
        <div className="border-b border-line px-4.5 py-2">
          <InlineNotice tone="error">{actionError}</InlineNotice>
        </div>
      ) : null}

      <MessageList
        conversation={conversation}
        history={history}
        meId={meId}
        timeZone={timeZone}
        now={now}
        samantaIds={samantaIds}
        outcomes={outcomes}
      />

      <SamantaPanel
        conversation={conversation}
        messages={history.messages}
        drafts={drafts}
      />

      <Composer
        conversation={conversation}
        state={composer}
        actions={actions}
      />
    </Panel>
  );
}

function ModePill({ conversation }: { conversation: Conversation }) {
  const mode = conversationMode(conversation);
  const meta = MODE_META[mode];
  const holder = conversation.assignedUser
    ? personName(
        conversation.assignedUser.firstName,
        conversation.assignedUser.lastName,
        "",
      )
    : "";
  return (
    <div
      className="flex h-8.5 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[12.5px] font-semibold"
      style={{ background: meta.bg, color: meta.fg }}
      title={holder ? `Responsable: ${holder}` : undefined}
    >
      <span
        className="size-1.75 rounded-full"
        style={{ background: meta.dot }}
        aria-hidden="true"
      />
      <span>
        {meta.label}
        {mode === "operador" && holder ? (
          <span className="sr-only">: {holder}</span>
        ) : null}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- lectura

/**
 * Lectura compartida del equipo: al ver el chat se marcan como leídos los mensajes del cliente hasta
 * el último visible (con una espera de 500 ms). OWNER no puede marcar (403): no se llama.
 */
function useMarkAsRead(
  conversation: Conversation,
  messages: Message[],
  allowed: boolean,
) {
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
  samantaIds,
  outcomes,
}: {
  conversation: Conversation;
  history: History;
  meId: string | null;
  timeZone: string;
  now: number;
  /** Mensajes que salieron de un borrador de Samanta aprobado. */
  samantaIds: ReadonlySet<string>;
  outcomes: ReadonlyMap<string, SamantaReservationOutcome>;
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
    if (el)
      nearBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
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
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface px-3 py-4 sm:px-6.5 sm:py-5.5"
      role="log"
      aria-label="Mensajes"
    >
      {history.stale ? (
        <InlineNotice tone="warning">
          Sin conexión: los mensajes pueden no estar al día.
        </InlineNotice>
      ) : null}
      {history.isLoading ? (
        <LoadingState label="Cargando mensajes…" className="my-auto" />
      ) : history.error && history.messages.length === 0 ? (
        <ErrorState
          error={history.error}
          subject="los mensajes"
          onRetry={() => void history.refetch()}
          className="my-auto"
        />
      ) : history.messages.length === 0 ? (
        <EmptyState className="my-auto">
          Aún no hay mensajes en esta conversación.
        </EmptyState>
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
                {history.loadingOlder
                  ? "Cargando…"
                  : "Cargar mensajes anteriores"}
              </button>
              {history.olderError ? (
                <span className="text-xs text-[#b42323]">
                  No se pudieron cargar los mensajes anteriores.
                </span>
              ) : null}
            </div>
          ) : null}
          {history.messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              meId={meId}
              assignee={conversation.assignedUser}
              timeZone={timeZone}
              now={now}
              samantaIds={samantaIds}
              outcome={outcomes.get(m.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

const STATUS_CLASS = {
  muted: "",
  warning: "font-semibold text-[#b14a0b]",
  error: "font-semibold text-[#b42323]",
} as const;

function Bubble({
  message: m,
  meId,
  assignee,
  timeZone,
  now,
  samantaIds,
  outcome,
}: {
  message: Message;
  meId: string | null;
  assignee: Conversation["assignedUser"];
  timeZone: string;
  now: number;
  samantaIds: ReadonlySet<string>;
  /** Qué hizo la acción de reserva de Samanta en este mensaje (respuestas automáticas). */
  outcome?: SamantaReservationOutcome;
}) {
  const author = messageAuthor(m, samantaIds);
  const time = formatMessageTime(messageTimestamp(m), timeZone, now);
  const text = messageText(m) || "—";

  if (author === "cliente") {
    return (
      <div className="flex w-fit max-w-[88%] flex-col gap-1 self-start sm:max-w-[75%] xl:max-w-[62%]">
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

  const status = outboundStatusView(m, author === "samanta");
  return (
    <div className="flex w-fit max-w-[88%] flex-col items-end gap-1 self-end sm:max-w-[75%] xl:max-w-[62%]">
      <div
        className={cn(
          "whitespace-pre-wrap wrap-break-word rounded-[16px_4px_16px_16px] px-3.5 py-2.5 text-sm leading-[1.45] text-pretty",
          author === "samanta"
            ? "bg-brand-bubble text-ink"
            : "bg-brand text-white",
        )}
      >
        {text}
      </div>
      <div className="flex flex-wrap justify-end gap-x-1 pr-1 text-right text-[11px] text-faint">
        <span className="whitespace-nowrap">
          {outboundAuthorLabel(m, meId, assignee, samantaIds)} · {time}
        </span>
        {outcome ? <span className="font-semibold text-brand">· {RESERVATION_OUTCOME_LABEL[outcome]}</span> : null}
        {status ? (
          <span className={STATUS_CLASS[status.tone]}>· {status.text}</span>
        ) : null}
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

  const maxBytes = replyMaxBytes(conversation.channel);
  const submit = async () => {
    const content = draft.trim();
    if (!content || !state.enabled || sending) return;
    if (maxBytes !== null && utf8Length(content) > maxBytes) return;
    if (pendingKey.current?.content !== content)
      pendingKey.current = { content, key: newIdempotencyKey() };
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
      setError(
        failure instanceof SendFailedError
          ? sendErrorText(failure.reason, conversation.channel)
          : actionErrorText(failure),
      );
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
  // Tope por canal (content.length): 4096 en WhatsApp, 2000 en Messenger y 1000 en Instagram. Instagram además
  // admite 1000 bytes UTF-8, que es lo que manda: las tildes ocupan 2 y los emojis 4.
  const maxLength =
    replyMaxLength(conversation.channel) ?? OUTBOUND_CONTENT_MAX_LENGTH;
  const bytes = maxBytes === null ? 0 : utf8Length(draft.trim());
  const overBytes = maxBytes !== null && bytes > maxBytes;
  const nearLimit =
    maxBytes === null ? draft.length > maxLength - 300 : bytes > maxBytes - 300;

  return (
    <div className="flex flex-col gap-2 border-t border-line px-3 py-3 sm:px-5.5 sm:py-3.5">
      {hint ? (
        <div
          className="text-xs text-muted"
          id={`composer-hint-${conversation.id}`}
        >
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
          maxLength={maxLength}
          placeholder="Escribe un mensaje"
          aria-label="Mensaje"
          aria-describedby={
            hint ? `composer-hint-${conversation.id}` : undefined
          }
          className="h-11 min-w-0 flex-1 resize-none rounded-xl border border-field bg-white px-3.5 py-2.75 text-sm leading-[1.45] text-ink outline-none placeholder:text-faint focus:border-brand disabled:cursor-not-allowed disabled:bg-surface"
        />
        <button
          type="submit"
          disabled={
            !state.enabled || sending || draft.trim() === "" || overBytes
          }
          className="h-11 shrink-0 cursor-pointer rounded-xl border-0 bg-brand px-5 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </form>
      {overBytes ? (
        <InlineNotice tone="error">
          Instagram admite hasta {maxBytes} bytes por respuesta: las tildes y
          los emojis ocupan más de uno.
        </InlineNotice>
      ) : null}
      {nearLimit ? (
        <div className="text-right text-[11px] text-subtle">
          {maxBytes === null
            ? `${draft.length}/${maxLength}`
            : `${bytes}/${maxBytes} bytes`}
        </div>
      ) : null}
    </div>
  );
}
