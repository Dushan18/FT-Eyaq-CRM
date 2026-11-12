import { redirect } from "next/navigation";

/** Solo redirige: fuera de la validación de navegación instantánea, que no puede renderizarla (ver /ajustes). */
export const instant = false;

/** La entrada lleva a la Bandeja; si el rol no la tiene, el marco redirige a su primera vista. */
export default function Home() {
  redirect("/bandeja");
}
