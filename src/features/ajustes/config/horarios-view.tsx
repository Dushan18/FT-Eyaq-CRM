"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DAYS_OF_WEEK, type DayOfWeek, type RestaurantConfig } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/format/text";
import { Toggle } from "@/components/ui/primitives";
import {
  DAY_LABELS,
  horariosValues,
  pickValues,
  sameDay,
  weekToInput,
  type DayValues,
  type HorariosValues,
} from "./config-form";
import { replaceSchedules } from "./config-request";
import { validateFields, withoutErrors, type FieldErrors } from "./config-schema";
import { ConfigGate, ReadOnlyNotice, SaveArea, TabBody, TabTitle, focusFirstInvalid } from "./config-ui";
import { useConfigSave, useDraft, useResetOnHide, type ConfigSave } from "./use-config-save";

/** Ajustes › Horarios: un rango por día, de lunes a domingo. */
export function HorariosView() {
  const save = useConfigSave();
  useResetOnHide(save.reset);

  return (
    <TabBody>
      <TabTitle>Horarios de atención</TabTitle>
      <ConfigGate>{(config) => <HorariosForm config={config} save={save} />}</ConfigGate>
    </TabBody>
  );
}

function HorariosForm({ config, save }: { config: RestaurantConfig; save: ConfigSave }) {
  const session = useSession();
  const canEdit = session.can("config.edit");
  const base = useMemo(() => horariosValues(config), [config]);
  const { values, changed, dirty, update, reset, commit } = useDraft(base, sameDay);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function changeDay(day: DayOfWeek, next: DayValues) {
    const patch: Partial<HorariosValues> = {};
    patch[day] = next;
    update(patch);
    setErrors((current) => withoutErrors(current, `schedules.${DAYS_OF_WEEK.indexOf(day)}`));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !dirty || save.isPending) return;
    // Se valida la semana completa (los índices de error son los días), pero solo se envían los días
    // cambiados sobre la configuración releída, para no pisar otros cambios recientes.
    const result = validateFields({ schedules: weekToInput(values) });
    if (!result.success) {
      setErrors(result.errors);
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    const updates = (result.data.schedules ?? []).filter((day) => changed.includes(day.dayOfWeek));
    const sent = pickValues(values, changed);
    save.mutate({ mode: "update", apply: (current) => replaceSchedules(current, updates), onSaved: () => commit(sent) });
  }

  function discard() {
    reset();
    setErrors({});
    save.reset();
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      {canEdit ? null : <ReadOnlyNotice />}
      <div role="table" aria-label="Horarios de atención" className="overflow-hidden rounded-[14px] border border-card">
        <div role="row" className="sr-only">
          <span role="columnheader">Día</span>
          <span role="columnheader">Abierto</span>
          <span role="columnheader">Horario</span>
        </div>
        {DAYS_OF_WEEK.map((day, index) => (
          <DayRow
            key={day}
            day={day}
            value={values[day]}
            errors={[errors[`schedules.${index}.openTime`], errors[`schedules.${index}.closeTime`]]}
            disabled={!canEdit}
            onChange={(next) => changeDay(day, next)}
          />
        ))}
      </div>
      <p className="m-0 text-[12.5px] text-muted">
        El cierre más tardío admitido es 23:59; el backend no acepta horarios que crucen la medianoche.
      </p>
      {canEdit ? (
        <SaveArea save={save} tab="horarios" dirty={dirty} invalid={Object.keys(errors).length > 0} onDiscard={discard} />
      ) : null}
    </form>
  );
}

function DayRow({
  day,
  value,
  errors,
  disabled,
  onChange,
}: {
  day: DayOfWeek;
  value: DayValues;
  /** [error de apertura, error de cierre] */
  errors: [string | undefined, string | undefined];
  disabled: boolean;
  onChange: (next: DayValues) => void;
}) {
  const errorId = useId();
  const name = DAY_LABELS[day].toLocaleLowerCase("es");
  const [openError, closeError] = errors;
  const message = [openError, closeError].filter(Boolean).join(" ");

  return (
    <div role="row" className="grid grid-cols-[120px_50px_1fr] items-center gap-3.5 border-b border-line-2 px-4 py-3">
      <span role="cell" className="text-[13.5px] font-semibold">
        {DAY_LABELS[day]}
      </span>
      <span role="cell" className="flex">
        <Toggle
          checked={value.isOpen}
          label={`Abierto el ${name}`}
          disabled={disabled}
          onChange={(isOpen) => onChange({ ...value, isOpen })}
        />
      </span>
      <span role="cell" className="flex min-w-0 flex-col gap-1">
        {value.isOpen ? (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <TimeInput
              label={`Apertura del ${name}`}
              value={value.openTime}
              invalid={Boolean(openError)}
              describedBy={message ? errorId : undefined}
              disabled={disabled}
              onChange={(openTime) => onChange({ ...value, openTime })}
            />
            a
            <TimeInput
              label={`Cierre del ${name}`}
              value={value.closeTime}
              invalid={Boolean(closeError)}
              describedBy={message ? errorId : undefined}
              disabled={disabled}
              onChange={(closeTime) => onChange({ ...value, closeTime })}
            />
          </span>
        ) : (
          <span className="text-[13px] text-subtle">Cerrado</span>
        )}
        {message ? (
          <span id={errorId} className="text-xs text-[#b42323]">
            {message}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Hora "HH:mm" (90 × 34 px como el mockup). Sin el ícono del selector de Chrome, que en 90 px tapaba
 * los minutos: la hora se escribe o se ajusta con las flechas del teclado.
 */
function TimeInput({
  label,
  value,
  invalid,
  describedBy,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8.5 w-22.5 rounded-[10px] border border-field bg-white px-3 text-[13.5px] text-ink outline-none transition-colors focus:border-brand disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted [&::-webkit-calendar-picker-indicator]:hidden",
        invalid && "border-[#e0a3a3]",
      )}
    />
  );
}
