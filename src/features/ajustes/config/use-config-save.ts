"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { configApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { PutRestaurantConfigRequest, RestaurantConfig } from "@/lib/api/types";
import { changedKeys, sameValue } from "./config-form";
import { toPutRequest } from "./config-request";

export type ConfigSaveVariables = (
  /** Aplica los cambios de una pestaña sobre la configuración vigente. */
  | { mode: "update"; apply: (current: PutRestaurantConfigRequest) => PutRestaurantConfigRequest }
  /** Primera configuración (el GET respondió 404). */
  | { mode: "create"; request: PutRestaurantConfigRequest }
) & {
  /** Se ejecuta al guardar, aunque la pestaña ya esté oculta porque el usuario navegó a otra. */
  onSaved?: (config: RestaurantConfig) => void;
};

/** Todas las pestañas comparten este scope: TanStack ejecuta sus guardados de a uno, en orden. */
export const CONFIG_SAVE_SCOPE = { id: "restaurant-config" } as const;

/**
 * Guardado de la configuración (solo ADMIN). El PUT reemplaza todo: antes de guardar se relee la
 * configuración para no pisar lo que otra persona cambió en otras pestañas, y la respuesta reemplaza
 * la caché `qk.config` (zona horaria y moneda de toda la app incluidas).
 *
 * Cada pestaña tiene su propio `useConfigSave()`. Sin el scope común, guardar Empresa y enseguida
 * Políticas podía leer la configuración antes del PUT de Empresa y reescribirla con valores viejos.
 */
export function useConfigSave() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: CONFIG_SAVE_SCOPE,
    mutationFn: async (variables: ConfigSaveVariables) => {
      if (variables.mode === "create") return configApi.put(variables.request);
      const current = await configApi.get();
      return configApi.put(variables.apply(toPutRequest(current)));
    },
    // En las opciones de la mutación (no en `mutate`) para que corra aunque la vista esté oculta.
    onSuccess: (config, variables) => {
      queryClient.setQueryData(qk.config, config);
      variables.onSaved?.(config);
    },
  });
}

export type ConfigSave = ReturnType<typeof useConfigSave>;

/**
 * Next.js oculta la ruta anterior con Activity en vez de desmontarla: al ocultar la pestaña se
 * limpian los avisos transitorios ("Cambios guardados", errores del servidor). El borrador se conserva.
 */
export function useResetOnHide(reset: () => void) {
  useLayoutEffect(() => () => reset(), [reset]);
}

/**
 * Borrador de una pestaña: guarda solo lo que el usuario tocó; el resto sigue a la configuración
 * vigente (si otra pestaña guarda, los campos no tocados se actualizan solos).
 */
export function useDraft<T extends object>(base: T, equals: (a: T[keyof T], b: T[keyof T]) => boolean = sameValue) {
  const [draft, setDraft] = useState<Partial<T>>({});
  const values = useMemo<T>(() => ({ ...base, ...draft }), [base, draft]);
  const changed = useMemo(() => changedKeys(base, draft, equals), [base, draft, equals]);
  const update = useCallback((patch: Partial<T>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);
  const reset = useCallback(() => setDraft({}), []);
  /**
   * Tras guardar, saca del borrador lo enviado para que esos campos vuelvan a seguir a la
   * configuración guardada. Lo que se escribió mientras se guardaba se conserva.
   */
  const commit = useCallback(
    (sent: Partial<T>) => {
      setDraft((current) => {
        const next: Partial<T> = { ...current };
        for (const key of Object.keys(sent) as Array<keyof T>) {
          if (key in next && equals(next[key] as T[keyof T], sent[key] as T[keyof T])) delete next[key];
        }
        return next;
      });
    },
    [equals],
  );
  return { values, changed, dirty: changed.length > 0, update, reset, commit };
}
