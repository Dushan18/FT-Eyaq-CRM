"use client";

import { useEffect, useId, useState } from "react";
import type { LanguageCode } from "@/lib/api/types";
import { cn } from "@/lib/format/text";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import {
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  timeZoneOptions,
  toggleLanguage,
  type EmpresaValues,
  type PoliticasValues,
} from "./config-form";
import { urlProblem, type FieldErrors } from "./config-schema";

const LOGO_NOTE = "El backend aún no permite subir archivos: pega la URL pública de la imagen.";
const PREVIEW_DELAY_MS = 600;

/** Logotipo: caja de 72 × 72 (rayada con "logo" si no hay imagen) y campo de URL en vez de subida. */
function LogoField({
  value,
  error,
  disabled,
  onChange,
}: {
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const url = value.trim();
  const previewable = url !== "" && urlProblem(url) === null;
  // La vista previa espera a que se deje de escribir, para no pedir una imagen por cada tecla.
  const [settledUrl, setSettledUrl] = useState(url);
  useEffect(() => {
    const timer = setTimeout(() => setSettledUrl(url), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [url]);
  // URL que no cargó: se vuelve a intentar en cuanto cambia.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const preview = previewable && settledUrl === url ? url : null;
  const broken = preview !== null && brokenUrl === preview;

  return (
    <div className="flex items-center gap-4">
      {preview && !broken ? (
        <div className="grid size-18 shrink-0 place-items-center overflow-hidden rounded-2xl border border-card bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL externa arbitraria: next/image exige dominios configurados. */}
          <img src={preview} alt="Logotipo del restaurante" className="size-full object-contain" onError={() => setBrokenUrl(preview)} />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="grid size-18 shrink-0 place-items-center rounded-2xl border border-dashed border-[#c9d0dc] font-mono text-[10px] text-subtle"
          style={{ background: "repeating-linear-gradient(45deg,#f6f7fa 0 6px,#eef0f4 6px 12px)" }}
        >
          logo
        </div>
      )}
      <TextField
        label="URL del logotipo"
        type="url"
        inputMode="url"
        placeholder="https://"
        wrapperClassName="min-w-0 flex-1"
        value={value}
        error={error}
        hint={broken ? `No se pudo mostrar la imagen de esa URL. ${LOGO_NOTE}` : LOGO_NOTE}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Idiomas de atención: casillas con aspecto de chip (al menos uno). */
function LanguageChips({
  value,
  error,
  disabled,
  onChange,
}: {
  value: LanguageCode[];
  error?: string;
  disabled: boolean;
  onChange: (value: LanguageCode[]) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-[12.5px] font-semibold text-slate">
        Idiomas de atención
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="flex min-h-10 flex-wrap items-center gap-1.5">
        {LANGUAGE_OPTIONS.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "inline-flex h-7.5 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand",
                checked ? "border-brand bg-brand text-white" : "border-field bg-white text-slate",
                disabled ? "cursor-not-allowed opacity-60" : cn("cursor-pointer", !checked && "hover:bg-surface"),
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={() => onChange(toggleLanguage(value, option.value))}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <span id={`${id}-error`} className="text-xs text-[#b42323]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Campos de "Datos de la empresa" (pestaña Empresa y configuración inicial). */
export function EmpresaFields({
  values,
  errors,
  disabled,
  onChange,
}: {
  values: EmpresaValues;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (patch: Partial<EmpresaValues>) => void;
}) {
  return (
    <>
      <LogoField value={values.logoUrl} error={errors.logoUrl} disabled={disabled} onChange={(logoUrl) => onChange({ logoUrl })} />
      <div className="grid grid-cols-2 gap-3.5">
        <TextField
          label="Nombre comercial"
          value={values.businessName}
          error={errors.businessName}
          disabled={disabled}
          autoComplete="organization"
          onChange={(e) => onChange({ businessName: e.target.value })}
        />
        <SelectField
          label="Moneda"
          value={values.currency}
          error={errors.currency}
          disabled={disabled}
          onChange={(e) => onChange({ currency: e.target.value as EmpresaValues["currency"] })}
        >
          {CURRENCY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Descripción"
          wrapperClassName="col-span-2"
          value={values.description}
          error={errors.description}
          disabled={disabled}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <TextField
          label="Dirección"
          wrapperClassName="col-span-2"
          value={values.address}
          error={errors.address}
          disabled={disabled}
          autoComplete="street-address"
          onChange={(e) => onChange({ address: e.target.value })}
        />
        <TextField
          label="WhatsApp del negocio"
          type="tel"
          inputMode="tel"
          placeholder="+51987654321"
          hint="Formato internacional: +51…"
          value={values.whatsappNumber}
          error={errors.whatsappNumber}
          disabled={disabled}
          onChange={(e) => onChange({ whatsappNumber: e.target.value })}
        />
        <TextField
          label="Correo"
          type="email"
          inputMode="email"
          value={values.email}
          error={errors.email}
          disabled={disabled}
          autoComplete="email"
          onChange={(e) => onChange({ email: e.target.value })}
        />
        <TextField
          label="Página web"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={values.website}
          error={errors.website}
          disabled={disabled}
          onChange={(e) => onChange({ website: e.target.value })}
        />
        <LanguageChips
          value={values.languages}
          error={errors.languages}
          disabled={disabled}
          onChange={(languages) => onChange({ languages })}
        />
        <SelectField
          label="Zona horaria"
          hint="Las fechas del CRM se muestran en esta zona."
          value={values.timeZone}
          error={errors.timeZone}
          disabled={disabled}
          onChange={(e) => onChange({ timeZone: e.target.value })}
        >
          {timeZoneOptions(values.timeZone).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>
    </>
  );
}

/** Política de reserva y de cancelación (textos de 4 filas). */
export function PolicyFields({
  values,
  errors,
  disabled,
  onChange,
}: {
  values: PoliticasValues;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (patch: Partial<PoliticasValues>) => void;
}) {
  return (
    <>
      <TextAreaField
        label="Política de reserva"
        rows={4}
        value={values.reservationPolicy}
        error={errors.reservationPolicy}
        disabled={disabled}
        onChange={(e) => onChange({ reservationPolicy: e.target.value })}
      />
      <TextAreaField
        label="Política de cancelación"
        rows={4}
        value={values.cancellationPolicy}
        error={errors.cancellationPolicy}
        disabled={disabled}
        onChange={(e) => onChange({ cancellationPolicy: e.target.value })}
      />
    </>
  );
}

/** Tiempo máximo de respuesta del dueño, en minutos (1 a 1440). */
export function TimeoutField({
  value,
  error,
  disabled,
  onChange,
}: {
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      label="Tiempo máximo de respuesta"
      type="number"
      inputMode="numeric"
      min={1}
      max={1440}
      step={1}
      hint="En minutos, de 1 a 1440."
      value={value}
      error={error}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
