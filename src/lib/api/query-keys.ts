/**
 * Claves de TanStack Query. Agrupadas por recurso para invalidar en bloque tras una mutación.
 * El detalle usa el segmento "detail" y cuelga del prefijo del recurso: invalidar el prefijo también lo invalida.
 * Mapa de invalidaciones: docs/frontend-api-completo.md (Parte 05, §2.3).
 */
export const qk = {
  me: ["me"] as const,
  config: ["restaurant-config"] as const,
  users: ["users"] as const,
  /** GET /users/:id. Cuelga de qk.users. */
  user: (id: string) => ["users", "detail", id] as const,
  categories: ["commercial-categories"] as const,
  /** GET /commercial-categories/:id. Cuelga de qk.categories. */
  category: (id: string) => ["commercial-categories", "detail", id] as const,
  items: (query: object) => ["commercial-items", query] as const,
  /** GET /commercial-items/:id. Cuelga de qk.itemsAll. */
  item: (id: string) => ["commercial-items", "detail", id] as const,
  itemsAll: ["commercial-items"] as const,
  customers: (query: object) => ["customers", "list", query] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  customersAll: ["customers"] as const,
  requests: (query: object) => ["reservation-requests", "list", query] as const,
  /** GET /reservation-requests/:id. Cuelga de qk.requestsAll. */
  request: (id: string) => ["reservation-requests", "detail", id] as const,
  requestsAll: ["reservation-requests"] as const,
  reservations: (query: object) => ["reservations", "list", query] as const,
  reservation: (id: string) => ["reservations", "detail", id] as const,
  reservationsAll: ["reservations"] as const,
  conversations: (query: object) => ["conversations", "list", query] as const,
  conversation: (id: string) => ["conversations", "detail", id] as const,
  messages: (id: string) => ["conversations", "messages", id] as const,
  /** Vista previa del último mensaje: cambia solo cuando cambia lastMessageAt. */
  lastMessage: (id: string, lastMessageAt: string | null) => ["conversations", "last-message", id, lastMessageAt] as const,
  /** GET /conversations/:id/assistant-drafts. Cuelga de qk.conversationsAll. */
  assistantDrafts: (conversationId: string) => ["conversations", "assistant-drafts", conversationId] as const,
  /** GET /conversations/:id/assistant-drafts/:draftId. Cuelga de qk.assistantDrafts(conversationId). */
  assistantDraft: (conversationId: string, draftId: string) =>
    ["conversations", "assistant-drafts", conversationId, draftId] as const,
  conversationsAll: ["conversations"] as const,
  stats: (period: string, anchor: string) => ["stats", period, anchor] as const,
  /** Prefijo de todas las consultas de Estadísticas (se calculan con reservas, solicitudes y conversaciones). */
  statsAll: ["stats"] as const,
};
