"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { usersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { RestaurantConfig, User } from "@/lib/api/types";
import { personName } from "@/lib/format/text";
import { SelectField, TextField } from "@/components/ui/fields";
import { InlineNotice } from "@/components/ui/state";
import { NO_RESPONSIBLE_LABEL, ownerApprovalValues, pickValues, responsibleOptions, type OwnerApprovalValues } from "./config-form";
import { ownerNumberError, validateFields, withoutErrors, type FieldErrors } from "./config-schema";
import { SaveArea, SettingsCard, focusFirstInvalid } from "./config-ui";
import { useDraft, type ConfigSave } from "./use-config-save";

export const OWNER_APPROVAL_NOTE =
  "Las solicitudes de Samanta y de la web se envían a este WhatsApp para que el propietario las apruebe. Sin número o sin responsable, no se envía nada.";

/**
 * WhatsApp personal del propietario y responsable de aprobaciones (M9.1). Solo ADMIN guarda; el resto
 * ve los valores. Los candidatos salen de GET /users (solo ADMIN): usuarios activos con rol OWNER.
 */
export function OwnerApprovalCard({ config, save, canEdit }: { config: RestaurantConfig; save: ConfigSave; canEdit: boolean }) {
  const base = useMemo(() => ownerApprovalValues(config), [config]);
  const { values, changed, dirty, update, reset, commit } = useDraft(base);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const users = useQuery({ queryKey: qk.users, queryFn: usersApi.list, enabled: canEdit });

  function change(patch: Partial<OwnerApprovalValues>) {
    update(patch);
    setErrors((current) => withoutErrors(current, ...Object.keys(patch)));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !dirty || save.isPending) return;
    const sent = pickValues(values, changed);
    const result = validateFields(sent);
    const found: FieldErrors = result.success ? {} : { ...result.errors };
    const owner = result.success ? result.data.ownerWhatsappNumber : undefined;
    // El cruce con el WhatsApp del negocio no cabe en el esquema por campo: se comprueba aquí.
    const clash = owner !== undefined ? ownerNumberError(owner, config.whatsappNumber) : undefined;
    if (clash) found.ownerWhatsappNumber ??= clash;
    if (!result.success || Object.keys(found).length > 0) {
      setErrors(found);
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    const data = result.data;
    save.mutate({ mode: "update", apply: (current) => ({ ...current, ...data }), onSaved: () => commit(sent) });
  }

  function discard() {
    reset();
    setErrors({});
    save.reset();
  }

  const { options, currentInvalid } = responsibleOptions(users.data, config.approvalResponsible);
  // El responsable guardado ya no es válido: el backend rechazaría cualquier guardado de Ajustes.
  const staleSelected = canEdit && currentInvalid && values.approvalResponsibleId === config.approvalResponsibleId;
  const responsibleName = config.approvalResponsible
    ? personName(config.approvalResponsible.firstName, config.approvalResponsible.lastName)
    : NO_RESPONSIBLE_LABEL;
  const incomplete = !config.ownerWhatsappNumber || !config.approvalResponsibleId;

  return (
    <SettingsCard title="Aprobación del propietario">
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <InlineNotice tone={incomplete ? "warning" : "info"}>{OWNER_APPROVAL_NOTE}</InlineNotice>
        {staleSelected ? (
          <InlineNotice tone="warning">
            {responsibleName} ya no está activo o perdió el rol Propietario: el backend rechazará los cambios de Ajustes hasta
            que elijas otro responsable o lo dejes sin responsable.
          </InlineNotice>
        ) : null}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField
            label="WhatsApp personal del propietario"
            type="tel"
            inputMode="tel"
            placeholder="+51912345678"
            value={values.ownerWhatsappNumber}
            error={errors.ownerWhatsappNumber}
            hint="Formato internacional. Distinto del WhatsApp del negocio. Déjalo vacío para no enviar solicitudes."
            disabled={!canEdit}
            readOnly={!canEdit}
            onChange={(e) => change({ ownerWhatsappNumber: e.target.value })}
          />
          {canEdit ? (
            <SelectField
              label="Responsable de aprobaciones"
              value={values.approvalResponsibleId}
              error={errors.approvalResponsibleId}
              hint={<OwnersHint users={users} />}
              onChange={(e) => change({ approvalResponsibleId: e.target.value })}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          ) : (
            <TextField label="Responsable de aprobaciones" value={responsibleName} readOnly disabled />
          )}
        </div>
        {canEdit ? (
          <SaveArea save={save} tab="empresa" dirty={dirty} invalid={Object.keys(errors).length > 0} onDiscard={discard} />
        ) : null}
      </form>
    </SettingsCard>
  );
}

/** Estado de la lista de propietarios bajo el selector: cargando, error con Reintentar o la regla. */
function OwnersHint({ users }: { users: UseQueryResult<User[]> }) {
  if (users.isError) {
    return (
      <>
        No se pudo cargar la lista de propietarios.{" "}
        <button type="button" onClick={() => void users.refetch()} className="cursor-pointer font-semibold text-brand hover:underline">
          Reintentar
        </button>
      </>
    );
  }
  return users.isPending ? "Cargando propietarios…" : "Usuarios activos con rol Propietario.";
}
