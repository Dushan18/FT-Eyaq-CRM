"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { inputClass } from "@/components/ui/fields";
import { customersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { ContactChannel, Customer, CustomerSummary } from "@/lib/api/types";
import { customerName } from "@/lib/domain/conversation";
import { cn } from "@/lib/format/text";

const MIN_SEARCH = 2;
const RESULTS = 8;

/**
 * Elegir un cliente existente buscando por nombre, teléfono o correo (GET /customers?search=…).
 * Con un cliente elegido muestra su nombre y un botón «Cambiar».
 */
export function CustomerPicker({
  label = "Cliente",
  value,
  onChange,
  error,
  disabled,
}: {
  label?: string;
  /** Con `sourceChannel` (un `Customer`), el nombre de respaldo depende del canal («Cliente de Messenger»). */
  value: (CustomerSummary & { sourceChannel?: ContactChannel }) | null;
  onChange: (customer: Customer | null) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(term.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const query = { search, limit: RESULTS };
  const results = useQuery({
    queryKey: qk.customers({ ...query, scope: "picker" }),
    queryFn: () => customersApi.list(query),
    enabled: value === null && search.length >= MIN_SEARCH,
    staleTime: 30_000,
  });

  if (value) {
    const contact = [value.phone, value.email].filter(Boolean).join(" · ");
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-slate">{label}</span>
        <div className="flex items-center gap-3 rounded-[10px] border border-field bg-surface px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{customerName(value, value.sourceChannel)}</div>
            {contact ? <div className="truncate text-xs text-muted">{contact}</div> : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setTerm("");
              setSearch("");
              onChange(null);
            }}
            className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cambiar
          </button>
        </div>
        {error ? (
          <span className="text-xs text-[#b42323]" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  const rows = results.data?.data ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-slate">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={term}
        disabled={disabled}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Buscar por nombre, teléfono o correo"
        autoComplete="off"
        maxLength={200}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        className={cn(inputClass, error && "border-[#e0a3a3]")}
      />
      <span id={hintId} className={cn("text-xs", error ? "text-[#b42323]" : "text-subtle")}>
        {error ??
          (search.length < MIN_SEARCH
            ? "Escribe al menos 2 caracteres."
            : results.isFetching && !results.data
              ? "Buscando…"
              : results.isError
                ? "No se pudo buscar. Inténtalo de nuevo."
                : rows.length === 0
                  ? "No hay clientes con ese dato."
                  : null)}
      </span>
      {rows.length > 0 ? (
        <ul role="listbox" aria-label="Clientes encontrados" className="m-0 flex list-none flex-col gap-1 p-0">
          {rows.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => onChange(c)}
                className="flex w-full cursor-pointer flex-col items-start rounded-lg border border-line bg-white px-3 py-2 text-left hover:border-brand hover:bg-brand-soft"
              >
                <span className="text-[13px] font-semibold">{customerName(c, c.sourceChannel)}</span>
                <span className="text-xs text-muted">{[c.phone, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
