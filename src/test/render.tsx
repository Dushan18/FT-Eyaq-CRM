import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/** Render con un QueryClient aislado y sin reintentos (para pruebas de componentes). */
export function renderWithQuery(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
