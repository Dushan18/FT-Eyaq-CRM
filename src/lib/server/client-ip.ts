import "server-only";
import { isIP } from "node:net";

/**
 * IP del navegador según `X-Forwarded-For`, contando `trustedHops` proxies inversos de confianza desde
 * la derecha (cada proxy agrega a la derecha la IP de quien le habló). null si no se puede saber.
 *
 * Next.js solo rellena `X-Forwarded-For` con la IP de la conexión cuando la cabecera no viene: si el
 * servidor se expone sin proxy, el navegador puede escribirla. Por eso, sin proxies de confianza
 * (`trustedHops` = 0) no se usa.
 */
export function clientIp(headers: Headers, trustedHops: number): string | null {
  if (trustedHops < 1) return null;
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length === 0) return null;
  const candidate = chain[Math.max(0, chain.length - trustedHops)]!;
  return isIP(candidate) ? candidate : null;
}
