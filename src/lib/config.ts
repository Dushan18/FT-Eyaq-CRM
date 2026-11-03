/** Configuración pública (navegador). Solo valores no sensibles con prefijo NEXT_PUBLIC_. */

function readMs(value: string | undefined, fallback: number, min: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/**
 * bk-crm aún no tiene WebSockets ni SSE: la Bandeja se actualiza por sondeo. Las consultas se
 * pausan solas cuando la pestaña no está visible o la vista está oculta.
 */
export const INBOX_POLL_MS = readMs(process.env.NEXT_PUBLIC_INBOX_POLL_MS, 6000, 2000);
export const CHAT_POLL_MS = readMs(process.env.NEXT_PUBLIC_CHAT_POLL_MS, 4000, 1500);
