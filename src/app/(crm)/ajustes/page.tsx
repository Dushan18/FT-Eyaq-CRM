import { redirect } from "next/navigation";

/** /ajustes abre la primera pestaña. */
export default function AjustesPage() {
  redirect("/ajustes/empresa");
}
