import { redirect } from "next/navigation";

/**
 * Esta página solo redirige y nunca llega a renderizar, así que la validación de navegación instantánea
 * (Cache Components, en desarrollo) no puede comprobarla y avisaba «Could not validate `instant`».
 */
export const instant = false;

/** /ajustes abre la primera pestaña. */
export default function AjustesPage() {
  redirect("/ajustes/empresa");
}
