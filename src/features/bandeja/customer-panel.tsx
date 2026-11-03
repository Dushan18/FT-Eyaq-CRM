"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { customersApi, requestsApi, reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { Conversation, Paginated, Reservation, ReservationRequest } from "@/lib/api/types";
import { MAX_PAGE_SIZE } from "@/lib/api/types";
import { channelMeta } from "@/lib/domain/channels";
import { itemName } from "@/lib/domain/conversation";
import { CUSTOMER_STATUS, requestStatusView, requestTimeline, type TimelineStep } from "@/lib/domain/statuses";
import { formatDate, formatDayTime } from "@/lib/format/dates";
import { plural } from "@/lib/format/text";
import { useRestaurant } from "@/lib/restaurant";
import { DetailList, Panel, Pill, SectionLabel } from "@/components/ui/primitives";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { buildHistory } from "./inbox-utils";

const HISTORY_REQUESTS = 20;

/** Panel derecho: solicitud vigente con su línea de tiempo, datos del cliente e historial. */
export function CustomerPanel({ conversation }: { conversation: Conversation | null }) {
  return (
    <Panel as="aside" className="flex min-h-0 flex-col gap-[22px] overflow-y-auto p-5" aria-label="Datos del cliente">
      {conversation ? (
        <CustomerDetails key={conversation.customerId} customerId={conversation.customerId} />
      ) : (
        <p className="m-0 text-[13px] text-subtle">Selecciona una conversación para ver la solicitud y los datos del cliente.</p>
      )}
    </Panel>
  );
}

function CustomerDetails({ customerId }: { customerId: string }) {
  const requests = useQuery({
    queryKey: qk.requests({ customerId, limit: HISTORY_REQUESTS }),
    queryFn: () => requestsApi.list({ customerId, limit: HISTORY_REQUESTS }),
    refetchInterval: 30_000,
  });
  const latest = requests.data?.data[0] ?? null;

  return (
    <>
      <Section title="SOLICITUD DE RESERVA">
        {requests.isLoading ? (
          <LoadingState className="py-4" />
        ) : requests.isError && !requests.data ? (
          <ErrorState error={requests.error} subject="la solicitud" onRetry={() => void requests.refetch()} className="py-4" />
        ) : latest ? (
          <RequestCard request={latest} />
        ) : (
          <div className="rounded-[14px] border border-dashed border-dashed-line p-4 text-[13px] leading-normal text-muted">
            Aún no hay solicitud. Samanta la crea cuando el cliente confirma fecha, hora y personas.
          </div>
        )}
      </Section>
      <CustomerSection customerId={customerId} />
      <HistorySection customerId={customerId} requests={requests} currentRequestId={latest?.id ?? null} />
    </>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0">
          <SectionLabel>{title}</SectionLabel>
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function RequestCard({ request: r }: { request: ReservationRequest }) {
  const { timeZone } = useRestaurant();
  const status = requestStatusView(r.status);
  const notes = [r.comments, r.specialRequirements].filter((v) => v && v.trim()).join(" · ");
  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border border-bubble p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-bold">{r.code}</div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      <DetailList
        gap="6px 14px"
        rows={[
          {
            label: "Fecha",
            value: r.reservationAt ? formatDayTime(r.reservationAt, timeZone) : "Por definir",
            strong: true,
          },
          { label: "Personas", value: r.numberOfPeople ? plural(r.numberOfPeople, "persona") : "Por definir", strong: true },
          { label: "Servicio", value: itemName(r.commercialItem), strong: true },
          { label: "Notas", value: notes || "—" },
        ]}
      />
      <Timeline steps={requestTimeline(r.status)} />
    </div>
  );
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col border-t border-line-2 p-0 pt-3" aria-label="Progreso de la solicitud">
      {steps.map((s) => {
        const done = s.dot !== "#fff";
        const current = !done && s.ring !== "#d6dbe4";
        return (
          <li key={s.label} className="grid grid-cols-[18px_1fr] gap-2.5">
            <div className="flex flex-col items-center" aria-hidden="true">
              <div className="mt-[3px] size-3 rounded-full border-2 border-solid" style={{ background: s.dot, borderColor: s.ring }} />
              {s.line ? <div className="min-h-4 w-0.5 flex-1 bg-bubble" /> : null}
            </div>
            <div className="pb-2.5">
              <div className="text-[13px] font-semibold" style={{ color: s.fg }}>
                {s.label}
                <span className="sr-only">{done ? " (completado)" : current ? " (en curso)" : " (pendiente)"}</span>
              </div>
              <div className="text-[11.5px] text-subtle">{s.sub}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CustomerSection({ customerId }: { customerId: string }) {
  const { timeZone } = useRestaurant();
  const customer = useQuery({
    queryKey: qk.customer(customerId),
    queryFn: () => customersApi.get(customerId),
    staleTime: 60_000,
  });
  const c = customer.data;
  const status = c ? CUSTOMER_STATUS[c.status] : null;

  return (
    <Section title="CLIENTE" aside={status ? <Pill tone={status.tone}>{status.label}</Pill> : null}>
      {customer.isLoading ? (
        <LoadingState className="py-4" />
      ) : !c ? (
        <ErrorState error={customer.error} subject="los datos del cliente" onRetry={() => void customer.refetch()} className="py-4" />
      ) : (
        <DetailList
          rows={[
            { label: "Teléfono", value: c.phone ?? "—" },
            { label: "Correo", value: c.email ?? "—", truncate: true },
            { label: "Origen", value: channelMeta(c.sourceChannel).label },
            { label: "Primer contacto", value: formatDate(c.firstContactAt, timeZone) },
          ]}
        />
      )}
    </Section>
  );
}

/**
 * Reservas del cliente para el historial. El backend las ordena por fecha ascendente, así que las más
 * recientes están al final: si hay más de una página se leen las dos últimas.
 */
async function latestReservations(customerId: string): Promise<Reservation[]> {
  const first = await reservationsApi.list({ customerId, limit: MAX_PAGE_SIZE });
  const pages = first.pagination.totalPages;
  if (pages <= 1) return first.data;
  const tail = await Promise.all(
    [pages - 1, pages].map((page) =>
      page === 1 ? Promise.resolve(first) : reservationsApi.list({ customerId, limit: MAX_PAGE_SIZE, page }),
    ),
  );
  return tail.flatMap((p) => p.data);
}

function HistorySection({
  customerId,
  requests,
  currentRequestId,
}: {
  customerId: string;
  requests: UseQueryResult<Paginated<ReservationRequest>>;
  currentRequestId: string | null;
}) {
  const { timeZone } = useRestaurant();
  const reservations = useQuery({
    queryKey: qk.reservations({ customerId, history: true }),
    queryFn: () => latestReservations(customerId),
    staleTime: 60_000,
  });

  let body: ReactNode;
  if (requests.isLoading || reservations.isLoading) {
    body = <LoadingState className="py-4" />;
  } else if (!requests.data || !reservations.data) {
    const failed = !reservations.data ? reservations : requests;
    body = (
      <ErrorState
        error={failed.error}
        subject="el historial"
        onRetry={() => {
          void requests.refetch();
          void reservations.refetch();
        }}
        className="py-4"
      />
    );
  } else {
    const items = buildHistory(requests.data.data, reservations.data, currentRequestId);
    body =
      items.length === 0 ? (
        <div className="text-[13px] text-subtle">Primera interacción.</div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {items.map((h) => (
            <li key={h.key} className="flex items-center justify-between gap-2 rounded-[10px] bg-surface px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold">{h.code}</span>
                <span className="text-[11.5px] text-subtle">{formatDate(h.at, timeZone)}</span>
              </div>
              <Pill tone={h.tone}>{h.label}</Pill>
            </li>
          ))}
        </ul>
      );
  }

  return <Section title="HISTORIAL">{body}</Section>;
}
