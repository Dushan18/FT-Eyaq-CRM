"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { sessionApi } from "@/lib/api/endpoints";
import { homePathFor } from "@/lib/auth/permissions";
import { safeNextPath } from "@/lib/auth/safe-next";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reason = params.get("motivo");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 8) {
      setError("Ingresa tu correo y una contraseña de al menos 8 caracteres.");
      return;
    }
    setPending(true);
    try {
      const { user } = await sessionApi.login(email.trim(), password);
      // El QueryClient del navegador sobrevive al cambio de cuenta sin recargar: se vacía para no mostrar
      // datos del usuario anterior (qk.me incluido).
      queryClient.clear();
      const target = safeNextPath(params.get("next")) ?? homePathFor(user.roles) ?? "/bandeja";
      router.replace(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="m-0 text-xl font-bold">Iniciar sesión</h1>
        <p className="m-0 mt-1 text-[13px] text-muted">Ingresa con tu cuenta del CRM.</p>
      </div>
      {reason === "sesion" ? <InlineNotice tone="warning">Tu sesión terminó. Vuelve a iniciar sesión.</InlineNotice> : null}
      {reason === "restablecida" ? (
        <InlineNotice>Contraseña actualizada. Inicia sesión con tu nueva contraseña.</InlineNotice>
      ) : null}
      <TextField
        label="Correo"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextField
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      <Button type="submit" disabled={pending} className="h-11 text-sm">
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
      <Link href="/olvide-contrasena" className="text-center text-[13px] font-semibold no-underline">
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
