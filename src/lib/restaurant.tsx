"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { configApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { CurrencyCode, RestaurantConfig } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { DEFAULT_TIME_ZONE } from "@/lib/format/dates";

export interface RestaurantContext {
  config: RestaurantConfig | null;
  /** Zona en la que se muestran todas las fechas (configuración del restaurante). */
  timeZone: string;
  currency: CurrencyCode;
  /** El backend respondió 404: el restaurante aún no está configurado. */
  missing: boolean;
  isLoading: boolean;
  error: unknown;
}

/** Configuración global del restaurante (zona horaria y moneda incluidas). */
export function useRestaurant(): RestaurantContext {
  const session = useSession();
  const enabled = session.status === "ready" && session.canView("ajustes");
  const query = useQuery({
    queryKey: qk.config,
    queryFn: configApi.get,
    staleTime: 5 * 60_000,
    enabled,
    retry: (count, error) => !(error instanceof ApiError && error.isNotFound) && count < 2,
  });
  const missing = query.error instanceof ApiError && query.error.isNotFound;
  return {
    config: query.data ?? null,
    timeZone: query.data?.timeZone ?? DEFAULT_TIME_ZONE,
    currency: query.data?.currency ?? "PEN",
    missing,
    isLoading: query.isLoading,
    error: missing ? null : query.error,
  };
}
