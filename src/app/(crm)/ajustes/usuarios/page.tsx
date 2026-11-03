import { Suspense } from "react";
import type { Metadata } from "next";
import { UsuariosView } from "@/features/ajustes/usuarios/usuarios-view";

export const metadata: Metadata = { title: "Ajustes · Usuarios · CRM Inteligente" };

export default function AjustesUsuariosPage() {
  return (
    <Suspense fallback={null}>
      <UsuariosView />
    </Suspense>
  );
}
