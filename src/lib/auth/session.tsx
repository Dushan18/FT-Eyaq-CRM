"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { ApiError, SESSION_EXPIRED_EVENT } from "@/lib/api/client";
import { sessionApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { MeResponse } from "@/lib/api/types";
import { can, canView, type Action, type RoleCode, type ViewKey } from "./permissions";

interface SessionValue {
  user: MeResponse | null;
  roles: RoleCode[];
  status: "loading" | "ready" | "error";
  error: unknown;
  retry: () => void;
  can: (action: Action) => boolean;
  canView: (view: ViewKey) => boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Sesión del usuario. Los roles salen de GET /auth/me (el backend los relee de la base en cada
 * petición), no del token. Si el backend responde 401, se lleva al usuario al inicio de sesión.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const me = useQuery({
    queryKey: qk.me,
    queryFn: ({ signal }) => sessionApi.me(signal),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const goToLogin = useCallback(
    (reason: string) => {
      queryClient.clear();
      const next = pathname && pathname !== "/" ? `&next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login?motivo=${reason}${next}`);
    },
    [pathname, queryClient, router],
  );

  useEffect(() => {
    const onExpired = () => goToLogin("sesion");
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [goToLogin]);

  const logout = useCallback(async () => {
    try {
      await sessionApi.logout();
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  }, [queryClient, router]);

  const value = useMemo<SessionValue>(() => {
    const user = me.data ?? null;
    const roles = user?.roles ?? [];
    const failed = me.isError && !(me.error instanceof ApiError && me.error.isSessionExpired);
    return {
      user,
      roles,
      status: user ? "ready" : failed ? "error" : "loading",
      error: me.error,
      retry: () => void me.refetch(),
      can: (action) => can(roles, action),
      canView: (view) => canView(roles, view),
      logout,
    };
  }, [me, logout]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession debe usarse dentro de SessionProvider");
  return value;
}
