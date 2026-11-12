"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ReservationRequest } from "@/lib/api/types";
import { customerInitials, customerName, itemName } from "@/lib/domain/conversation";
import { requestStatusView } from "@/lib/domain/statuses";
import { formatAgoShort, formatDayTime } from "@/lib/format/dates";
import { cn, plural } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { useOpenChat } from "@/lib/hooks/use-open-chat";
import { useRestaurant } from "@/lib/restaurant";
import { Avatar, Button, DetailList, Panel, Pill } from "@/components/ui/primitives";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import {
  WEB_MAIL_MAX,
  WEB_MAIL_POLL_MS,
  WEB_MAIL_READ_ONLY,
  WEB_MAIL_SOURCE_NOTE,
  webMailBody,
  webMailSubject,
} from "./web-mail-logic";

/** Solicitudes de la web, las más recientes primero (el listado ordena por createdAt descendente). */
export function useWebMailList({ search, limit, enabled = true }: { search: string; limit: number; enabled?: boolean }) {
  const query = { channel: "WEBSITE" as const, limit, ...(search ? { search } : {}) };
  return useQuery({
    queryKey: qk.requests({ ...query, scope: "bandeja-web" }),
    queryFn: () => requestsApi.list(query),
    placeholderData: keepPreviousData,
    refetchInterval: WEB_MAIL_POLL_MS,
    enabled,
  });
}

/** Filas de la lista de la Bandeja con el filtro Web: un «correo» por solicitud de la web. */
export function WebMailRows({
  search,
  limit,
  selectedId,
  onSelect,
  onShowMore,
}: {
  search: string;
  limit: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onShowMore: () => void;
}) {
  const list = useWebMailList({ search, limit });
  const { timeZone } = useRestaurant();
  const now = useNow();
  const rows = list.data?.data ?? [];
  const total = list.data?.pagination.total ?? 0;

  if (list.isLoading) return <LoadingState label="Cargando correos de la web…" />;
  if (list.isError && !list.data) {
    return <ErrorState error={list.error} subject="los correos de la web" onRetry={() => void list.refetch()} />;
  }
  if (rows.length === 0) {
    return <EmptyState>{search ? "Sin correos de la web para esta búsqueda." : "Aún no llegaron correos de la web."}</EmptyState>;
  }
  return (
    <>
      {list.isError ? (
        <div className="px-3 pt-3">
          <InlineNotice tone="warning">Sin conexión con el servidor. Se muestran los últimos datos recibidos.</InlineNotice>
        </div>
      ) : null}
      <ul className="m-0 list-none p-0" aria-label="Correos de la web">
        {rows.map((r) => (
          <li key={r.id}>
            <WebMailRow request={r} selected={r.id === selectedId} onSelect={onSelect} now={now} timeZone={timeZone} />
          </li>
        ))}
      </ul>
      {total > rows.length ? (
        limit < WEB_MAIL_MAX ? (
          <div className="p-3 text-center">
            <button
              type="button"
              onClick={onShowMore}
              className="h-8 cursor-pointer rounded-lg border border-button bg-white px-3 text-[12.5px] font-semibold text-brand hover:bg-brand-soft"
            >
              Mostrar más correos
            </button>
          </div>
        ) : (
          <p className="m-0 px-4 py-3 text-center text-xs text-subtle">
            Se muestran los {rows.length} más recientes de {total}. Usa la búsqueda para encontrar otros.
          </p>
        )
      ) : null}
    </>
  );
}

function WebMailRow({
  request: r,
  selected,
  onSelect,
  now,
  timeZone,
}: {
  request: ReservationRequest;
  selected: boolean;
  onSelect: (id: string) => void;
  now: number;
  timeZone: string;
}) {
  const name = customerName(r.customer, "WEBSITE");
  const status = requestStatusView(r.status);
  return (
    <button
      type="button"
      onClick={() => onSelect(r.id)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${name}, ${webMailSubject(r)}`}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] gap-2.5 border-0 border-b border-l-[3px] border-solid border-b-line-3 py-3.25 pl-3.5 pr-4 text-left",
        selected ? "border-l-brand bg-brand-soft" : "border-l-transparent bg-white hover:bg-hover-row",
      )}
    >
      <Avatar text={customerInitials(r.customer)} size={40} badge="WEBSITE" />
      <div className="flex min-w-0 flex-col gap-0.75">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="truncate text-[12.5px] text-muted">{webMailSubject(r)}</div>
        <div>
          <Pill tone={status.tone} className="text-[10.5px]">
            {status.label}
          </Pill>
        </div>
      </div>
      <div className="whitespace-nowrap text-[11.5px] text-subtle">{formatAgoShort(r.createdAt, now, timeZone)}</div>
    </button>
  );
}

/** Un correo de la web en solo lectura: sin cuadro de respuesta, con acceso al WhatsApp del cliente y a la solicitud. */
export function WebMailPanel({ requestId, onBack }: { requestId: string | null; onBack: () => void }) {
  if (!requestId) {
    return (
      <Panel as="main" className="grid place-items-center">
        <EmptyState>Selecciona un correo de la web para leerlo.</EmptyState>
      </Panel>
    );
  }
  return <WebMailContent key={requestId} id={requestId} onBack={onBack} />;
}

function WebMailContent({ id, onBack }: { id: string; onBack: () => void }) {
  const { timeZone } = useRestaurant();
  const chat = useOpenChat();
  const detail = useQuery({ queryKey: qk.request(id), queryFn: () => requestsApi.get(id), refetchInterval: WEB_MAIL_POLL_MS });

  const back = (
    <button
      type="button"
      onClick={onBack}
      aria-label="Volver a los correos"
      title="Volver a los correos"
      className="flex h-8.5 shrink-0 cursor-pointer items-center rounded-lg border-0 bg-transparent px-1.5 text-brand hover:bg-surface lg:hidden"
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
    </button>
  );

  if (!detail.data) {
    const missing = detail.error instanceof ApiError && (detail.error.isNotFound || detail.error.status === 400);
    return (
      <Panel as="main" className="flex min-h-0 flex-col">
        <div className="border-b border-line px-3 py-2.5 lg:hidden">{back}</div>
        <div className="grid flex-1 place-items-center">
          {detail.isPending ? (
            <LoadingState label="Cargando el correo…" />
          ) : missing ? (
            <EmptyState>No se encontró el correo. Puede que el enlace no sea válido.</EmptyState>
          ) : (
            <ErrorState error={detail.error} subject="el correo" onRetry={() => void detail.refetch()} />
          )}
        </div>
      </Panel>
    );
  }

  const r = detail.data;
  const name = customerName(r.customer, "WEBSITE");
  const status = requestStatusView(r.status);
  const body = webMailBody(r.comments);
  const contact = [r.customer.phone, r.customer.email].filter(Boolean).join(" · ");

  return (
    <Panel as="main" className="flex min-h-0 flex-col overflow-hidden" aria-label={`Correo de ${name}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-3 sm:px-4.5 sm:py-3.5">
        {back}
        <Avatar text={customerInitials(r.customer)} size={38} badge="WEBSITE" />
        <div className="min-w-0 flex-1 basis-36">
          <h2 className="m-0 truncate text-base font-bold">{webMailSubject(r)}</h2>
          <div className="truncate text-[12.5px] text-muted">
            De {name}
            {contact ? ` · ${contact}` : ""} · {formatDayTime(r.createdAt, timeZone)}
          </div>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-surface px-3 py-4 sm:px-6.5 sm:py-5.5">
        <article className="flex flex-col gap-4 rounded-2xl border border-bubble bg-white px-4 py-4 text-[13.5px] sm:px-5">
          <DetailList
            rows={[
              { label: "Fecha", value: r.reservationAt ? formatDayTime(r.reservationAt, timeZone) : "No indicada o no válida", strong: true },
              { label: "Personas", value: r.numberOfPeople ? plural(r.numberOfPeople, "persona") : "No indicadas", strong: true },
              { label: "Servicio", value: itemName(r.commercialItem) },
              { label: "Preferencia", value: r.specialRequirements ?? "—" },
            ]}
          />
          {body.message.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-line-2 pt-3">
              {body.message.map((line, i) => (
                <p key={i} className="m-0 whitespace-pre-wrap text-ink">
                  {line || " "}
                </p>
              ))}
            </div>
          ) : null}
        </article>
        {body.crmNotes.length > 0 ? (
          <section aria-label="Notas del CRM" className="flex flex-col gap-1.5">
            {body.crmNotes.map((note, i) => (
              <p key={i} className="m-0 rounded-md bg-[#fff1e6] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#9a3a06]">
                {note}
              </p>
            ))}
          </section>
        ) : null}
        <p className="m-0 text-xs text-subtle">{WEB_MAIL_SOURCE_NOTE}</p>
      </div>

      <footer className="flex flex-col gap-2.5 border-t border-line px-3 py-3 sm:px-5.5 sm:py-3.5">
        <p className="m-0 text-xs text-muted">{WEB_MAIL_READ_ONLY}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-9 px-3.5"
            onClick={() => void chat.open(r.customerId, "WHATSAPP")}
            disabled={chat.pendingId === r.customerId}
          >
            {chat.pendingId === r.customerId ? "Abriendo…" : "Abrir WhatsApp del cliente"}
          </Button>
          <Link
            href={`/solicitudes?solicitud=${r.id}`}
            className="flex h-9 items-center rounded-[10px] border border-button bg-white px-3.5 text-[13px] font-semibold text-brand no-underline hover:bg-brand-soft"
          >
            Ver solicitud {r.code}
          </Link>
          {chat.notFound === r.customerId ? (
            <span className="text-xs text-muted">El cliente todavía no tiene conversación de WhatsApp.</span>
          ) : null}
          {chat.failed === r.customerId ? <span className="text-xs text-[#b42323]">No se pudo abrir el chat.</span> : null}
        </div>
      </footer>
    </Panel>
  );
}
