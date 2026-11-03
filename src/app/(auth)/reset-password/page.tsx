import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Nueva contraseña · CRM Inteligente" };

/** Ruta del enlace que envía el backend: FRONTEND_RESET_PASSWORD_URL?token=<64 hex>. */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
