import { redirect } from "next/navigation";

/** La entrada lleva a la Bandeja; si el rol no la tiene, el marco redirige a su primera vista. */
export default function Home() {
  redirect("/bandeja");
}
