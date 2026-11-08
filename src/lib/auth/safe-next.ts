/** Origen ficticio para resolver la ruta sin depender del navegador. */
const BASE = "http://crm.invalid";

/**
 * Solo acepta rutas internas ("/bandeja?c=1"); evita redirecciones abiertas a otros sitios.
 * El navegador quita tabuladores y saltos de línea y trata "\" como "/": "/\t/evil.com" termina en
 * "//evil.com" (otro sitio). Por eso se rechazan esos caracteres y se exige que la ruta resuelta siga
 * en el mismo origen. Devuelve la ruta ya normalizada.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith("/login") || path.startsWith("/api/")) return null;
  return path;
}
