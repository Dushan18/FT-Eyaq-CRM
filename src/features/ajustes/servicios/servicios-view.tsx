"use client";

import { keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { catalogApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CommercialItem, Paginated } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { itemName } from "@/lib/domain/conversation";
import type { Tone } from "@/lib/domain/tones";
import { cn } from "@/lib/format/text";
import { useUrlParams } from "@/lib/hooks/use-url-state";
import { useRestaurant } from "@/lib/restaurant";
import { Button, Toggle } from "@/components/ui/primitives";
import { PaginationBar } from "@/components/ui/pagination";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/ui/state";
import { NuevoServicioForm } from "./nuevo-servicio-form";
import {
  SERVICES_PAGE_SIZE,
  actionErrorText,
  approvalBadge,
  categoryName,
  itemDescription,
  pageFromParam,
  patchItemInPage,
  priceView,
  replaceItemInPage,
} from "./servicios-logic";

const COLUMNS = "grid-cols-[minmax(0,1fr)_130px_100px_40px]";
const STATUS_MUTATION = ["commercial-items", "status"] as const;
const APPROVAL_MUTATION = ["commercial-items", "approval"] as const;

type ListKey = ReturnType<typeof qk.items>;
type Notice = { tone: "info" | "error"; text: string };

interface StatusVars {
  item: CommercialItem;
  isActive: boolean;
  /** Página en la que está el servicio (la del momento del clic, aunque luego se cambie de página). */
  key: ListKey;
}

interface ApprovalVars {
  item: CommercialItem;
  key: ListKey;
}

export function ServiciosView() {
  const session = useSession();
  const { currency } = useRestaurant();
  const queryClient = useQueryClient();
  const url = useUrlParams();
  const page = pageFromParam(url.get("pagina"));
  const canEdit = session.can("catalog.edit");
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const listQuery = { sort: "category", order: "asc", page, limit: SERVICES_PAGE_SIZE } as const;
  const listKey = qk.items(listQuery);
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => catalogApi.items(listQuery),
    placeholderData: keepPreviousData,
    enabled: session.status === "ready",
  });

  const setActive = useMutation({
    mutationKey: STATUS_MUTATION,
    mutationFn: ({ item, isActive }: StatusVars) => catalogApi.setActive(item.id, isActive),
    onMutate: async ({ item, isActive, key }) => {
      setNotice(null);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<Paginated<CommercialItem>>(key, (old) => patchItemInPage(old, item.id, { isActive }));
    },
    onError: (error, { item, isActive, key }) => {
      queryClient.setQueryData<Paginated<CommercialItem>>(key, (old) => patchItemInPage(old, item.id, { isActive: !isActive }));
      setNotice({
        tone: "error",
        text: `No se pudo ${isActive ? "activar" : "desactivar"} «${itemName(item)}». ${actionErrorText(error)}`,
      });
    },
    onSuccess: (updated, { key }) => {
      queryClient.setQueryData<Paginated<CommercialItem>>(key, (old) => replaceItemInPage(old, updated));
    },
    onSettled: () => {
      // Se refresca al terminar el último cambio pendiente, para no pisar otros cambios optimistas.
      if (queryClient.isMutating({ mutationKey: STATUS_MUTATION }) === 1) {
        void queryClient.invalidateQueries({ queryKey: qk.itemsAll });
      }
    },
  });

  const approve = useMutation({
    mutationKey: APPROVAL_MUTATION,
    mutationFn: ({ item }: ApprovalVars) => catalogApi.setApproval(item.id, "APPROVED"),
    onMutate: () => setNotice(null),
    onSuccess: (updated, { key }) => {
      queryClient.setQueryData<Paginated<CommercialItem>>(key, (old) => replaceItemInPage(old, updated));
      void queryClient.invalidateQueries({ queryKey: qk.itemsAll });
    },
    onError: (error, { item }) => {
      setNotice({ tone: "error", text: `No se pudo aprobar «${itemName(item)}». ${actionErrorText(error)}` });
    },
  });

  const pendingStatus = useMutationState({
    filters: { mutationKey: STATUS_MUTATION, status: "pending" },
    select: (m) => (m.state.variables as StatusVars | undefined)?.item.id,
  });
  const pendingApproval = useMutationState({
    filters: { mutationKey: APPROVAL_MUTATION, status: "pending" },
    select: (m) => (m.state.variables as ApprovalVars | undefined)?.item.id,
  });

  const data = list.data;
  const goToPage = (p: number) => url.set({ pagina: p > 1 ? String(p) : null });

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Alto mínimo del botón: el encabezado no cambia de alto para los roles que no lo ven. */}
      <div className="flex min-h-9 items-center justify-between gap-4">
        <h2 className="m-0 text-[17px] font-bold">Servicios y precios</h2>
        {canEdit ? (
          <Button
            className="h-9 px-3.5"
            aria-expanded={formOpen}
            disabled={formOpen}
            onClick={() => {
              setNotice(null);
              setFormOpen(true);
            }}
          >
            Nuevo servicio
          </Button>
        ) : null}
      </div>
      <p className="m-0 text-[13px] text-muted">
        Samanta solo ofrece servicios activos y aprobados (de una categoría activa).
      </p>

      {notice ? <DismissibleNotice notice={notice} onClose={() => setNotice(null)} /> : null}

      {formOpen && canEdit ? (
        <NuevoServicioForm
          onCancel={() => setFormOpen(false)}
          onCreated={() => {
            setFormOpen(false);
            setNotice({ tone: "info", text: "Servicio creado como borrador: apruébalo para que Samanta pueda ofrecerlo." });
          }}
        />
      ) : null}

      {data && list.isError ? (
        <InlineNotice tone="warning">
          No se pudo actualizar la lista; se muestran los últimos datos cargados.{" "}
          <button type="button" onClick={() => void list.refetch()} className="cursor-pointer font-semibold underline">
            Reintentar
          </button>
        </InlineNotice>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-card" role="table" aria-label="Servicios y precios">
        <div role="row" className="sr-only">
          <span role="columnheader">Servicio</span>
          <span role="columnheader">Categoría</span>
          <span role="columnheader">Precio</span>
          <span role="columnheader">Activo</span>
        </div>
        {!data ? (
          list.isError ? (
            <ErrorState error={list.error} subject="la lista de servicios" onRetry={() => void list.refetch()} />
          ) : (
            <LoadingState label="Cargando servicios…" />
          )
        ) : data.data.length === 0 ? (
          data.pagination.total > 0 ? (
            <EmptyState>
              Esta página ya no tiene servicios.{" "}
              <button type="button" onClick={() => goToPage(1)} className="cursor-pointer font-semibold text-brand hover:underline">
                Ir a la primera página
              </button>
            </EmptyState>
          ) : (
            <EmptyState>Aún no hay servicios registrados.</EmptyState>
          )
        ) : (
          <>
            {data.data.map((item) => (
              <ServiceRow
                key={item.id}
                item={item}
                currency={currency}
                canEdit={canEdit}
                approving={pendingApproval.includes(item.id)}
                onToggle={(isActive) => {
                  // Se ignoran clics repetidos mientras el cambio anterior sigue en curso.
                  if (pendingStatus.includes(item.id)) return;
                  setActive.mutate({ item, isActive, key: listKey });
                }}
                onApprove={() => approve.mutate({ item, key: listKey })}
              />
            ))}
            {/* -mt-px: el borde superior de la paginación coincide con el inferior de la última fila. */}
            <div className="-mt-px">
              <PaginationBar pagination={data.pagination} onPage={goToPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ServiceRow({
  item,
  currency,
  canEdit,
  approving,
  onToggle,
  onApprove,
}: {
  item: CommercialItem;
  currency: string;
  canEdit: boolean;
  approving: boolean;
  onToggle: (isActive: boolean) => void;
  onApprove: () => void;
}) {
  const name = itemName(item);
  const description = itemDescription(item);
  const price = priceView(item, currency);
  const badge = approvalBadge(item.approvalStatus);

  return (
    <div
      role="row"
      className={cn(`grid ${COLUMNS} items-center gap-3.5 border-b border-line-2 px-4 py-3`, !item.isActive && "opacity-50")}
    >
      <span role="cell" className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold" title={name}>
            {name}
          </span>
          {badge ? <SmallPill tone={badge.tone}>{badge.label}</SmallPill> : null}
          {badge && canEdit ? (
            <button
              type="button"
              onClick={onApprove}
              disabled={approving}
              aria-label={`Aprobar ${name}`}
              className="shrink-0 cursor-pointer text-xs font-bold text-brand hover:underline disabled:no-underline disabled:opacity-60"
            >
              {approving ? "Aprobando…" : "Aprobar"}
            </button>
          ) : null}
        </span>
        {description ? (
          <span className="truncate text-xs text-subtle" title={description}>
            {description}
          </span>
        ) : null}
      </span>
      <span role="cell" className="min-w-0 wrap-break-word text-[12.5px] text-muted">
        {categoryName(item)}
      </span>
      <span role="cell" className="min-w-0" title={price.title}>
        <PriceCell price={price} />
      </span>
      <span role="cell" className="flex">
        <Toggle
          checked={item.isActive}
          onChange={onToggle}
          label={canEdit ? `Servicio activo: ${name}` : `Servicio activo: ${name}. Solo un administrador puede cambiarlo.`}
          disabled={!canEdit}
        />
      </span>
    </div>
  );
}

function PriceCell({ price }: { price: ReturnType<typeof priceView> }) {
  switch (price.kind) {
    case "base":
    case "promo":
      return <span className="text-[13.5px] font-semibold">{price.text}</span>;
    case "from":
      return (
        <span className="text-[13.5px] font-semibold">
          <span className="text-xs font-medium text-muted">Desde</span> {price.amount}
        </span>
      );
    case "conditions":
      return <span className="line-clamp-2 text-xs leading-[1.35] text-muted">{price.text}</span>;
    case "none":
      return <span className="text-[13.5px] font-semibold text-faint">—</span>;
  }
}

/** Versión compacta de Pill para acompañar el nombre del servicio. */
function SmallPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.75 py-px text-[10.5px] font-bold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {children}
    </span>
  );
}

function DismissibleNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <InlineNotice tone={notice.tone}>
      <span className="flex items-start justify-between gap-3">
        <span>{notice.text}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="-my-0.5 shrink-0 cursor-pointer rounded px-1 text-[15px] leading-none opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </span>
    </InlineNotice>
  );
}
