/**
 * Permisos por vista y por acción.
 *
 * El backend (bk-crm) es la autoridad: aplica RBAC en cada endpoint. Esta matriz solo decide qué
 * muestra la interfaz y replica la matriz real de los controllers (docs/sprint-2-closure.md §16 y
 * contratos en docs/backend). Si el backend cambia un permiso, actualiza aquí la misma regla.
 */

export const ROLE_CODES = ["ADMIN", "OWNER", "OPERATOR", "SUPPORT"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: "Administrador",
  OWNER: "Propietario",
  OPERATOR: "Operador",
  SUPPORT: "Soporte EYAQ",
};

/** Orden de precedencia para mostrar un solo rol cuando el usuario tiene varios. */
const ROLE_PRIORITY: RoleCode[] = ["ADMIN", "OWNER", "OPERATOR", "SUPPORT"];

export function primaryRole(roles: readonly RoleCode[]): RoleCode | null {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
}

export type ViewKey = "bandeja" | "solicitudes" | "calendario" | "estadisticas" | "clientes" | "ajustes";

export type SettingsTab = "empresa" | "horarios" | "servicios" | "politicas" | "samanta" | "usuarios";

/** Acciones de escritura que la interfaz habilita o deshabilita. */
export type Action =
  // Bandeja (PATCH /conversations/:id/read|assistant|assignee, POST /conversations/:id/messages)
  | "conversation.read"
  | "conversation.pause"
  | "conversation.assign"
  | "conversation.send"
  // Borradores de Samanta: generar, editar, aprobar y rechazar (/conversations/:id/assistant-drafts)
  | "draft.review"
  // Solicitudes: crear y editar (POST, PATCH /reservation-requests) y cancelar (PATCH …/status)
  | "request.edit"
  | "request.cancel"
  // Calendario: crear (POST /reservations, solo ADMIN); editar, responsable, notas y reprogramar; estado
  | "reservation.create"
  | "reservation.edit"
  | "reservation.status"
  // Clientes: crear, editar, estado e intereses (POST, PATCH /customers, …/status, …/interests)
  | "customer.edit"
  // Ajustes (PUT /restaurant-config, catálogo, usuarios)
  | "config.edit"
  | "catalog.edit"
  | "users.manage";

const READ_CORE: RoleCode[] = ["ADMIN", "OWNER", "OPERATOR"];
const WRITE_CORE: RoleCode[] = ["ADMIN", "OPERATOR"];

/** Vistas: GET de sus datos permitido para estos roles (SUPPORT recibe 403 en todos ellos). */
export const VIEW_ROLES: Record<ViewKey, RoleCode[]> = {
  bandeja: READ_CORE,
  solicitudes: READ_CORE,
  calendario: READ_CORE,
  estadisticas: READ_CORE,
  clientes: READ_CORE,
  ajustes: READ_CORE,
};

export const SETTINGS_TAB_ROLES: Record<SettingsTab, RoleCode[]> = {
  empresa: READ_CORE,
  horarios: READ_CORE,
  servicios: READ_CORE,
  politicas: READ_CORE,
  samanta: READ_CORE,
  usuarios: ["ADMIN"],
};

export const ACTION_ROLES: Record<Action, RoleCode[]> = {
  "conversation.read": WRITE_CORE,
  "conversation.pause": WRITE_CORE,
  "conversation.assign": WRITE_CORE,
  "conversation.send": WRITE_CORE,
  "draft.review": WRITE_CORE,
  "request.edit": WRITE_CORE,
  "request.cancel": WRITE_CORE,
  "reservation.create": ["ADMIN"],
  "reservation.edit": WRITE_CORE,
  "reservation.status": WRITE_CORE,
  "customer.edit": WRITE_CORE,
  "config.edit": ["ADMIN"],
  "catalog.edit": ["ADMIN"],
  "users.manage": ["ADMIN"],
};

function anyRole(roles: readonly RoleCode[], allowed: readonly RoleCode[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

export function canView(roles: readonly RoleCode[], view: ViewKey): boolean {
  return anyRole(roles, VIEW_ROLES[view]);
}

export function canViewSettingsTab(roles: readonly RoleCode[], tab: SettingsTab): boolean {
  return anyRole(roles, SETTINGS_TAB_ROLES[tab]);
}

export function can(roles: readonly RoleCode[], action: Action): boolean {
  return anyRole(roles, ACTION_ROLES[action]);
}

export const VIEW_ORDER: ViewKey[] = ["bandeja", "solicitudes", "calendario", "estadisticas", "clientes", "ajustes"];

export const VIEW_PATHS: Record<ViewKey, string> = {
  bandeja: "/bandeja",
  solicitudes: "/solicitudes",
  calendario: "/calendario",
  estadisticas: "/estadisticas",
  clientes: "/clientes",
  ajustes: "/ajustes",
};

export const VIEW_LABELS: Record<ViewKey, string> = {
  bandeja: "Bandeja",
  solicitudes: "Solicitudes",
  calendario: "Calendario",
  estadisticas: "Estadísticas",
  clientes: "Clientes",
  ajustes: "Ajustes",
};

/** Primera vista permitida para el rol (destino tras iniciar sesión). */
export function homePathFor(roles: readonly RoleCode[]): string | null {
  const view = VIEW_ORDER.find((v) => canView(roles, v));
  return view ? VIEW_PATHS[view] : null;
}

/** Vista a la que pertenece una ruta ("/ajustes/usuarios" → "ajustes"). */
export function viewFromPath(pathname: string): ViewKey | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  return (VIEW_ORDER as string[]).includes(segment ?? "") ? (segment as ViewKey) : null;
}
