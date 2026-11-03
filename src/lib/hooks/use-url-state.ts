"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Estado sincronizado con la query de la URL (pestañas, filtros, selección) para que cada vista
 * se pueda enlazar y recargar sin perder contexto. Los valores por defecto no se escriben en la URL.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = useCallback((key: string) => params.get(key), [params]);

  const set = useCallback(
    (updates: Record<string, string | null | undefined>, mode: "replace" | "push" = "replace") => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );

  return { get, set };
}

/** Lee un valor de una lista cerrada; si no es válido devuelve el valor por defecto. */
export function pickOption<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return value && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}
