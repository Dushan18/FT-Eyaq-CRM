"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { CommercialItemSelect } from "@/components/forms/commercial-item-select";
import { CustomerPicker } from "@/components/forms/customer-picker";
import { DateTimeField } from "@/components/forms/date-time-field";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";
import { ApiError } from "@/lib/api/client";
import { requestsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import {
  CONTACT_CHANNELS,
  type CommercialItemSummary,
  type ContactChannel,
  type CreateReservationRequestBody,
  type CurrencyCode,
  type Customer,
  type CustomerSummary,
  REQUEST_REASON_MAX_LENGTH,
  type ReservationRequest,
  type UpdateReservationRequestBody,
} from "@/lib/api/types";
import { CHANNELS } from "@/lib/domain/channels";
import { customerName } from "@/lib/domain/conversation";
import { isoToZonedInputs } from "@/lib/format/date-inputs";
import { serverFormErrors } from "@/lib/forms/server-errors";
import { useRestaurant } from "@/lib/restaurant";
import { reasonError, reasonValue } from "./request-detail-logic";
import {
  CURRENCY_OPTIONS,
  REQUEST_TEXT_MAX_LENGTH,
  buildCreateRequestBody,
  buildUpdateRequestBody,
  emptyRequestForm,
  requestFormValues,
  requestSaveErrors,
  validateRequestForm,
  type RequestFormErrors,
  type RequestFormValues,
  type RequestSaveErrors,
} from "./request-form-logic";

const linkClass = "font-semibold text-brand hover:underline";

/**
 * Tras guardar: la lista, los KPI, el detalle y Estadísticas (cuenta solicitudes) se releen. La respuesta
 * de una escritura no se guarda en qk.request(id): no trae statusHistory (el detalle se vuelve a pedir).
 */
function useInvalidateRequests() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.requestsAll });
    void queryClient.invalidateQueries({ queryKey: qk.statsAll });
  };
}

// ---------------------------------------------------------------- campos

function RequestFields({
  values,
  errors,
  onChange,
  onCustomer,
  disabled,
  currentItem,
  defaultCurrency,
}: {
  values: RequestFormValues;
  errors: RequestFormErrors;
  onChange: (patch: Partial<RequestFormValues>) => void;
  onCustomer: (customer: Customer | null) => void;
  disabled: boolean;
  /** Servicio ya guardado: se ofrece aunque ya no esté activo o aprobado. */
  currentItem?: CommercialItemSummary | null;
  /** Moneda que se muestra mientras no se elige otra. */
  defaultCurrency: CurrencyCode;
}) {
  const { timeZone } = useRestaurant();
  const today = isoToZonedInputs(new Date().toISOString(), timeZone).day;
  const hasPrice = values.price.trim() !== "";
  return (
    <div className="grid grid-cols-2 gap-3.5">
      <div className="col-span-2">
        <CustomerPicker value={values.customer} onChange={onCustomer} error={errors.customerId} disabled={disabled} />
      </div>
      <SelectField
        label="Canal de la solicitud"
        value={values.sourceChannel}
        onChange={(e) => onChange({ sourceChannel: e.target.value as ContactChannel })}
        error={errors.sourceChannel}
        disabled={disabled}
      >
        {values.sourceChannel === "" ? <option value="">Elige un canal</option> : null}
        {CONTACT_CHANNELS.map((channel) => (
          <option key={channel} value={channel}>
            {CHANNELS[channel].label}
          </option>
        ))}
      </SelectField>
      <CommercialItemSelect
        value={values.commercialItemId}
        onChange={(commercialItemId) => onChange({ commercialItemId })}
        current={currentItem}
        error={errors.commercialItemId}
        disabled={disabled}
      />
      <div className="col-span-2">
        <DateTimeField
          label="Fecha y hora"
          value={values.when}
          onChange={(when) => onChange({ when })}
          error={errors.reservationAt}
          hint={`Hora del restaurante (${timeZone}). Déjala vacía si aún no se sabe.`}
          disabled={disabled}
          minDay={today}
        />
      </div>
      <TextField
        label="Personas"
        inputMode="numeric"
        value={values.people}
        onChange={(e) => onChange({ people: e.target.value })}
        error={errors.numberOfPeople}
        disabled={disabled}
        autoComplete="off"
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,112px)] gap-2">
        <TextField
          label="Precio cotizado"
          inputMode="decimal"
          placeholder="150.00"
          value={values.price}
          onChange={(e) => onChange({ price: e.target.value })}
          error={errors.quotedPrice}
          disabled={disabled}
          autoComplete="off"
        />
        <SelectField
          label="Moneda"
          value={values.currency ?? defaultCurrency}
          onChange={(e) => onChange({ currency: e.target.value as CurrencyCode })}
          error={errors.currency}
          disabled={disabled || !hasPrice}
        >
          {CURRENCY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField
        label="Comentarios"
        wrapperClassName="col-span-2"
        rows={2}
        value={values.comments}
        onChange={(e) => onChange({ comments: e.target.value })}
        maxLength={REQUEST_TEXT_MAX_LENGTH}
        error={errors.comments}
        disabled={disabled}
      />
      <TextAreaField
        label="Requisitos especiales"
        wrapperClassName="col-span-2"
        rows={2}
        value={values.specialRequirements}
        onChange={(e) => onChange({ specialRequirements: e.target.value })}
        maxLength={REQUEST_TEXT_MAX_LENGTH}
        error={errors.specialRequirements}
        disabled={disabled}
      />
    </div>
  );
}

function SaveErrorNotice({ action, error }: { action: string; error: RequestSaveErrors | null }) {
  if (!error?.form) return null;
  return (
    <InlineNotice tone="error">
      {action} {error.form}
      {error.needsSetup ? (
        <>
          {" "}
          Un administrador puede completarla en{" "}
          <Link href="/ajustes/empresa" className={linkClass}>
            Ajustes › Empresa
          </Link>
          .
        </>
      ) : null}
    </InlineNotice>
  );
}

/** Estado común del formulario: valores, errores en vivo tras el primer intento y error del guardado. */
function useRequestForm(initial: () => RequestFormValues, validate: (values: RequestFormValues) => RequestFormErrors) {
  const [values, setValues] = useState<RequestFormValues>(initial);
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<RequestSaveErrors | null>(null);

  function update(patch: Partial<RequestFormValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    if (submitted) setErrors(validate(next));
  }

  /** Valida antes de enviar; devuelve false si hay errores. */
  function check(): boolean {
    setSubmitted(true);
    setSaveError(null);
    const found = validate(values);
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  function fail(found: RequestSaveErrors) {
    setErrors(found.fields);
    setSaveError(found);
  }

  return { values, errors, saveError, update, check, fail };
}

// ---------------------------------------------------------------- nueva solicitud

export interface NewRequestDialogProps {
  open: boolean;
  onClose: () => void;
  /** Cliente preseleccionado (p. ej. desde el panel de la Bandeja). */
  initialCustomer?: Customer | CustomerSummary | null;
  /** Canal por defecto; si falta, el de origen del cliente cuando se conoce. */
  initialChannel?: ContactChannel;
  onCreated?: (request: ReservationRequest) => void;
}

/**
 * Alta de una solicitud de reserva (POST /reservation-requests). No es idempotente: el botón se deshabilita
 * mientras guarda y, si la conexión falla, se pide revisar la lista antes de reintentar. El backend calcula
 * el estado: «Lista para enviar» con fecha y personas; si falta alguno, «Negociando».
 */
export function NewRequestDialog(props: NewRequestDialogProps) {
  return props.open ? <NewRequestDialogBody {...props} /> : null;
}

function NewRequestDialogBody({ onClose, initialCustomer, initialChannel, onCreated }: NewRequestDialogProps) {
  const formId = useId();
  const { timeZone, currency } = useRestaurant();
  const invalidate = useInvalidateRequests();
  const [channelTouched, setChannelTouched] = useState(Boolean(initialChannel));
  const form = useRequestForm(
    () => emptyRequestForm(initialCustomer, initialChannel),
    (values) => validateRequestForm(values, { timeZone, now: Date.now() }),
  );

  const create = useMutation({
    mutationFn: (body: CreateReservationRequestBody) => requestsApi.create(body),
    onSuccess: (request) => {
      invalidate();
      onCreated?.(request);
      onClose();
    },
    onError: (error) => {
      const found = requestSaveErrors(error, true);
      form.fail(found);
      if (found.refresh) invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending || !form.check()) return;
    create.mutate(buildCreateRequestBody(form.values, timeZone));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nueva solicitud"
      description="Con fecha, hora y personas queda «Lista para enviar»; si falta alguno, «Negociando»."
      busy={create.isPending}
      size="lg"
      footer={
        <>
          <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} className="h-9 px-4" disabled={create.isPending}>
            {create.isPending ? "Creando…" : "Crear solicitud"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate aria-label="Nueva solicitud" className="flex flex-col gap-3.5">
        <RequestFields
          values={form.values}
          errors={form.errors}
          disabled={create.isPending}
          defaultCurrency={currency}
          onChange={(patch) => {
            if (patch.sourceChannel !== undefined) setChannelTouched(true);
            form.update(patch);
          }}
          onCustomer={(customer) =>
            // Mientras no se elija otro, el canal es el de origen del cliente.
            form.update(customer && !channelTouched ? { customer, sourceChannel: customer.sourceChannel } : { customer })
          }
        />
        <SaveErrorNotice action="No se pudo crear la solicitud." error={form.saveError} />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- editar

/**
 * Edición de una solicitud en «Negociando» o «Lista para enviar» (PATCH /reservation-requests/:id): solo
 * se envían los campos que cambiaron, y la fecha solo si se modificó.
 */
export function EditRequestDialog({
  request,
  onClose,
  onSaved,
}: {
  request: ReservationRequest | null;
  onClose: () => void;
  onSaved?: (request: ReservationRequest) => void;
}) {
  return request ? <EditRequestDialogBody key={request.id} request={request} onClose={onClose} onSaved={onSaved} /> : null;
}

function EditRequestDialogBody({
  request,
  onClose,
  onSaved,
}: {
  request: ReservationRequest;
  onClose: () => void;
  onSaved?: (request: ReservationRequest) => void;
}) {
  const formId = useId();
  const { timeZone, currency } = useRestaurant();
  const invalidate = useInvalidateRequests();
  const initialWhen = isoToZonedInputs(request.reservationAt, timeZone);
  const form = useRequestForm(
    () => requestFormValues(request, timeZone),
    (values) => validateRequestForm(values, { timeZone, now: Date.now(), initialWhen }),
  );
  const body = buildUpdateRequestBody(request, form.values, timeZone);
  const dirty = Object.keys(body).length > 0;

  const save = useMutation({
    mutationFn: (changes: UpdateReservationRequestBody) => requestsApi.update(request.id, changes),
    onSuccess: (saved) => {
      invalidate();
      onSaved?.(saved);
      onClose();
    },
    onError: (error) => {
      const found = requestSaveErrors(error, false);
      form.fail(found);
      if (found.refresh) invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending || !dirty || !form.check()) return;
    save.mutate(body);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Editar ${request.code}`}
      description={`Solicitud de ${customerName(request.customer, request.sourceChannel)}.`}
      busy={save.isPending}
      size="lg"
      footer={
        <>
          <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} className="h-9 px-4" disabled={!dirty || save.isPending}>
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate aria-label={`Editar ${request.code}`} className="flex flex-col gap-3.5">
        <RequestFields
          values={form.values}
          errors={form.errors}
          disabled={save.isPending}
          currentItem={request.commercialItem}
          defaultCurrency={request.currency ?? currency}
          onChange={form.update}
          onCustomer={(customer) => form.update({ customer })}
        />
        <SaveErrorNotice action="No se pudieron guardar los cambios." error={form.saveError} />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- cancelar

/** Confirmación antes de cancelar (PATCH …/status con CANCELLED): es un estado final. */
export function CancelRequestDialog({
  request,
  onClose,
  onCancelled,
}: {
  request: ReservationRequest | null;
  onClose: () => void;
  onCancelled?: (request: ReservationRequest) => void;
}) {
  return request ? <CancelRequestDialogBody key={request.id} request={request} onClose={onClose} onCancelled={onCancelled} /> : null;
}

function CancelRequestDialogBody({
  request,
  onClose,
  onCancelled,
}: {
  request: ReservationRequest;
  onClose: () => void;
  onCancelled?: (request: ReservationRequest) => void;
}) {
  const invalidate = useInvalidateRequests();
  const [reason, setReason] = useState("");
  const reasonInvalid = reasonError(reason);
  const cancel = useMutation({
    mutationFn: (text: string | null) => requestsApi.cancel(request.id, text ?? undefined),
    onSuccess: (saved) => {
      invalidate();
      onCancelled?.(saved);
      onClose();
    },
    onError: (error) => {
      // Otra persona la cambió o la canceló: se relee la lista.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) invalidate();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="¿Cancelar la solicitud?"
      description={request.code}
      busy={cancel.isPending}
      size="sm"
      footer={
        <>
          <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={cancel.isPending} data-autofocus>
            Volver
          </Button>
          <Button
            className="h-9 px-4"
            onClick={() => !reasonInvalid && cancel.mutate(reasonValue(reason))}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? "Cancelando…" : "Cancelar solicitud"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13.5px]">
        <p className="m-0">
          La solicitud de {customerName(request.customer, request.sourceChannel)} pasará a «Cancelada». Es un estado final: no se
          podrá editar ni reactivar.
        </p>
        <TextAreaField
          label="Motivo (opcional)"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REQUEST_REASON_MAX_LENGTH}
          error={reasonInvalid}
          hint="Queda en el historial de la solicitud."
        />
        {cancel.isError ? (
          <InlineNotice tone="error">
            No se pudo cancelar. {serverFormErrors(cancel.error, []).form ?? "Inténtalo de nuevo."}
          </InlineNotice>
        ) : null}
      </div>
    </Dialog>
  );
}
