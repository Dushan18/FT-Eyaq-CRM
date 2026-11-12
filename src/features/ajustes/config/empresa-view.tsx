"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { RestaurantConfig } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { InlineNotice } from "@/components/ui/state";
import { EmpresaFields, PolicyFields, TimeoutField } from "./config-fields";
import { empresaValues, emptySetupValues, pickValues, setupRequestInput, type EmpresaValues, type SetupValues } from "./config-form";
import { validateConfig, validateFields, withoutErrors, type FieldErrors } from "./config-schema";
import { ConfigGate, ReadOnlyNotice, SaveArea, TabBody, TabTitle, focusFirstInvalid } from "./config-ui";
import { OwnerApprovalCard } from "./owner-approval-card";
import { useConfigSave, useDraft, useResetOnHide, type ConfigSave } from "./use-config-save";

/** Ajustes › Empresa. Si el restaurante aún no está configurado, ADMIN ve el formulario inicial. */
export function EmpresaView() {
  const session = useSession();
  const canEdit = session.can("config.edit");
  // Un solo guardado para el alta y la edición: tras el alta, la pestaña muestra el aviso de guardado.
  const save = useConfigSave();
  useResetOnHide(save.reset);
  // Guardado propio: sus avisos y errores no se mezclan con los de los datos de la empresa.
  const ownerSave = useConfigSave();
  useResetOnHide(ownerSave.reset);

  return (
    <TabBody>
      <TabTitle>Datos de la empresa</TabTitle>
      <ConfigGate setup={canEdit ? <SetupForm save={save} /> : undefined}>
        {(config) => (
          <>
            <EmpresaForm config={config} save={save} canEdit={canEdit} />
            <OwnerApprovalCard config={config} save={ownerSave} canEdit={canEdit} />
          </>
        )}
      </ConfigGate>
    </TabBody>
  );
}

function EmpresaForm({ config, save, canEdit }: { config: RestaurantConfig; save: ConfigSave; canEdit: boolean }) {
  const base = useMemo(() => empresaValues(config), [config]);
  const { values, changed, dirty, update, reset, commit } = useDraft(base);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function change(patch: Partial<EmpresaValues>) {
    update(patch);
    setErrors((current) => withoutErrors(current, ...Object.keys(patch)));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !dirty || save.isPending) return;
    const sent = pickValues(values, changed);
    const result = validateFields(sent);
    if (!result.success) {
      setErrors(result.errors);
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

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      {canEdit ? null : <ReadOnlyNotice />}
      <EmpresaFields values={values} errors={errors} disabled={!canEdit} onChange={change} />
      {canEdit ? (
        <SaveArea save={save} tab="empresa" dirty={dirty} invalid={Object.keys(errors).length > 0} onDiscard={discard} />
      ) : null}
    </form>
  );
}

/** Primera configuración (GET 404, solo ADMIN): Empresa, políticas y tiempo de respuesta. */
function SetupForm({ save }: { save: ConfigSave }) {
  const [base] = useState(emptySetupValues);
  const { values, dirty, update, reset } = useDraft(base);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function change(patch: Partial<SetupValues>) {
    update(patch);
    setErrors((current) => withoutErrors(current, ...Object.keys(patch)));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const result = validateConfig(setupRequestInput(values));
    if (!result.success) {
      setErrors(result.errors);
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    save.mutate({ mode: "create", request: result.data });
  }

  function discard() {
    reset();
    setErrors({});
    save.reset();
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <InlineNotice tone="warning">
        El restaurante aún no está configurado: sin estos datos no se pueden registrar solicitudes ni reservas. Al guardar,
        los 7 días quedan cerrados; luego ajústalos en Horarios.
      </InlineNotice>
      <EmpresaFields values={values} errors={errors} disabled={false} onChange={change} />
      <h3 className="m-0 text-sm font-bold">Políticas</h3>
      <PolicyFields values={values} errors={errors} disabled={false} onChange={change} />
      <h3 className="m-0 text-sm font-bold">Validación del dueño</h3>
      <div className="grid grid-cols-2 gap-3.5">
        <TimeoutField
          value={values.responseTimeoutMinutes}
          error={errors.responseTimeoutMinutes}
          disabled={false}
          onChange={(responseTimeoutMinutes) => change({ responseTimeoutMinutes })}
        />
      </div>
      <SaveArea
        save={save}
        tab="empresa"
        dirty={dirty}
        invalid={Object.keys(errors).length > 0}
        onDiscard={discard}
        submitLabel="Guardar configuración"
        alwaysSubmittable
      />
    </form>
  );
}
