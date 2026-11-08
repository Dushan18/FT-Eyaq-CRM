"use client";

import { useQuery } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/fields";
import { catalogApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CommercialItemListQuery, CommercialItemSummary } from "@/lib/api/types";
import { MAX_PAGE_SIZE } from "@/lib/api/types";
import { itemName } from "@/lib/domain/conversation";

/** Solicitudes y reservas solo aceptan elementos activos y aprobados (400 si no). */
const SELECTABLE_QUERY: CommercialItemListQuery = {
  isActive: true,
  approvalStatus: "APPROVED",
  sort: "name",
  order: "asc",
  limit: MAX_PAGE_SIZE,
};

/**
 * Selector de servicio del catálogo para solicitudes y reservas: solo activos y aprobados.
 * `current` es el elemento que ya tiene el registro: reenviarlo es válido aunque ya esté inactivo,
 * así que se ofrece aunque no esté en la lista.
 */
export function CommercialItemSelect({
  label = "Servicio",
  value,
  onChange,
  current,
  error,
  disabled,
  allowNone = true,
}: {
  label?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  current?: CommercialItemSummary | null;
  error?: string | null;
  disabled?: boolean;
  allowNone?: boolean;
}) {
  const items = useQuery({
    queryKey: qk.items({ ...SELECTABLE_QUERY, scope: "selector" }),
    queryFn: () => catalogApi.items(SELECTABLE_QUERY),
    staleTime: 60_000,
  });
  const rows = items.data?.data ?? [];
  const showCurrent = current && !rows.some((i) => i.id === current.id);
  const hint = items.isError
    ? "No se pudo cargar el catálogo."
    : items.data && rows.length === 0
      ? "No hay servicios activos y aprobados: apruébalos en Ajustes › Servicios."
      : items.data && items.data.pagination.total > rows.length
        ? `Se muestran los primeros ${rows.length} servicios.`
        : undefined;

  return (
    <SelectField
      label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled || (items.isLoading && !current)}
      error={error}
      hint={hint}
    >
      {allowNone ? <option value="">Sin servicio</option> : null}
      {showCurrent ? (
        <option value={current.id}>
          {itemName(current)}
          {!current.isActive || current.approvalStatus !== "APPROVED" ? " (no disponible)" : ""}
        </option>
      ) : null}
      {rows.map((item) => (
        <option key={item.id} value={item.id}>
          {itemName(item)}
        </option>
      ))}
    </SelectField>
  );
}
