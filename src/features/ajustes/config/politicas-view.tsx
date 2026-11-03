"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { RestaurantConfig } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { PolicyFields } from "./config-fields";
import { pickValues, politicasValues, type PoliticasValues } from "./config-form";
import { validateFields, withoutErrors, type FieldErrors } from "./config-schema";
import { ConfigGate, ReadOnlyNotice, SaveArea, TabBody, TabTitle, focusFirstInvalid } from "./config-ui";
import { useConfigSave, useDraft, useResetOnHide, type ConfigSave } from "./use-config-save";

/** Ajustes › Políticas: reserva y cancelación (ambas obligatorias, hasta 5000 caracteres). */
export function PoliticasView() {
  const save = useConfigSave();
  useResetOnHide(save.reset);

  return (
    <TabBody>
      <TabTitle>Políticas</TabTitle>
      <ConfigGate>{(config) => <PoliticasForm config={config} save={save} />}</ConfigGate>
    </TabBody>
  );
}

function PoliticasForm({ config, save }: { config: RestaurantConfig; save: ConfigSave }) {
  const session = useSession();
  const canEdit = session.can("config.edit");
  const base = useMemo(() => politicasValues(config), [config]);
  const { values, changed, dirty, update, reset, commit } = useDraft(base);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function change(patch: Partial<PoliticasValues>) {
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
      <PolicyFields values={values} errors={errors} disabled={!canEdit} onChange={change} />
      {canEdit ? (
        <SaveArea save={save} tab="politicas" dirty={dirty} invalid={Object.keys(errors).length > 0} onDiscard={discard} />
      ) : null}
    </form>
  );
}
