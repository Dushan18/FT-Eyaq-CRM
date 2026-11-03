/** Claves de TanStack Query. Agrupadas por recurso para invalidar en bloque tras una mutación. */
export const qk = {
  me: ["me"] as const,
  config: ["restaurant-config"] as const,
  users: ["users"] as const,
  categories: ["commercial-categories"] as const,
  items: (query: object) => ["commercial-items", query] as const,
  itemsAll: ["commercial-items"] as const,
  customers: (query: object) => ["customers", "list", query] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  customersAll: ["customers"] as const,
  requests: (query: object) => ["reservation-requests", "list", query] as const,
  requestsAll: ["reservation-requests"] as const,
  reservations: (query: object) => ["reservations", "list", query] as const,
  reservation: (id: string) => ["reservations", "detail", id] as const,
  reservationsAll: ["reservations"] as const,
  conversations: (query: object) => ["conversations", "list", query] as const,
  conversation: (id: string) => ["conversations", "detail", id] as const,
  messages: (id: string) => ["conversations", "messages", id] as const,
  /** Vista previa del último mensaje: cambia solo cuando cambia lastMessageAt. */
  lastMessage: (id: string, lastMessageAt: string | null) => ["conversations", "last-message", id, lastMessageAt] as const,
  conversationsAll: ["conversations"] as const,
  stats: (period: string, anchor: string) => ["stats", period, anchor] as const,
};
