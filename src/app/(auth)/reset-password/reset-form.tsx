"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { sessionApi } from "@/lib/api/endpoints";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const validToken = /^[a-f0-9]{64}$/i.test(token);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8 || password.length > 72) {
      setError("La contraseña debe tener entre 8 y 72 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    try {
      await sessionApi.resetPassword(token, password);
      router.replace("/login?motivo=restablecida");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la contraseña.");
      setPending(false);
    }
  }

  if (!validToken) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="m-0 text-xl font-bold">Enlace no válido</h1>
        <InlineNotice tone="error">El enlace de recuperación está incompleto o no es válido. Solicita uno nuevo.</InlineNotice>
        <Link href="/olvide-contrasena" className="text-center text-[13px] font-semibold no-underline">
          Solicitar un nuevo enlace
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="m-0 text-xl font-bold">Nueva contraseña</h1>
        <p className="m-0 mt-1 text-[13px] text-muted">Al cambiarla se cerrarán tus sesiones abiertas.</p>
      </div>
      <TextField
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="Entre 8 y 72 caracteres."
      />
      <TextField label="Repite la contraseña" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      <Button type="submit" disabled={pending} className="h-11 text-sm">
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
