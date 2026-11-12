"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { ContactChannel, RestaurantConfig } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { channelMeta } from "@/lib/domain/channels";
import { personName } from "@/lib/format/text";
import { ChannelDot, Toggle } from "@/components/ui/primitives";
import { TextField } from "@/components/ui/fields";
import { TimeoutField } from "./config-fields";
import { NO_RESPONSIBLE_LABEL, pickValues, samantaValues, type SamantaValues } from "./config-form";
import { validateFields, withoutErrors, type FieldErrors } from "./config-schema";
import {
  ConfigGate,
  PendingNote,
  ReadOnlyNotice,
  SaveArea,
  SettingsCard,
  TabBody,
  TabTitle,
  focusFirstInvalid,
} from "./config-ui";
import { useConfigSave, useDraft, useResetOnHide, type ConfigSave } from "./use-config-save";

/** Canales del mockup. El backend no tiene esta configuración: se muestran sin estado. */
const ASSISTANT_CHANNELS: readonly ContactChannel[] = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE"];

/** Reglas del mockup. Solo la primera la aplica hoy el backend. */
const RULES: ReadonlyArray<{ label: string; on: boolean; note: string }> = [
  {
    label: "Ofrecer solo servicios activos y precios registrados",
    on: true,
    note: "Regla aplicada por el backend (solo servicios activos y aprobados)",
  },
  { label: "Transferir a humano en grupos de más de 20 personas", on: false, note: "Pendiente en el backend" },
  { label: "Proponer otra fecha u horario si el dueño rechaza", on: false, note: "Pendiente en el backend" },
  { label: "Enviar recordatorio al cliente 24 h antes", on: false, note: "Pendiente en el backend" },
];

/** Ajustes › Samanta: canales, validación del dueño y reglas. */
export function SamantaView() {
  const save = useConfigSave();
  useResetOnHide(save.reset);

  return (
    <TabBody>
      <TabTitle>Samanta</TabTitle>
      <ConfigGate>{(config) => <SamantaContent config={config} save={save} />}</ConfigGate>
    </TabBody>
  );
}

function SamantaContent({ config, save }: { config: RestaurantConfig; save: ConfigSave }) {
  const session = useSession();
  const canEdit = session.can("config.edit");

  return (
    <>
      {canEdit ? null : <ReadOnlyNotice />}
      <SettingsCard title="Canales donde atiende">
        {ASSISTANT_CHANNELS.map((channel) => {
          const meta = channelMeta(channel);
          return (
            <div key={channel} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13.5px]">
                <ChannelDot channel={channel} />
                {meta.label}
              </span>
              <Toggle checked={false} disabled label={`${meta.label}: pendiente en el backend`} />
            </div>
          );
        })}
        <PendingNote>Pendiente en el backend: hoy solo WhatsApp tiene integración real.</PendingNote>
      </SettingsCard>
      <OwnerValidationCard config={config} save={save} canEdit={canEdit} />
      <SettingsCard title="Reglas">
        {RULES.map((rule) => (
          <div key={rule.label} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13.5px] text-pretty">{rule.label}</span>
              <PendingNote>{rule.note}</PendingNote>
            </span>
            <Toggle checked={rule.on} disabled label={rule.label} />
          </div>
        ))}
      </SettingsCard>
    </>
  );
}

/**
 * Tiempo máximo de respuesta. El WhatsApp del propietario y el responsable de aprobaciones se editan en
 * Empresa (Aprobación del propietario); aquí solo se muestran.
 */
function OwnerValidationCard({ config, save, canEdit }: { config: RestaurantConfig; save: ConfigSave; canEdit: boolean }) {
  const base = useMemo(() => samantaValues(config), [config]);
  const { values, changed, dirty, update, reset, commit } = useDraft(base);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function change(patch: Partial<SamantaValues>) {
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

  const responsibleName = config.approvalResponsible
    ? personName(config.approvalResponsible.firstName, config.approvalResponsible.lastName)
    : NO_RESPONSIBLE_LABEL;
  const editLink = <Link href="/ajustes/empresa" className="font-semibold text-brand hover:underline">Empresa</Link>;

  return (
    <SettingsCard title="Validación del propietario">
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField label="Responsable de aprobaciones" value={responsibleName} readOnly disabled hint={<>Se edita en {editLink}.</>} />
          <TextField
            label="WhatsApp personal del propietario"
            value={config.ownerWhatsappNumber ?? "Sin número"}
            readOnly
            disabled
            hint={<>Se edita en {editLink}.</>}
          />
          <TimeoutField
            value={values.responseTimeoutMinutes}
            error={errors.responseTimeoutMinutes}
            disabled={!canEdit}
            onChange={(responseTimeoutMinutes) => change({ responseTimeoutMinutes })}
          />
          <TextField label="Si no responde" placeholder="—" disabled hint="Pendiente en el backend" />
        </div>
        {canEdit ? (
          <SaveArea save={save} tab="samanta" dirty={dirty} invalid={Object.keys(errors).length > 0} onDiscard={discard} />
        ) : null}
      </form>
    </SettingsCard>
  );
}

