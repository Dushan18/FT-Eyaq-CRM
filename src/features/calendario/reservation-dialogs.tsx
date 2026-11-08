"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { isConnectionError } from "@/lib/api/errors";
import { reservationsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type {
  CreateReservationBody,
  CustomerSummary,
  RescheduleReservationBody,
  Reservation,
  UpdateReservationBody,
} from "@/lib/api/types";
import { formatDayTime } from "@/lib/format/dates";
import { isoToZonedInputs, type ZonedInputs } from "@/lib/format/date-inputs";
import { useNow } from "@/lib/hooks/use-now";
import { useRestaurant } from "@/lib/restaurant";
import { CommercialItemSelect } from "@/components/forms/commercial-item-select";
import { CustomerPicker } from "@/components/forms/customer-picker";
import { DateTimeField } from "@/components/forms/date-time-field";
import { Dialog } from "@/components/ui/dialog";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";
import { storeCreatedReservation, storeReservation } from "./reservation-cache";
import {
  CREATE_FIELDS,
  EDIT_FIELDS,
  FORM_MESSAGES,
  RESCHEDULE_FIELDS,
  TEXT_MAX,
  editFormFrom,
  isConfigMissing,
  reservationFormErrors,
  shouldRefreshAfter,
  updateBody,
  validateCreate,
  validateReschedule,
  type CreateField,
  type EditField,
  type EditReservationForm,
  type FieldErrors,
  type RescheduleField,
} from "./reservation-actions";

const REVIEW_FIELDS = "Revisa los campos marcados.";
const CREATE_UNCERTAIN =
  "No se pudo confirmar si la reserva se creó. Revisa el calendario antes de intentarlo de nuevo: cada intento crea otra reserva.";
const SETTINGS_LINK_CLASS = "font-semibold underline";

/**
 * El diálogo enfoca su primer elemento (el botón «Cerrar»): en los formularios, el foco va al primer campo.
 * Corre después del efecto del diálogo (los efectos del padre van después de los del hijo).
 */
function useFocusFirstField(form: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    form.current?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus();
  }, [form]);
}

function dayKeyIn(now: number, timeZone: string): string {
  return isoToZonedInputs(new Date(now).toISOString(), timeZone).day;
}

function DialogFooter({ formId, pending, submitLabel, disabled, onClose }: {
  formId: string;
  pending: boolean;
  submitLabel: string;
  disabled?: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={pending}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} className="h-9 px-4" disabled={pending || disabled}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------- nueva reserva

/**
 * «Nueva reserva» (POST /reservations, solo ADMIN). Nace en Confirmada y sin responsable. No es idempotente:
 * el botón se deshabilita mientras guarda y, tras un error de conexión, se pide revisar el calendario.
 */
export function NewReservationDialog({
  initialDay,
  onClose,
  onCreated,
}: {
  /** "YYYY-MM-DD" que se propone (el día que se está viendo, si no es pasado). */
  initialDay: string;
  onClose: () => void;
  onCreated: (created: Reservation) => void;
}) {
  const { timeZone, missing } = useRestaurant();
  const queryClient = useQueryClient();
  const now = useNow();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstField(formRef);

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [when, setWhen] = useState<ZonedInputs>({ day: initialDay, time: "" });
  const [people, setPeople] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors<CreateField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [configError, setConfigError] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: CreateReservationBody) => reservationsApi.create(body),
    onSuccess: (created) => {
      storeCreatedReservation(queryClient, created);
      onCreated(created);
    },
    onError: (error) => {
      const result = reservationFormErrors(error, CREATE_FIELDS, { uncertain: CREATE_UNCERTAIN });
      setErrors(result.fields);
      setFormError(result.form);
      setConfigError(isConfigMissing(error));
      // Tras un 504 la reserva pudo crearse: el calendario se vuelve a leer antes de que se repita.
      if (isConnectionError(error)) void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
    },
  });
  const pending = mutation.isPending;
  const clear = (field: CreateField) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const result = validateCreate({ customerId: customer?.id ?? null, when, people, commercialItemId: itemId, notes }, timeZone, Date.now());
    setConfigError(false);
    if (result.errors) {
      setErrors(result.errors);
      setFormError(REVIEW_FIELDS);
      return;
    }
    setErrors({});
    setFormError(null);
    mutation.mutate(result.body);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      busy={pending}
      title="Nueva reserva"
      description="Se crea como «Confirmada» y sin responsable. La fecha y la hora son las del restaurante."
      footer={<DialogFooter formId={formId} pending={pending} submitLabel="Crear reserva" disabled={missing} onClose={onClose} />}
    >
      <form ref={formRef} id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {missing ? (
          <InlineNotice tone="warning">
            El restaurante aún no está configurado. Complétalo en{" "}
            <Link href="/ajustes/empresa" onClick={onClose} className={SETTINGS_LINK_CLASS}>
              Ajustes › Empresa
            </Link>{" "}
            antes de crear reservas.
          </InlineNotice>
        ) : null}
        <CustomerPicker
          value={customer}
          onChange={(value) => {
            setCustomer(value);
            clear("customerId");
          }}
          error={errors.customerId}
          disabled={pending}
        />
        <DateTimeField
          label="Fecha y hora"
          value={when}
          onChange={(value) => {
            setWhen(value);
            clear("reservationAt");
          }}
          error={errors.reservationAt}
          hint={`Hora del restaurante (${timeZone}). Debe ser futura.`}
          minDay={dayKeyIn(now, timeZone)}
          required
          disabled={pending}
        />
        <TextField
          label="Personas"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={people}
          onChange={(event) => {
            setPeople(event.target.value);
            clear("numberOfPeople");
          }}
          error={errors.numberOfPeople}
          required
          disabled={pending}
        />
        <CommercialItemSelect
          label="Servicio (opcional)"
          value={itemId}
          onChange={(value) => {
            setItemId(value);
            clear("commercialItemId");
          }}
          error={errors.commercialItemId}
          disabled={pending}
        />
        <TextAreaField
          label="Notas (opcional)"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            clear("notes");
          }}
          maxLength={TEXT_MAX}
          rows={3}
          error={errors.notes}
          disabled={pending}
        />
        {formError ? (
          <InlineNotice tone="error">
            {formError}
            {configError ? (
              <>
                {" "}
                <Link href="/ajustes/empresa" onClick={onClose} className={SETTINGS_LINK_CLASS}>
                  Ir a Ajustes › Empresa
                </Link>
              </>
            ) : null}
          </InlineNotice>
        ) : null}
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- editar

/**
 * «Editar» (PATCH /reservations/:id): personas, servicio y notas generales. Envía solo lo que cambió; la
 * fecha se cambia con «Reprogramar». Solo en Confirmada, Preparada y Reprogramada.
 */
export function EditReservationDialog({
  reservation,
  onClose,
  onSaved,
}: {
  reservation: Reservation;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}) {
  const queryClient = useQueryClient();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstField(formRef);
  const [form, setForm] = useState<EditReservationForm>(() => editFormFrom(reservation));
  const [errors, setErrors] = useState<FieldErrors<EditField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const draft = updateBody(reservation, form);
  const changed = Object.keys(draft.body).length > 0;

  const mutation = useMutation({
    mutationFn: (body: UpdateReservationBody) => reservationsApi.update(reservation.id, body),
    onSuccess: (updated) => {
      storeReservation(queryClient, updated, { stats: true });
      onSaved(updated);
      onClose();
    },
    onError: (error) => {
      const result = reservationFormErrors(error, EDIT_FIELDS);
      setErrors(result.fields);
      setFormError(result.form);
      if (shouldRefreshAfter(error)) void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
    },
  });
  const pending = mutation.isPending;
  const update = (field: EditField, patch: Partial<EditReservationForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (Object.keys(draft.errors).length > 0) {
      setErrors(draft.errors);
      setFormError(REVIEW_FIELDS);
      return;
    }
    if (!changed) {
      setFormError(FORM_MESSAGES.noChanges);
      return;
    }
    setErrors({});
    setFormError(null);
    mutation.mutate(draft.body);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      busy={pending}
      title={`Editar reserva ${reservation.code}`}
      description="La fecha y la hora se cambian con «Reprogramar»."
      footer={<DialogFooter formId={formId} pending={pending} submitLabel="Guardar cambios" disabled={!changed} onClose={onClose} />}
    >
      <form ref={formRef} id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Personas"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={form.people}
          onChange={(event) => update("numberOfPeople", { people: event.target.value })}
          error={errors.numberOfPeople}
          required
          disabled={pending}
        />
        <CommercialItemSelect
          value={form.commercialItemId}
          current={reservation.commercialItem}
          onChange={(value) => update("commercialItemId", { commercialItemId: value })}
          error={errors.commercialItemId}
          disabled={pending}
        />
        <TextAreaField
          label="Notas"
          value={form.notes}
          onChange={(event) => update("notes", { notes: event.target.value })}
          maxLength={TEXT_MAX}
          rows={3}
          error={errors.notes}
          hint="Texto general de la reserva. Para dejar constancia con tu nombre, agrega una observación."
          disabled={pending}
        />
        {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- reprogramar

/**
 * «Reprogramar» (PATCH /reservations/:id/reschedule): fecha futura y motivo opcional. Deja la reserva en
 * Reprogramada y agrega una entrada a su historial de cambios de fecha.
 */
export function RescheduleDialog({
  reservation,
  onClose,
  onSaved,
}: {
  reservation: Reservation;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}) {
  const { timeZone } = useRestaurant();
  const queryClient = useQueryClient();
  const now = useNow();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstField(formRef);
  const [when, setWhen] = useState<ZonedInputs>(() => isoToZonedInputs(reservation.reservationAt, timeZone));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors<RescheduleField>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: RescheduleReservationBody) => reservationsApi.reschedule(reservation.id, body),
    onSuccess: (updated) => {
      storeReservation(queryClient, updated, { stats: true });
      onSaved(updated);
      onClose();
    },
    onError: (error) => {
      const result = reservationFormErrors(error, RESCHEDULE_FIELDS);
      setErrors(result.fields);
      setFormError(result.form);
      if (shouldRefreshAfter(error)) void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
    },
  });
  const pending = mutation.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const result = validateReschedule(reservation, { when, reason }, timeZone, Date.now());
    if (result.errors) {
      setErrors(result.errors);
      setFormError(REVIEW_FIELDS);
      return;
    }
    setErrors({});
    setFormError(null);
    mutation.mutate(result.body);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      busy={pending}
      title={`Reprogramar reserva ${reservation.code}`}
      description={`Fecha actual: ${formatDayTime(reservation.reservationAt, timeZone)}. La reserva pasará a «Reprogramada» y el cambio quedará en su historial.`}
      footer={<DialogFooter formId={formId} pending={pending} submitLabel="Reprogramar" onClose={onClose} />}
    >
      <form ref={formRef} id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <DateTimeField
          label="Nueva fecha y hora"
          value={when}
          onChange={(value) => {
            setWhen(value);
            setErrors((prev) => ({ ...prev, reservationAt: undefined }));
          }}
          error={errors.reservationAt}
          hint={`Hora del restaurante (${timeZone}). Debe ser futura.`}
          minDay={dayKeyIn(now, timeZone)}
          required
          disabled={pending}
        />
        <TextAreaField
          label="Motivo (opcional)"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setErrors((prev) => ({ ...prev, reason: undefined }));
          }}
          maxLength={TEXT_MAX}
          rows={3}
          error={errors.reason}
          placeholder="Ej.: el cliente pidió cambiar el horario"
          disabled={pending}
        />
        {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
      </form>
    </Dialog>
  );
}
