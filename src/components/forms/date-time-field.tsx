"use client";

import { useId } from "react";
import { inputClass } from "@/components/ui/fields";
import type { ZonedInputs } from "@/lib/format/date-inputs";
import { cn } from "@/lib/format/text";

/**
 * Día y hora en la zona del restaurante (dos campos nativos). Convierte el valor con `zonedInputsToIso`
 * (lib/format/date-inputs) antes de enviarlo: el backend exige ISO con segundos y zona.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
  required,
  minDay,
}: {
  label: string;
  value: ZonedInputs;
  onChange: (value: ZonedInputs) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  /** "YYYY-MM-DD" mínimo del selector de día (p. ej. hoy en la zona del restaurante). */
  minDay?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[12.5px] font-semibold text-slate">{label}</legend>
      <div className="flex gap-2">
        <input
          type="date"
          aria-label={`${label}: día`}
          value={value.day}
          min={minDay}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange({ ...value, day: e.target.value })}
          className={cn(inputClass, "min-w-0 flex-[3]", error && "border-[#e0a3a3]")}
        />
        <input
          type="time"
          aria-label={`${label}: hora`}
          value={value.time}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
          className={cn(inputClass, "min-w-0 flex-[2]", error && "border-[#e0a3a3]")}
        />
      </div>
      {error ? (
        <span id={hintId} className="text-xs text-[#b42323]">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="text-xs text-subtle">
          {hint}
        </span>
      ) : null}
    </fieldset>
  );
}
