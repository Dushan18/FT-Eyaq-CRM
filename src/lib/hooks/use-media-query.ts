"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Anchos de Tailwind (v4, en rem) que cambian la disposición del CRM:
 * - md: menú lateral en vez de barra inferior.
 * - lg: Bandeja con lista y chat a la vez.
 * - xl: tercera columna (ficha del cliente en la Bandeja, detalle de la reserva en el Calendario).
 */
export const BREAKPOINTS = {
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
  xl: "(min-width: 80rem)",
} as const;

/**
 * true si la ventana cumple la media query. En el servidor y durante la hidratación es false (la vista
 * estrecha); el valor real llega en el render siguiente, sin desajuste de hidratación.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
