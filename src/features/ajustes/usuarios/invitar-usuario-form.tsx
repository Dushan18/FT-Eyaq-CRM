"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { usersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CreateUserRequest, RoleCode, User } from "@/lib/api/types";
import { Button } from "@/components/ui/primitives";
import { SelectField, TextField } from "@/components/ui/fields";
import { InlineNotice } from "@/components/ui/state";
import {
  EMAIL_MAX_LENGTH,
  EMPTY_USER_FORM,
  PASSWORD_MAX_LENGTH,
  PERSON_NAME_MAX_LENGTH,
  ROLE_OPTIONS,
  buildCreateUserBody,
  createUserErrorTarget,
  validateUserForm,
  type UserFormErrors,
  type UserFormValues,
} from "./usuarios-logic";

/** Alta de una cuenta con contraseña temporal (tarjeta en línea sobre la lista). */
export function InvitarUsuarioForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (user: User) => void }) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<UserFormValues>(EMPTY_USER_FORM);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: CreateUserRequest) => usersApi.create(body),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: qk.users });
      onCreated(user);
    },
    onError: (error) => {
      const target = createUserErrorTarget(error);
      if (target.field === "email") setErrors((prev) => ({ ...prev, email: target.message }));
      else setFormError(target.message);
    },
  });

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateUserForm(next));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    setSubmitted(true);
    setFormError(null);
    const found = validateUserForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(buildCreateUserBody(values));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-card p-5"
    >
      <div id={titleId} className="text-sm font-bold">
        Invitar usuario
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <TextField
          label="Nombre"
          value={values.firstName}
          onChange={(e) => update("firstName", e.target.value)}
          maxLength={PERSON_NAME_MAX_LENGTH}
          error={errors.firstName}
          autoComplete="off"
          autoFocus
        />
        <TextField
          label="Apellido"
          value={values.lastName}
          onChange={(e) => update("lastName", e.target.value)}
          maxLength={PERSON_NAME_MAX_LENGTH}
          error={errors.lastName}
          autoComplete="off"
        />
        <TextField
          label="Correo"
          type="email"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          maxLength={EMAIL_MAX_LENGTH}
          error={errors.email}
          autoComplete="off"
          spellCheck={false}
        />
        {/* Texto visible a propósito: el administrador debe poder revisar la contraseña que va a compartir. */}
        <TextField
          label="Contraseña temporal"
          value={values.password}
          onChange={(e) => update("password", e.target.value)}
          maxLength={PASSWORD_MAX_LENGTH}
          error={errors.password}
          hint="Entre 8 y 72 caracteres."
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <SelectField
          label="Rol"
          value={values.role}
          onChange={(e) => update("role", e.target.value as RoleCode)}
          error={errors.role}
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      </div>

      {formError ? <InlineNotice tone="error">No se pudo crear el usuario. {formError}</InlineNotice> : null}

      <div className="flex items-end justify-between gap-4">
        <p className="m-0 max-w-110 text-xs leading-[1.45] text-subtle">
          El backend aún no envía invitaciones por correo: comparte la contraseña temporal por un canal seguro y pide que
          la cambien con «¿Olvidaste tu contraseña?».
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="h-9 px-3.5" onClick={onCancel} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" className="h-9 px-4" disabled={create.isPending}>
            {create.isPending ? "Creando…" : "Crear usuario"}
          </Button>
        </div>
      </div>
    </form>
  );
}
