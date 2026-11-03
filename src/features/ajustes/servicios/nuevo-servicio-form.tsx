"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState, type FormEvent } from "react";
import { catalogApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CommercialItem, CommercialItemType, CreateCommercialItemRequest } from "@/lib/api/types";
import { useRestaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/primitives";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { InlineNotice } from "@/components/ui/state";
import {
  DESCRIPTION_MAX_LENGTH,
  EMPTY_SERVICE_FORM,
  ITEM_TYPE_OPTIONS,
  NAME_MAX_LENGTH,
  actionErrorText,
  buildCreateItemBody,
  currencySymbol,
  priceRequired,
  validateServiceForm,
  type ServiceFormErrors,
  type ServiceFormValues,
} from "./servicios-logic";

/** Alta mínima de un servicio (tarjeta en línea sobre la lista). El backend lo crea activo y en borrador. */
export function NuevoServicioForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (item: CommercialItem) => void;
}) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const { currency } = useRestaurant();
  const [values, setValues] = useState<ServiceFormValues>(EMPTY_SERVICE_FORM);
  const [errors, setErrors] = useState<ServiceFormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // El listado incluye categorías inactivas; solo las activas admiten servicios nuevos.
  const categories = useQuery({ queryKey: qk.categories, queryFn: catalogApi.categories, staleTime: 60_000 });
  const activeCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [categories.data],
  );

  const create = useMutation({
    mutationFn: (body: CreateCommercialItemRequest) => catalogApi.create(body),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: qk.itemsAll });
      onCreated(item);
    },
  });

  function update<K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateServiceForm(next));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    setSubmitted(true);
    const found = validateServiceForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(buildCreateItemBody(values));
  }

  const required = priceRequired(values.type);

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-card p-5"
    >
      <div id={titleId} className="text-sm font-bold">
        Nuevo servicio
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <TextField
          label="Nombre (español)"
          value={values.nameEs}
          onChange={(e) => update("nameEs", e.target.value)}
          maxLength={NAME_MAX_LENGTH}
          error={errors.nameEs}
          autoComplete="off"
          autoFocus
        />
        <SelectField label="Tipo" value={values.type} onChange={(e) => update("type", e.target.value as CommercialItemType)}>
          {ITEM_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Categoría"
          value={values.categoryId}
          onChange={(e) => update("categoryId", e.target.value)}
          disabled={categories.isPending || categories.isError}
          error={errors.categoryId}
          hint={
            categories.isError ? (
              <span className="text-[#b42323]">
                No se pudieron cargar las categorías.{" "}
                <button
                  type="button"
                  onClick={() => void categories.refetch()}
                  className="cursor-pointer font-semibold text-brand underline-offset-2 hover:underline"
                >
                  Reintentar
                </button>
              </span>
            ) : categories.data && activeCategories.length === 0 ? (
              "No hay categorías activas para asignar."
            ) : undefined
          }
        >
          <option value="" disabled>
            {categories.isPending ? "Cargando categorías…" : "Elige una categoría"}
          </option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEs ?? c.nameEn ?? "Sin nombre"}
            </option>
          ))}
        </SelectField>
        <TextField
          label={`Precio base (${currencySymbol(currency)})`}
          value={values.basePrice}
          onChange={(e) => update("basePrice", e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          error={errors.basePrice}
          hint={required ? "Obligatorio para platos y bebidas." : "Opcional."}
        />

        <TextAreaField
          label="Descripción (opcional)"
          value={values.descriptionEs}
          onChange={(e) => update("descriptionEs", e.target.value)}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={2}
          error={errors.descriptionEs}
          wrapperClassName="col-span-2"
        />
      </div>

      {create.isError ? <InlineNotice tone="error">No se pudo crear el servicio. {actionErrorText(create.error)}</InlineNotice> : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" className="h-9 px-3.5" onClick={onCancel} disabled={create.isPending}>
          Cancelar
        </Button>
        <Button type="submit" className="h-9 px-4" disabled={create.isPending}>
          {create.isPending ? "Creando…" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
