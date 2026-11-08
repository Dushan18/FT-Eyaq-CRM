"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { customersApi, reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import { CUSTOMER_STATUSES, type Customer, type Paginated, type Reservation } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta } from "@/lib/domain/channels";
import { CUSTOMER_STATUS } from "@/lib/domain/statuses";
import { formatAgoLong, formatDate, formatTime } from "@/lib/format/dates";
import { cn } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { useOpenChat } from "@/lib/hooks/use-open-chat";
import { useUrlParams } from "@/lib/hooks/use-url-state";
import { useRestaurant } from "@/lib/restaurant";
import { Avatar, Button, ChannelDot, FilterChip, PageHeader, Panel, Pill } from "@/components/ui/primitives";
import { PaginationBar } from "@/components/ui/pagination";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import {
  SEARCH_MAX_LENGTH,
  buildCustomerQuery,
  chatNotice,
  customerIdentity,
  interestCell,
  latestInterestName,
  pageUpdate,
  parseCustomerFilters,
  reservationCountQuery,
  reservationsCell,
  searchUpdate,
  statusUpdate,
  type CellText,
  type ChatNotice,
} from "./clientes-utils";
import { EditCustomerDialog, NewCustomerDialog } from "./customer-dialogs";
import { SearchBox } from "./search-box";

const COLUMNS = "grid-cols-[minmax(180px,1.3fr)_110px_140px_120px_80px_minmax(140px,1fr)]";
/** Con permiso de edición se añade la columna de la acción «Editar». */
const COLUMNS_WITH_ACTIONS = "grid-cols-[minmax(180px,1.3fr)_110px_140px_120px_80px_minmax(140px,1fr)_72px]";
/** Columnas mínimas + huecos + relleno (866 px; 950 px con «Editar»): por debajo, la tabla se desplaza. */
const TABLE_MIN_WIDTH = "min-w-217";
const TABLE_MIN_WIDTH_WITH_ACTIONS = "min-w-238";

const NOTICE_CLASS: Record<ChatNotice["kind"], string> = {
  opening: "text-subtle",
  missing: "font-semibold text-[#b14a0b]",
  failed: "font-semibold text-[#b42323]",
};

const linkButton = "cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand hover:underline";

type OpenChat = ReturnType<typeof useOpenChat>;

const totalOf = (page: Paginated<Reservation>) => page.pagination.total;

/**
 * Clientes. Estado en la URL: `q` (búsqueda), `estado` y `pagina`. El backend ordena siempre por último
 * contacto (más reciente primero) y busca campo por campo (nombre, apellido, teléfono o correo).
 */
export function ClientesView() {
  const url = useUrlParams();
  const setUrl = url.set;
  const filters = parseCustomerFilters(url.get);
  const chat = useOpenChat();
  const session = useSession();
  const { timeZone } = useRestaurant();
  const now = useNow();
  const tableRef = useRef<HTMLDivElement>(null);
  const canEdit = session.can("customer.edit");
  const columns = canEdit ? COLUMNS_WITH_ACTIONS : COLUMNS;
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);

  const list = useQuery({
    queryKey: qk.customers(filters),
    queryFn: () => customersApi.list(buildCustomerQuery(filters)),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    // La vista se monta (oculta) mientras carga la sesión: no se consulta hasta saber que el rol tiene acceso.
    enabled: session.status === "ready" && session.canView("clientes"),
  });

  const onSearch = useCallback((q: string) => setUrl(searchUpdate(q)), [setUrl]);

  const goToPage = (page: number) => {
    setUrl(pageUpdate(page));
    // La tabla vive dentro del panel con scroll: al cambiar de página se vuelve arriba.
    tableRef.current?.parentElement?.scrollTo({ top: 0 });
  };

  const announcedId = chat.notFound ?? chat.failed;
  const announced = announcedId ? list.data?.data.find((c) => c.id === announcedId) : undefined;
  const announcedName = announced ? customerIdentity(announced).name : "este cliente";
  const announcement = chat.notFound
    ? `No hay una conversación con ${announcedName}.`
    : chat.failed
      ? `No se pudo abrir la conversación de ${announcedName}.`
      : "";

  const rows = list.data?.data ?? [];
  let state: ReactNode = null;
  if (list.data === undefined) {
    state = list.isError ? (
      // `ErrorState` arma "No se pudo cargar {subject}": el sujeto va en singular para que la frase concuerde.
      <ErrorState error={list.error} subject="la lista de clientes" onRetry={() => void list.refetch()} className="border-t border-line-2" />
    ) : (
      <LoadingState
        label={list.fetchStatus === "paused" ? "Sin conexión. Se cargará al recuperar la red." : "Cargando clientes…"}
        className="border-t border-line-2"
      />
    );
  } else if (rows.length === 0 && list.data.pagination.total > 0) {
    // La URL pide una página que ya no existe (p. ej., tras filtrar): no es "sin clientes".
    state = (
      <EmptyState className="border-t border-line-2">
        No hay clientes en esta página.{" "}
        <button type="button" onClick={() => goToPage(1)} className={linkButton}>
          Ir a la primera página
        </button>
      </EmptyState>
    );
  } else if (rows.length === 0) {
    state = <EmptyState className="border-t border-line-2">Sin clientes para este filtro.</EmptyState>;
  }

  return (
    <Panel className="flex h-full flex-col gap-5.5 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <PageHeader
        title="Clientes"
        subtitle="Cada persona que escribe queda registrada con su canal, historial y estado comercial."
        actions={
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <SearchBox
              value={filters.q}
              onCommit={onSearch}
              placeholder="Buscar por nombre, teléfono o correo"
              aria-label="Buscar clientes por nombre, apellido, teléfono o correo"
              maxLength={SEARCH_MAX_LENGTH}
              className="w-full sm:w-65"
            />
            {canEdit ? (
              <Button className="h-10 px-4" onClick={() => setCreating(true)}>
                Nuevo cliente
              </Button>
            ) : null}
          </div>
        }
      />

      {created ? (
        <InlineNotice>
          Se creó el cliente {customerIdentity(created).name}.{" "}
          <button type="button" onClick={() => setEditing(created)} className={linkButton}>
            Abrir su ficha
          </button>
          {" · "}
          <button type="button" onClick={() => setCreated(null)} className={linkButton}>
            Ocultar aviso
          </button>
        </InlineNotice>
      ) : null}

      <div role="group" aria-label="Filtrar clientes por estado" className="flex flex-wrap gap-1.5">
        <FilterChip size="md" active={filters.status === null} onClick={() => setUrl(statusUpdate(null))}>
          Todos
        </FilterChip>
        {CUSTOMER_STATUSES.map((status) => (
          <FilterChip key={status} size="md" active={filters.status === status} onClick={() => setUrl(statusUpdate(status))}>
            {CUSTOMER_STATUS[status].label}
          </FilterChip>
        ))}
      </div>

      {list.isError && list.data !== undefined ? (
        // Falló una actualización en segundo plano: se conservan los últimos datos en vez de vaciar la tabla.
        <InlineNotice tone="warning">
          No se pudo actualizar la lista; se muestran los últimos datos cargados.{" "}
          <button type="button" onClick={() => void list.refetch()} className={linkButton}>
            Reintentar
          </button>
        </InlineNotice>
      ) : null}

      <div
        ref={tableRef}
        className={cn(
          "shrink-0 overflow-hidden rounded-2xl border border-card transition-opacity",
          list.isPlaceholderData && "opacity-60",
        )}
      >
        {/* En pantallas estrechas la tabla se desplaza en horizontal dentro del recuadro (no la página). */}
        <div className="relative overflow-x-auto">
        <div
          role="table"
          aria-label="Clientes"
          aria-busy={list.isPlaceholderData || undefined}
          className={canEdit ? TABLE_MIN_WIDTH_WITH_ACTIONS : TABLE_MIN_WIDTH}
        >
          <div role="row" className={`grid ${columns} gap-3 bg-surface px-4.5 py-3 text-[11px] font-bold tracking-[.06em] text-subtle`}>
            <span role="columnheader">CLIENTE</span>
            <span role="columnheader">CANAL</span>
            <span role="columnheader">ESTADO</span>
            <span role="columnheader">ÚLTIMO CONTACTO</span>
            <span role="columnheader">RESERVAS</span>
            <span role="columnheader">CONSULTÓ</span>
            {canEdit ? (
              <span role="columnheader">
                <span className="sr-only">Acciones</span>
              </span>
            ) : null}
          </div>
          {rows.map((c) => (
            <CustomerRow
              key={c.id}
              customer={c}
              chat={chat}
              now={now}
              timeZone={timeZone}
              columns={columns}
              onEdit={canEdit ? () => setEditing(c) : undefined}
            />
          ))}
        </div>
        </div>
        {state}
        {list.data && rows.length > 0 ? <PaginationBar pagination={list.data.pagination} onPage={goToPage} /> : null}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <NewCustomerDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(customer) => {
          setCreating(false);
          setCreated(customer);
        }}
        onFindExisting={(term) => {
          setCreating(false);
          onSearch(term.trim().slice(0, SEARCH_MAX_LENGTH));
        }}
      />
      <EditCustomerDialog customer={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

/**
 * Fila del cliente. Toda la fila abre su conversación con el ratón; para teclado y lectores de pantalla,
 * el nombre es un botón real con la misma acción.
 */
function CustomerRow({
  customer: c,
  chat,
  now,
  timeZone,
  columns,
  onEdit,
}: {
  customer: Customer;
  chat: OpenChat;
  now: number;
  timeZone: string;
  columns: string;
  /** Solo con permiso `customer.edit`. */
  onEdit?: () => void;
}) {
  const identity = customerIdentity(c);
  const status = CUSTOMER_STATUS[c.status];
  const channel = channelMeta(c.sourceChannel);
  const notice = chatNotice(chat, c.id);
  // Una búsqueda de conversación a la vez: evita navegar dos veces con clics seguidos.
  const busy = chat.pendingId !== null;
  const open = () => {
    if (!busy) void chat.open(c.id, c.sourceChannel);
  };

  return (
    <div
      role="row"
      aria-busy={chat.pendingId === c.id || undefined}
      onClick={() => {
        // Seleccionar texto (p. ej., para copiar un teléfono) no abre la conversación.
        if (window.getSelection()?.type === "Range") return;
        open();
      }}
      className={cn(
        `grid ${columns} items-center gap-3 border-t border-line-2 px-4.5 py-3 text-[13.5px] hover:bg-hover-soft`,
        // Con teclado, el foco se marca en toda la fila (el destino del clic) en vez de solo en el nombre.
        "has-focus-visible:bg-hover-soft has-focus-visible:shadow-[inset_0_0_0_2px_#1f3fbf]",
        busy ? "cursor-progress" : "cursor-pointer",
      )}
    >
      <span role="cell" className="flex min-w-0 items-center gap-2.5">
        <Avatar text={identity.initials} size={32} />
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            aria-label={`Abrir la conversación de ${identity.name}`}
            aria-disabled={busy || undefined}
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
            className="cursor-[inherit] truncate border-0 bg-transparent p-0 text-left font-semibold"
            // El contorno global de :focus-visible se reemplaza por el de la fila.
            style={{ outline: "none" }}
          >
            {identity.name}
          </button>
          {identity.contact || notice ? (
            <span className="flex min-w-0 gap-1 text-xs text-subtle">
              {identity.contact ? <span className="truncate">{identity.contact}</span> : null}
              {identity.contact && notice ? <span aria-hidden="true">·</span> : null}
              {notice ? <span className={cn("shrink-0", NOTICE_CLASS[notice.kind])}>{notice.text}</span> : null}
            </span>
          ) : null}
        </span>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="flex">
          <ChannelDot channel={c.sourceChannel} />
        </span>
        <span className="truncate">{channel.label}</span>
      </span>
      <span role="cell">
        <Pill tone={status.tone}>{status.label}</Pill>
      </span>
      <span
        role="cell"
        className="truncate text-muted"
        title={`${formatDate(c.lastContactAt, timeZone)} · ${formatTime(c.lastContactAt, timeZone)}`}
      >
        {formatAgoLong(c.lastContactAt, now, timeZone)}
      </span>
      <span role="cell" className="font-semibold">
        <ReservationCount customerId={c.id} />
      </span>
      <span role="cell" className="min-w-0 truncate text-slate">
        <LatestInterest customerId={c.id} />
      </span>
      {onEdit ? (
        <span role="cell" className="flex justify-end">
          <button
            type="button"
            aria-label={`Editar a ${identity.name}`}
            onClick={(event) => {
              // La fila abre la conversación: editar no debe hacerlo.
              event.stopPropagation();
              onEdit();
            }}
            className="h-7 cursor-pointer whitespace-nowrap rounded-lg border border-button bg-white px-2.5 text-xs font-semibold text-brand hover:bg-brand-soft"
          >
            Editar
          </button>
        </span>
      ) : null}
    </div>
  );
}

function Cell({ cell, className }: { cell: CellText; className?: string }) {
  return (
    <span title={cell.title} className={cn(cell.pending && "font-normal text-faint", className)}>
      {cell.text}
    </span>
  );
}

/** El listado no trae reservas: una lectura barata por fila (limit=1) y se usa `pagination.total`. */
function ReservationCount({ customerId }: { customerId: string }) {
  const params = reservationCountQuery(customerId);
  const count = useQuery({
    queryKey: qk.reservations(params),
    queryFn: () => reservationsApi.list(params),
    select: totalOf,
    staleTime: 60_000,
  });
  return <Cell cell={reservationsCell(count)} />;
}

/** El listado no trae intereses: se lee el detalle del cliente y se toma el más reciente. */
function LatestInterest({ customerId }: { customerId: string }) {
  const interest = useQuery({
    queryKey: qk.customer(customerId),
    queryFn: () => customersApi.get(customerId),
    select: latestInterestName,
    staleTime: 5 * 60_000,
  });
  return <Cell cell={interestCell(interest)} />;
}
