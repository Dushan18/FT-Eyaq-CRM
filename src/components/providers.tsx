"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/client";

function shouldRetry(failureCount: number, error: unknown): boolean {
  // Solo se reintentan fallas de conexión o del servidor; un 4xx no cambia reintentando.
  if (error instanceof ApiError && !error.isUnavailable && error.status < 500) return false;
  return failureCount < 2;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 15_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | undefined;

function getQueryClient() {
  // Un cliente por render en el servidor; uno solo en el navegador.
  if (typeof window === "undefined") return makeClient();
  browserClient ??= makeClient();
  return browserClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
