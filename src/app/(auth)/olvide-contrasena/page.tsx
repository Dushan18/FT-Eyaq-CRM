"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { sessionApi } from "@/lib/api/endpoints";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { InlineNotice } from "@/components/ui/state";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await sessionApi.forgotPassword(email.trim());
      setSent(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el enlace.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="m-0 text-xl font-bold">Recuperar contraseña</h1>
        <p className="m-0 mt-1 text-[13px] text-muted">Te enviaremos un enlace de un solo uso a tu correo.</p>
      </div>
      {sent ? (
        <InlineNotice>{sent}</InlineNotice>
      ) : (
        <>
          <TextField label="Correo" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
          <Button type="submit" disabled={pending || !email.trim()} className="h-11 text-sm">
            {pending ? "Enviando…" : "Enviar enlace"}
          </Button>
        </>
      )}
      <Link href="/login" className="text-center text-[13px] font-semibold no-underline">
        Volver a iniciar sesión
      </Link>
    </form>
  );
}
