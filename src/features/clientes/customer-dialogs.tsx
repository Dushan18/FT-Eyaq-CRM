"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { CommercialItemSelect } from "@/components/forms/commercial-item-select";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Button, Tag } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";
import { ApiError } from "@/lib/api/client";
import { customersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import {
  CONTACT_CHANNELS,
  CUSTOMER_STATUSES,
  type ContactChannel,
  type CreateCustomerInterestRequest,
  type CreateCustomerRequest,
  type Customer,
  type CustomerDetail,
  type CustomerInterest,
  type CustomerStatus,
  type UpdateCustomerRequest,
} from "@/lib/api/types";
import { CHANNELS } from "@/lib/domain/channels";
import { itemName } from "@/lib/domain/conversation";
import { CUSTOMER_STATUS } from "@/lib/domain/statuses";
import { TONES } from "@/lib/domain/tones";
import { formatDate } from "@/lib/format/dates";
import { serverFormErrors } from "@/lib/forms/server-errors";
import { useRestaurant } from "@/lib/restaurant";
import { customerIdentity } from "./clientes-utils";
import {
  CUSTOMER_EMAIL_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  CUSTOMER_NOTES_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  EMPTY_CUSTOMER_FORM,
  INTEREST_NOTES_MAX_LENGTH,
  buildCreateCustomerBody,
  buildInterestBody,
  buildUpdateCustomerBody,
  changesCustomerSummary,
  customerFormValues,
  customerSaveErrors,
  isInternationalPhone,
  isProviderIdentityChannel,
  phoneCountryOptions,
  validateCustomerForm,
  type CustomerFormErrors,
  type CustomerFormValues,
} from "./customer-form-logic";

const linkButton = "cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-60";
const sectionTitle = "m-0 text-[13px] font-bold tracking-[.02em] text-ink";

/** Texto de una acción fallida (sin campos): conexión, negocio o validación. */
function actionError(error: unknown): string {
  return serverFormErrors(error, []).form ?? "Inténtalo de nuevo.";
}

// ---------------------------------------------------------------- campos de contacto

/** Por qué no se ofrece cambiar el canal al editar un cliente de Messenger o Instagram. */
const LOCKED_CHANNEL_HINT: Partial<Record<ContactChannel, string>> = {
  FACEBOOK: "El canal de un cliente de Facebook no se cambia: Messenger no lo permite.",
  INSTAGRAM: "El canal de un cliente de Instagram no se cambia: Instagram no lo permite.",
};

/** Alta manual con un canal de identidad del proveedor: el cliente no queda vinculado a esa cuenta. */
const MANUAL_IDENTITY_HINT: Partial<Record<ContactChannel, string>> = {
  FACEBOOK: "Un cliente creado a mano no queda vinculado a su cuenta de Messenger.",
  INSTAGRAM: "Un cliente creado a mano no queda vinculado a su cuenta de Instagram.",
};

/** Canal, nombre, teléfono con país, correo y notas: los mismos campos en el alta y en la edición. */
function ContactFields({
  values,
  errors,
  onChange,
  disabled,
  channelLocked = false,
  channelHint,
  phoneHint,
}: {
  values: CustomerFormValues;
  errors: CustomerFormErrors;
  onChange: (patch: Partial<CustomerFormValues>) => void;
  disabled?: boolean;
  /**
   * Clientes de Facebook e Instagram: el canal no se ofrece para cambiar (una identidad de Messenger o de
   * Instagram no lo admite). Se muestra el canal del formulario, que siempre es el guardado.
   */
  channelLocked?: boolean;
  channelHint?: ReactNode;
  phoneHint?: ReactNode;
}) {
  const international = isInternationalPhone(values.phone);
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {channelLocked ? (
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-slate">Canal de origen</span>
          <span className="flex h-10 items-center rounded-[10px] border border-field bg-surface px-3 text-[13.5px] text-muted">
            {values.sourceChannel ? CHANNELS[values.sourceChannel].label : "—"}
          </span>
          <span className={errors.sourceChannel ? "text-xs text-[#b42323]" : "text-xs text-subtle"} role={errors.sourceChannel ? "alert" : undefined}>
            {errors.sourceChannel ?? (values.sourceChannel ? LOCKED_CHANNEL_HINT[values.sourceChannel] : undefined)}
          </span>
        </div>
      ) : (
        <SelectField
          label="Canal de origen"
          wrapperClassName="col-span-2"
          value={values.sourceChannel}
          onChange={(e) => onChange({ sourceChannel: e.target.value as ContactChannel })}
          disabled={disabled}
          error={errors.sourceChannel}
          hint={channelHint}
          data-autofocus
        >
          {values.sourceChannel === "" ? <option value="">Elige un canal</option> : null}
          {CONTACT_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CHANNELS[channel].label}
            </option>
          ))}
        </SelectField>
      )}
      <TextField
        label="Nombre"
        value={values.firstName}
        onChange={(e) => onChange({ firstName: e.target.value })}
        maxLength={CUSTOMER_NAME_MAX_LENGTH}
        error={errors.firstName}
        disabled={disabled}
        autoComplete="off"
      />
      <TextField
        label="Apellido"
        value={values.lastName}
        onChange={(e) => onChange({ lastName: e.target.value })}
        maxLength={CUSTOMER_NAME_MAX_LENGTH}
        error={errors.lastName}
        disabled={disabled}
        autoComplete="off"
      />
      <SelectField
        label="País del teléfono"
        value={values.phoneCountry}
        onChange={(e) => onChange({ phoneCountry: e.target.value })}
        disabled={disabled || international}
        error={errors.phoneCountry}
        hint={international ? "Con «+» se usa el código del número." : undefined}
      >
        {phoneCountryOptions(values.phoneCountry).map((country) => (
          <option key={country.code} value={country.code}>
            {country.label}
          </option>
        ))}
        <option value="">Sin país (no se normaliza)</option>
      </SelectField>
      <TextField
        label="Teléfono"
        type="tel"
        inputMode="tel"
        value={values.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        maxLength={CUSTOMER_PHONE_MAX_LENGTH}
        error={errors.phone}
        hint={phoneHint ?? "Número nacional, o con «+» y el código del país."}
        disabled={disabled}
        autoComplete="off"
      />
      <TextField
        label="Correo"
        type="email"
        wrapperClassName="col-span-2"
        value={values.email}
        onChange={(e) => onChange({ email: e.target.value })}
        maxLength={CUSTOMER_EMAIL_MAX_LENGTH}
        error={errors.email}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      <TextAreaField
        label="Notas"
        wrapperClassName="col-span-2"
        rows={3}
        value={values.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        maxLength={CUSTOMER_NOTES_MAX_LENGTH}
        error={errors.notes}
        disabled={disabled}
      />
    </div>
  );
}

// ---------------------------------------------------------------- alta

/**
 * Alta manual de un cliente (POST /customers). Hace falta un correo o un teléfono normalizable; el backend
 * no crea conversación ni envía mensajes. Un teléfono o correo de otro cliente responde 409: se marca en el
 * campo y se ofrece buscar a ese cliente (`onFindExisting`).
 */
export function NewCustomerDialog({
  open,
  onClose,
  onCreated,
  onFindExisting,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  onFindExisting?: (term: string) => void;
}) {
  return open ? <NewCustomerDialogBody onClose={onClose} onCreated={onCreated} onFindExisting={onFindExisting} /> : null;
}

function NewCustomerDialogBody({
  onClose,
  onCreated,
  onFindExisting,
}: {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  onFindExisting?: (term: string) => void;
}) {
  const formId = useId();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CustomerFormValues>(EMPTY_CUSTOMER_FORM);
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: CreateCustomerRequest) => customersApi.create(body),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: qk.customersAll });
      onCreated(customer);
    },
    onError: (error, body) => {
      const found = customerSaveErrors(error, body);
      setErrors(found.fields);
      setFormError(found.form);
      setDuplicateOf(found.duplicateOf);
    },
  });

  function update(patch: Partial<CustomerFormValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    if (submitted) setErrors(validateCustomerForm(next));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    setSubmitted(true);
    setFormError(null);
    setDuplicateOf(null);
    const found = validateCustomerForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(buildCreateCustomerBody(values));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuevo cliente"
      description="Hace falta un correo o un teléfono. No se le envía ningún mensaje."
      busy={create.isPending}
      size="lg"
      footer={
        <>
          <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} className="h-9 px-4" disabled={create.isPending}>
            {create.isPending ? "Creando…" : "Crear cliente"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <ContactFields
          values={values}
          errors={errors}
          onChange={update}
          disabled={create.isPending}
          channelHint={values.sourceChannel ? MANUAL_IDENTITY_HINT[values.sourceChannel] : undefined}
        />
        {formError ? <InlineNotice tone="error">No se pudo crear el cliente. {formError}</InlineNotice> : null}
        {duplicateOf && onFindExisting ? (
          <InlineNotice tone="warning">
            No se fusionan clientes: usa el que ya existe.{" "}
            <button type="button" className={linkButton} onClick={() => onFindExisting(duplicateOf)}>
              Buscar ese cliente
            </button>
          </InlineNotice>
        ) : null}
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- edición

/**
 * Ficha editable del cliente: estado comercial (PATCH …/status), datos de contacto (PATCH /customers/:id,
 * solo lo que cambió) e intereses (POST y DELETE …/interests). Cada sección se guarda por separado.
 */
export function EditCustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  return customer ? <EditCustomerDialogBody key={customer.id} customer={customer} onClose={onClose} /> : null;
}

function EditCustomerDialogBody({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: qk.customer(customer.id), queryFn: () => customersApi.get(customer.id) });

  /** Lo guardado: base de la comparación para enviar solo los cambios. */
  const [base, setBase] = useState<Customer>(customer);
  const [savedStatus, setSavedStatus] = useState<CustomerStatus>(customer.status);

  const mergeDetail = (updated: Customer) =>
    queryClient.setQueryData<CustomerDetail>(qk.customer(customer.id), (old) => (old ? { ...old, ...updated } : old));
  const invalidate = (...keys: ReadonlyArray<readonly unknown[]>) => {
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  };

  const status = useMutation({
    mutationFn: (next: CustomerStatus) => customersApi.setStatus(customer.id, next),
    onSuccess: (updated) => {
      mergeDetail(updated);
      setSavedStatus(updated.status);
      invalidate(qk.customersAll);
    },
  });

  const contact = useContactForm(base, (updated, body) => {
    mergeDetail(updated);
    setBase(updated);
    invalidate(qk.customersAll);
    if (changesCustomerSummary(body)) invalidate(qk.conversationsAll, qk.requestsAll, qk.reservationsAll);
  });

  const interests = useInterestActions(customer.id, () => invalidate(qk.customersAll));

  const busy = status.isPending || contact.save.isPending || interests.busy;
  const identity = customerIdentity(base);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Editar cliente"
      description={`${identity.name} · ${CHANNELS[base.sourceChannel].label}`}
      busy={busy}
      size="lg"
      footer={
        <Button variant="outline" className="h-9 px-3.5" onClick={onClose} disabled={busy}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <SelectField
            label="Estado comercial"
            value={(status.isPending ? status.variables : undefined) ?? savedStatus}
            onChange={(e) => {
              const next = e.target.value as CustomerStatus;
              if (next !== savedStatus) status.mutate(next);
            }}
            disabled={status.isPending}
            hint={status.isPending ? "Guardando…" : "Se guarda al elegirlo. El CRM no lo cambia solo."}
            data-autofocus
          >
            {CUSTOMER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CUSTOMER_STATUS[value].label}
              </option>
            ))}
          </SelectField>
          {status.isError ? <InlineNotice tone="error">No se pudo cambiar el estado. {actionError(status.error)}</InlineNotice> : null}
        </section>

        <ContactSection base={base} form={contact} />

        <InterestsSection detail={detail} actions={interests} />
      </div>
    </Dialog>
  );
}

type ContactForm = ReturnType<typeof useContactForm>;

/** Estado del formulario de contacto y su guardado. */
function useContactForm(base: Customer, onSaved: (updated: Customer, body: UpdateCustomerRequest) => void) {
  const [values, setValues] = useState<CustomerFormValues>(() => customerFormValues(base));
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();
  // Messenger e Instagram: la identidad del proveedor no necesita teléfono ni correo; decide el backend.
  const skipContactRule = isProviderIdentityChannel(base.sourceChannel);

  const save = useMutation({
    mutationFn: (body: UpdateCustomerRequest) => customersApi.update(base.id, body),
    onSuccess: (updated, body) => {
      onSaved(updated, body);
      setValues(customerFormValues(updated));
      setErrors({});
      setSubmitted(false);
      setSaved(true);
    },
    onError: (error, body) => {
      const found = customerSaveErrors(error, body);
      setErrors(found.fields);
      setFormError(found.form);
      if (found.resetChannel) setValues((prev) => ({ ...prev, sourceChannel: base.sourceChannel }));
      // Conflicto o cliente modificado por otra persona: se relee la ficha.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: qk.customersAll });
      }
    },
  });

  const body = buildUpdateCustomerBody(base, values);
  const dirty = Object.keys(body).length > 0;

  function update(patch: Partial<CustomerFormValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    setSaved(false);
    if (submitted) setErrors(validateCustomerForm(next, { skipContactRule }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending || !dirty) return;
    setSubmitted(true);
    setFormError(null);
    setSaved(false);
    const found = validateCustomerForm(values, { skipContactRule });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(body);
  }

  return { values, errors, formError, saved, body, dirty, save, update, submit };
}

function ContactSection({ base, form }: { base: Customer; form: ContactForm }) {
  const titleId = useId();
  const whatsapp = base.sourceChannel === "WHATSAPP";
  const phoneChange = whatsapp && "phone" in form.body;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 id={titleId} className={sectionTitle}>
        Datos de contacto
      </h3>
      <form onSubmit={form.submit} noValidate aria-labelledby={titleId} className="flex flex-col gap-3.5">
        <ContactFields
          values={form.values}
          errors={form.errors}
          onChange={form.update}
          disabled={form.save.isPending}
          channelLocked={isProviderIdentityChannel(base.sourceChannel)}
          phoneHint={whatsapp ? "Es el número al que van las respuestas de WhatsApp." : undefined}
        />
        {phoneChange ? (
          <InlineNotice tone="warning">
            {form.body.phone === null
              ? "Sin teléfono no se le podrá responder por WhatsApp."
              : "Las respuestas de WhatsApp irán a este número, y no se le podrá escribir hasta que ese número envíe un mensaje. Si el número anterior vuelve a escribir, se registrará como otro cliente."}
          </InlineNotice>
        ) : null}
        {form.formError ? <InlineNotice tone="error">No se pudieron guardar los datos. {form.formError}</InlineNotice> : null}
        <div className="flex items-center justify-end gap-3">
          {form.saved && !form.dirty ? (
            <span role="status" className="text-[12.5px] font-semibold text-[#14753f]">
              Datos guardados
            </span>
          ) : null}
          <Button type="submit" className="h-9 px-4" disabled={!form.dirty || form.save.isPending}>
            {form.save.isPending ? "Guardando…" : "Guardar datos"}
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- intereses

type InterestActions = ReturnType<typeof useInterestActions>;

function useInterestActions(customerId: string, onChanged: () => void) {
  const add = useMutation({
    mutationFn: (body: CreateCustomerInterestRequest) => customersApi.addInterest(customerId, body),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: async (commercialItemId: string) => {
      try {
        await customersApi.removeInterest(customerId, commercialItemId);
      } catch (error) {
        // Otra persona ya lo quitó: el resultado es el mismo.
        if (error instanceof ApiError && error.isNotFound && error.messages[0]?.startsWith("Interés no encontrado")) return;
        throw error;
      }
    },
    onSettled: onChanged,
  });
  return { add, remove, busy: add.isPending || remove.isPending };
}

const UNAVAILABLE_TONE = TONES.grayMuted;

function InterestsSection({
  detail,
  actions,
}: {
  detail: { data: CustomerDetail | undefined; isError: boolean; refetch: () => unknown };
  actions: InterestActions;
}) {
  const titleId = useId();
  const { timeZone } = useRestaurant();
  const [itemId, setItemId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { add, remove } = actions;
  const rows: CustomerInterest[] = detail.data?.interests ?? [];
  const existing = itemId !== null && rows.some((i) => i.commercialItem.id === itemId);
  const addErrors = add.isError ? serverFormErrors(add.error, ["commercialItemId", "notes"] as const) : null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 id={titleId} className={sectionTitle}>
        Intereses
      </h3>

      {detail.data === undefined ? (
        detail.isError ? (
          <InlineNotice tone="error">
            No se pudieron cargar los intereses.{" "}
            <button type="button" className={linkButton} onClick={() => void detail.refetch()}>
              Reintentar
            </button>
          </InlineNotice>
        ) : (
          <p className="m-0 text-[12.5px] text-subtle">Cargando intereses…</p>
        )
      ) : rows.length === 0 ? (
        <p className="m-0 text-[12.5px] text-subtle">Sin intereses registrados.</p>
      ) : (
        <ul aria-label="Intereses registrados" className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.map((interest) => {
            const item = interest.commercialItem;
            const name = itemName(item);
            const removing = remove.isPending && remove.variables === item.id;
            return (
              <li key={interest.id} className="flex items-start gap-3 rounded-[10px] border border-line px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                    <span className="truncate">{name}</span>
                    {!item.isActive || item.approvalStatus !== "APPROVED" ? <Tag tone={UNAVAILABLE_TONE}>No disponible</Tag> : null}
                  </div>
                  <div className="text-xs text-muted">
                    Última consulta: {formatDate(interest.lastInterestedAt, timeZone)}
                    {interest.notes ? ` · ${interest.notes}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${linkButton} shrink-0 text-[12.5px]`}
                  disabled={remove.isPending}
                  aria-label={`Quitar el interés en ${name}`}
                  onClick={() => remove.mutate(item.id)}
                >
                  {removing ? "Quitando…" : "Quitar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {remove.isError ? <InlineNotice tone="error">No se pudo quitar el interés. {actionError(remove.error)}</InlineNotice> : null}

      <form
        noValidate
        aria-label="Registrar un interés"
        className="grid grid-cols-2 gap-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!itemId || add.isPending) return;
          add.mutate(buildInterestBody(itemId, note), {
            onSuccess: () => {
              setItemId(null);
              setNote("");
            },
          });
        }}
      >
        <CommercialItemSelect
          label="Servicio de interés"
          value={itemId}
          onChange={setItemId}
          disabled={add.isPending}
          error={addErrors?.fields.commercialItemId}
        />
        <TextField
          label="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={INTEREST_NOTES_MAX_LENGTH}
          disabled={add.isPending}
          error={addErrors?.fields.notes}
          hint={existing ? "Ya está registrado: se actualizará su fecha y, si escribes una, su nota." : undefined}
          autoComplete="off"
        />
        {addErrors?.form ? (
          <div className="col-span-2">
            <InlineNotice tone="error">No se pudo registrar el interés. {addErrors.form}</InlineNotice>
          </div>
        ) : null}
        <div className="col-span-2 flex justify-end">
          <Button type="submit" variant="soft" className="h-9 px-4" disabled={!itemId || add.isPending}>
            {add.isPending ? "Registrando…" : existing ? "Actualizar interés" : "Registrar interés"}
          </Button>
        </div>
      </form>
    </section>
  );
}
