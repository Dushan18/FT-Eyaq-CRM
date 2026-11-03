import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoleCode } from "@/lib/auth/permissions";
import { AjustesShell } from "./ajustes-shell";

const state = vi.hoisted(() => ({ pathname: "/ajustes/empresa", roles: ["ADMIN"] as string[], status: "ready" }));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({ roles: state.roles as RoleCode[], status: state.status }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderShell() {
  return render(
    <AjustesShell>
      <p>contenido de la pestaña</p>
    </AjustesShell>,
  );
}

beforeEach(() => {
  state.pathname = "/ajustes/empresa";
  state.roles = ["ADMIN"];
  state.status = "ready";
});

describe("AjustesShell", () => {
  it("lista las seis pestañas para ADMIN y marca la activa", () => {
    state.pathname = "/ajustes/horarios";
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Secciones de Ajustes" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Empresa", "/ajustes/empresa"],
      ["Horarios", "/ajustes/horarios"],
      ["Servicios", "/ajustes/servicios"],
      ["Políticas", "/ajustes/politicas"],
      ["Samanta", "/ajustes/samanta"],
      ["Usuarios", "/ajustes/usuarios"],
    ]);
    expect(screen.getByRole("link", { name: "Horarios" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Empresa" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("contenido de la pestaña")).toBeInTheDocument();
  });

  it("oculta Usuarios a OWNER y, si abre su ruta, muestra NoAccess sin montar la pestaña", () => {
    state.roles = ["OWNER"];
    state.pathname = "/ajustes/usuarios";
    renderShell();
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(screen.getByText("Sin acceso a Usuarios")).toBeInTheDocument();
    expect(screen.queryByText("contenido de la pestaña")).toBeNull();
  });

  it("mientras carga la sesión monta la pestaña (el marco del CRM la oculta) y no muestra NoAccess", () => {
    state.roles = [];
    state.status = "loading";
    state.pathname = "/ajustes/usuarios";
    renderShell();
    expect(screen.getByText("contenido de la pestaña")).toBeInTheDocument();
    expect(screen.queryByText(/Sin acceso/)).toBeNull();
  });
});
