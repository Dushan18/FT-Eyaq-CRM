import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configApi } from "@/lib/api/endpoints";
import type { RestaurantConfig } from "@/lib/api/types";
import { makeConfig } from "./config-fixtures";
import { useConfigSave } from "./use-config-save";

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return Wrapper;
}

describe("guardado de la configuración desde varias pestañas", () => {
  it("guarda de a uno: el segundo guardado relee la configuración después del primer PUT", async () => {
    let stored: RestaurantConfig = makeConfig();
    const calls: string[] = [];
    vi.spyOn(configApi, "get").mockImplementation(async () => {
      calls.push("get");
      return stored;
    });
    vi.spyOn(configApi, "put").mockImplementation(async (body) => {
      calls.push("put");
      // El PUT tarda: sin orden, el GET de la otra pestaña llegaría antes y leería la versión vieja.
      await new Promise((resolve) => setTimeout(resolve, 20));
      stored = { ...stored, ...body };
      return stored;
    });

    // Dos pestañas (Empresa y Políticas), cada una con su propio hook.
    const { result } = renderHook(() => ({ empresa: useConfigSave(), politicas: useConfigSave() }), { wrapper: wrapper() });

    await act(async () => {
      await Promise.all([
        result.current.empresa.mutateAsync({ mode: "update", apply: (c) => ({ ...c, businessName: "Sabor Mágico Grill & Bar" }) }),
        result.current.politicas.mutateAsync({ mode: "update", apply: (c) => ({ ...c, cancellationPolicy: "Hasta 2 h antes." }) }),
      ]);
    });

    expect(calls).toEqual(["get", "put", "get", "put"]);
    expect(stored.businessName).toBe("Sabor Mágico Grill & Bar");
    expect(stored.cancellationPolicy).toBe("Hasta 2 h antes.");
  });
});
