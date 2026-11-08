"use client";

import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { usersApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { User } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { TONES } from "@/lib/domain/tones";
import { formatDayTime } from "@/lib/format/dates";
import { personName } from "@/lib/format/text";
import { useNow } from "@/lib/hooks/use-now";
import { useRestaurant } from "@/lib/restaurant";
import { Button, Pill, Toggle } from "@/components/ui/primitives";
import { EmptyState, ErrorState, InlineNotice, LoadingState, NoAccess } from "@/components/ui/state";
import { InvitarUsuarioForm } from "./invitar-usuario-form";
import { actionErrorText, lastAccessText, roleSummary, sortUsers } from "./usuarios-logic";

const COLUMNS = "grid-cols-[minmax(0,1fr)_170px_140px_40px]";
const STATUS_MUTATION = ["users", "status"] as const;

type Notice = { tone: "info" | "error"; text: string };

interface StatusVars {
  user: User;
  isActive: boolean;
}

/** Usuarios y roles: solo ADMIN (todas las rutas /users son de administrador). */
export function UsuariosView() {
  const session = useSession();
  // Mientras carga la sesión el marco muestra su propio estado de carga.
  if (session.status !== "ready") return null;
  if (!session.can("users.manage")) return <NoAccess view="Usuarios" />;
  return <UsuariosContent currentUserId={session.user?.id ?? null} />;
}

function UsuariosContent({ currentUserId }: { currentUserId: string | null }) {
  const queryClient = useQueryClient();
  const { timeZone } = useRestaurant();
  const now = useNow();
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const users = useQuery({ queryKey: qk.users, queryFn: usersApi.list });
  const rows = useMemo(() => (users.data ? sortUsers(users.data) : null), [users.data]);

  const patchUser = (id: string, isActive: boolean) =>
    queryClient.setQueryData<User[]>(qk.users, (old) => old?.map((u) => (u.id === id ? { ...u, isActive } : u)));

  const setActive = useMutation({
    mutationKey: STATUS_MUTATION,
    mutationFn: ({ user, isActive }: StatusVars) => usersApi.setActive(user.id, isActive),
    onMutate: async ({ user, isActive }) => {
      setNotice(null);
      await queryClient.cancelQueries({ queryKey: qk.users });
      patchUser(user.id, isActive);
    },
    onError: (error, { user, isActive }) => {
      // Incluye el 409 "No se puede desactivar al último administrador activo": se revierte el interruptor.
      patchUser(user.id, !isActive);
      const name = personName(user.firstName, user.lastName);
      setNotice({ tone: "error", text: `No se pudo ${isActive ? "activar" : "desactivar"} a ${name}. ${actionErrorText(error)}` });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<User[]>(qk.users, (old) => old?.map((u) => (u.id === updated.id ? updated : u)));
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: STATUS_MUTATION }) === 1) {
        void queryClient.invalidateQueries({ queryKey: qk.users });
      }
    },
  });

  const pendingIds = useMutationState({
    filters: { mutationKey: STATUS_MUTATION, status: "pending" },
    select: (m) => (m.state.variables as StatusVars | undefined)?.user.id,
  });

  function toggle(user: User, isActive: boolean) {
    if (pendingIds.includes(user.id)) return;
    // Desactivar la propia cuenta cierra la sesión de inmediato (el backend revoca todas sus sesiones).
    if (
      !isActive &&
      user.id === currentUserId &&
      !window.confirm("Vas a desactivar tu propia cuenta: tu sesión se cerrará y no podrás volver a entrar. ¿Continuar?")
    ) {
      return;
    }
    setActive.mutate({ user, isActive });
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="m-0 text-[17px] font-bold">Usuarios y roles</h2>
        <Button
          className="h-9 px-3.5"
          aria-expanded={formOpen}
          disabled={formOpen}
          onClick={() => {
            setNotice(null);
            setFormOpen(true);
          }}
        >
          Invitar usuario
        </Button>
      </div>

      {notice ? (
        <InlineNotice tone={notice.tone}>
          <span className="flex items-start justify-between gap-3">
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Cerrar aviso"
              className="-my-0.5 shrink-0 cursor-pointer rounded px-1 text-[15px] leading-none opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </span>
        </InlineNotice>
      ) : null}

      {formOpen ? (
        <InvitarUsuarioForm
          onCancel={() => setFormOpen(false)}
          onCreated={(user) => {
            setFormOpen(false);
            setNotice({
              tone: "info",
              text: `Se creó la cuenta de ${personName(user.firstName, user.lastName)} (${user.email}).`,
            });
          }}
        />
      ) : null}

      {rows && users.isError ? (
        <InlineNotice tone="warning">
          No se pudo actualizar la lista; se muestran los últimos datos cargados.{" "}
          <button type="button" onClick={() => void users.refetch()} className="cursor-pointer font-semibold underline">
            Reintentar
          </button>
        </InlineNotice>
      ) : null}

      {/* En pantallas estrechas la tabla se desplaza en horizontal dentro del recuadro. */}
      <div className="relative overflow-x-auto rounded-[14px] border border-card" role="table" aria-label="Usuarios y roles">
        <div role="row" className="sr-only">
          <span role="columnheader">Usuario</span>
          <span role="columnheader">Rol</span>
          <span role="columnheader">Último acceso</span>
          <span role="columnheader">Activo</span>
        </div>
        {!rows ? (
          users.isError ? (
            <ErrorState error={users.error} subject="la lista de usuarios" onRetry={() => void users.refetch()} />
          ) : (
            <LoadingState label="Cargando usuarios…" />
          )
        ) : rows.length === 0 ? (
          <EmptyState>Aún no hay usuarios registrados.</EmptyState>
        ) : (
          rows.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              now={now}
              timeZone={timeZone}
              onToggle={(next) => toggle(user, next)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  now,
  timeZone,
  onToggle,
}: {
  user: User;
  isSelf: boolean;
  now: number;
  timeZone: string;
  onToggle: (isActive: boolean) => void;
}) {
  const name = personName(user.firstName, user.lastName);
  const role = roleSummary(user.roles);

  return (
    <div role="row" className={`grid min-w-144 ${COLUMNS} items-center gap-3.5 border-b border-line-2 px-4 py-3`}>
      <span role="cell" className="flex min-w-0 flex-col">
        <span className="truncate text-[13.5px] font-semibold" title={name}>
          {name}
          {isSelf ? <span className="font-medium text-subtle"> (tú)</span> : null}
        </span>
        <span className="truncate text-xs text-subtle" title={user.email}>
          {user.email}
        </span>
      </span>
      <span role="cell" className="flex min-w-0" title={role.title}>
        <Pill tone={role.main ? TONES.blue : TONES.gray}>
          {role.label}
          {role.extra > 0 ? ` +${role.extra}` : null}
        </Pill>
      </span>
      <span
        role="cell"
        className="text-[12.5px] text-muted"
        title={user.lastLoginAt ? `Último acceso: ${formatDayTime(user.lastLoginAt, timeZone)}` : "Aún no inicia sesión"}
      >
        {lastAccessText(user.lastLoginAt, now, timeZone)}
      </span>
      <span role="cell" className="flex">
        <Toggle checked={user.isActive} onChange={onToggle} label={`Usuario activo: ${name}`} />
      </span>
    </div>
  );
}
