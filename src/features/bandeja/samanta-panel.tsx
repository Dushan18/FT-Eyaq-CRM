"use client";

import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { isDisabledInServer } from "@/lib/api/errors";
import type {
  Conversation,
  Message,
  SamantaDraft,
  SamantaDraftListResponse,
} from "@/lib/api/types";
import { isSendableChannel, SAMANTA_DRAFT_MAX_LENGTH } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useNow } from "@/lib/hooks/use-now";
import { Button } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";
import { replyMaxBytes, replyMaxLength, utf8Length } from "./channel-utils";
import { actionErrorText } from "./use-conversation-actions";
import {
  activeDraft,
  draftFailureText,
  draftSource,
  INTENT_LABEL,
  isDraftOutdated,
  useAssistantDraft,
  useGenerateDraft,
  useReviewDraft,
} from "./use-samanta";

/**
 * Panel de Samanta sobre el cuadro de texto: pedir un borrador para el último mensaje del cliente,
 * revisarlo, editarlo y aprobarlo (se encola como un mensaje del equipo) o descartarlo.
 * WhatsApp, Messenger e Instagram. Generar y revisar: ADMIN y OPERATOR; un OPERATOR no puede si la conversación
 * está asignada a otra persona. Los demás roles ven el borrador sin poder actuar.
 */
export function SamantaPanel({
  conversation,
  messages,
  drafts,
}: {
  conversation: Conversation;
  messages: readonly Message[];
  drafts: UseQueryResult<SamantaDraftListResponse>;
}) {
  const session = useSession();
  const meId = session.user?.id ?? null;
  const now = useNow(30_000);
  const generate = useGenerateDraft(conversation.id);
  const review = useReviewDraft(conversation.id);
  const [offInServer, setOffInServer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listed = activeDraft(drafts.data?.data);
  const live = useAssistantDraft(
    conversation.id,
    listed?.status === "GENERATING" ? listed.id : null,
    listed ?? undefined,
  );
  const draft =
    listed?.status === "GENERATING" && live.data ? live.data : listed;

  if (!isSendableChannel(conversation.channel)) return null;

  const canReview = session.can("draft.review");
  const assignedToOther =
    conversation.assignedUserId !== null &&
    conversation.assignedUserId !== meId;
  const blockedByAssignee = assignedToOther && !session.roles.includes("ADMIN");
  const source = draftSource(messages);
  const newestSequence = messages.at(-1)?.sequence ?? null;
  const outdated =
    draft?.status === "READY" &&
    isDraftOutdated(draft, newestSequence, conversation.isAssistantPaused, now);

  const fail = (failure: unknown) => {
    if (isDisabledInServer(failure)) setOffInServer(true);
    else setError(actionErrorText(failure));
  };

  const onGenerate = () => {
    if (!source) return;
    setError(null);
    generate.mutate(source.id, { onError: fail });
  };

  const generateBlock = (() => {
    if (!canReview) return null;
    if (offInServer)
      return "Samanta está desactivada en el servidor: no se pueden generar borradores.";
    if (conversation.isAssistantPaused)
      return "Samanta está en pausa en esta conversación. Reanúdala para pedir un borrador.";
    if (blockedByAssignee)
      return "Otra persona atiende esta conversación: solo ella o un administrador pueden usar a Samanta.";
    return null;
  })();

  let body: React.ReactNode = null;
  if (offInServer && !draft) {
    body = <p className="m-0 text-[12.5px] text-muted">{generateBlock}</p>;
  } else if (draft?.status === "GENERATING" || draft?.status === "SCHEDULED") {
    body = (
      <p
        className="m-0 flex items-center gap-2 text-[12.5px] text-muted"
        role="status"
      >
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-field border-t-brand"
          aria-hidden="true"
        />
        Samanta está preparando un borrador…
      </p>
    );
  } else if (draft?.status === "READY" && !outdated) {
    body = (
      <DraftEditor
        key={`${draft.id}:${draft.revision}`}
        draft={draft}
        now={now}
        maxLength={Math.min(
          SAMANTA_DRAFT_MAX_LENGTH,
          replyMaxLength(conversation.channel) ?? SAMANTA_DRAFT_MAX_LENGTH,
        )}
        maxBytes={replyMaxBytes(conversation.channel)}
        editable={canReview && !blockedByAssignee}
        busy={review.isPending}
        onApprove={(content) => {
          setError(null);
          review.mutate(
            { draft, action: "approve", content },
            { onError: fail },
          );
        }}
        onReject={() => {
          setError(null);
          review.mutate({ draft, action: "reject" }, { onError: fail });
        }}
      />
    );
  } else if (
    draft &&
    (draft.status === "STALE" || draft.status === "FAILED" || outdated)
  ) {
    body = (
      <Retry
        text={
          draft.status === "FAILED"
            ? draftFailureText(draft)
            : "El borrador quedó desactualizado: llegó otro mensaje, se pausó a Samanta o pasaron 15 minutos."
        }
        action={
          canReview && source && !generateBlock
            ? {
                label: "Generar otro",
                busy: generate.isPending,
                onClick: onGenerate,
              }
            : null
        }
      />
    );
  } else if (canReview && source) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-0 flex-1 text-[12.5px] text-muted">
          {generateBlock ??
            "Samanta puede preparar una respuesta al último mensaje del cliente. La revisas antes de enviarla."}
        </p>
        <Button
          variant="soft"
          className="h-8 px-3"
          disabled={Boolean(generateBlock) || generate.isPending}
          onClick={onGenerate}
        >
          {generate.isPending ? "Generando…" : "Generar borrador"}
        </Button>
      </div>
    );
  }

  if (!body && !error) return null;
  return (
    <section
      aria-label="Borrador de Samanta"
      className="flex flex-col gap-2 border-t border-line bg-[#f6f9ff] px-3 py-3 sm:px-5.5"
    >
      <div className="text-[11px] font-bold tracking-[.06em] text-brand">
        SAMANTA · BORRADOR CON REVISIÓN
      </div>
      {body}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </section>
  );
}

function Retry({
  text,
  action,
}: {
  text: string;
  action: { label: string; busy: boolean; onClick: () => void } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="m-0 min-w-0 flex-1 text-[12.5px] text-muted">{text}</p>
      {action ? (
        <Button
          variant="soft"
          className="h-8 px-3"
          disabled={action.busy}
          onClick={action.onClick}
        >
          {action.busy ? "Generando…" : action.label}
        </Button>
      ) : null}
    </div>
  );
}

function DraftEditor({
  draft,
  now,
  maxLength,
  maxBytes,
  editable,
  busy,
  onApprove,
  onReject,
}: {
  draft: SamantaDraft;
  now: number;
  /** Tope del canal: el backend rechaza la aprobación de un texto más largo. */
  maxLength: number;
  /** Bytes UTF-8 (solo Instagram), o null. */
  maxBytes: number | null;
  editable: boolean;
  busy: boolean;
  onApprove: (content: string) => void;
  onReject: () => void;
}) {
  const [text, setText] = useState(draft.content ?? "");
  const minutesLeft = Math.max(
    0,
    Math.ceil((Date.parse(draft.expiresAt) - now) / 60_000),
  );
  const empty = text.trim() === "";
  const overBytes = maxBytes !== null && utf8Length(text.trim()) > maxBytes;
  const meta = [
    draft.intent ? INTENT_LABEL[draft.intent] : null,
    `vence en ${minutesLeft} min`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-muted">{meta}</div>
      {draft.requiresHuman ? (
        <InlineNotice tone="warning">
          Samanta recomienda que una persona revise o complete esta respuesta.
        </InlineNotice>
      ) : null}
      {draft.missingFields.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Faltan:
          {draft.missingFields.map((field) => (
            <span
              key={field}
              className="rounded-full bg-white px-2 py-0.5 font-semibold text-ink-2"
            >
              {field}
            </span>
          ))}
        </div>
      ) : null}
      {editable ? (
        <>
          <textarea
            aria-label="Texto del borrador de Samanta"
            value={text}
            maxLength={maxLength}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            className="min-h-18 w-full resize-y rounded-xl border border-field bg-white px-3.5 py-2.5 text-sm leading-[1.45] text-ink outline-none focus:border-brand disabled:bg-surface"
          />
          {overBytes ? (
            <InlineNotice tone="error">
              Instagram admite hasta {maxBytes} bytes por respuesta: acorta el
              texto (las tildes y los emojis ocupan más de uno).
            </InlineNotice>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="h-8 px-3"
              disabled={busy}
              onClick={onReject}
            >
              Descartar
            </Button>
            <Button
              className="h-8 px-3.5"
              disabled={busy || empty || overBytes}
              onClick={() => onApprove(text)}
            >
              {busy ? "Enviando…" : "Aprobar y enviar"}
            </Button>
          </div>
        </>
      ) : (
        <p className="m-0 whitespace-pre-wrap rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm leading-[1.45]">
          {draft.content}
        </p>
      )}
    </div>
  );
}
