/** Solo acepta rutas internas ("/bandeja?c=1"); evita redirecciones abiertas a otros sitios. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.startsWith("/login") || value.startsWith("/api/")) return null;
  return value;
}
