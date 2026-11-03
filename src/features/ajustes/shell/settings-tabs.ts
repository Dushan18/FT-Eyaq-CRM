import { canViewSettingsTab, type RoleCode, type SettingsTab } from "@/lib/auth/permissions";

export interface SettingsTabLink {
  key: SettingsTab;
  label: string;
  href: string;
}

/** Pestañas de Ajustes en el orden del mockup. */
export const SETTINGS_TABS: readonly SettingsTabLink[] = [
  { key: "empresa", label: "Empresa", href: "/ajustes/empresa" },
  { key: "horarios", label: "Horarios", href: "/ajustes/horarios" },
  { key: "servicios", label: "Servicios", href: "/ajustes/servicios" },
  { key: "politicas", label: "Políticas", href: "/ajustes/politicas" },
  { key: "samanta", label: "Samanta", href: "/ajustes/samanta" },
  { key: "usuarios", label: "Usuarios", href: "/ajustes/usuarios" },
];

export function settingsTabLink(key: SettingsTab): SettingsTabLink {
  return SETTINGS_TABS.find((tab) => tab.key === key) ?? SETTINGS_TABS[0]!;
}

/** Pestaña de una ruta ("/ajustes/horarios" → "horarios"); null en "/ajustes" o fuera de Ajustes. */
export function settingsTabFromPath(pathname: string): SettingsTab | null {
  const [section, segment] = pathname.split("/").filter(Boolean);
  if (section !== "ajustes" || !segment) return null;
  return SETTINGS_TABS.find((tab) => tab.key === segment)?.key ?? null;
}

/** Pestañas que el rol puede abrir (Usuarios solo ADMIN; SUPPORT ninguna). */
export function visibleSettingsTabs(roles: readonly RoleCode[]): SettingsTabLink[] {
  return SETTINGS_TABS.filter((tab) => canViewSettingsTab(roles, tab.key));
}
