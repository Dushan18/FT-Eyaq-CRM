/**
 * Proyecciones del estado en memoria a las mismas formas de respuesta que bk-crm.
 * Los datos internos del simulador (contraseña, PSID de Messenger, historiales) nunca salen de aquí.
 */
import type {
  CommercialCategory,
  CommercialItem,
  Conversation,
  Customer,
  CustomerDetail,
  CustomerInterest,
  ReservationDetail,
  ReservationRequest,
  Reservation,
  User,
} from "@/lib/api/types";
import { isEligibleAssignee } from "./http";
import type { MockConversation, MockCustomer, MockRequest, MockReservation, MockStore, MockUser } from "./store";

export function publicUser(u: MockUser): User {
  const { password: _password, ...rest } = u;
  void _password;
  return rest;
}

export function customerSummary(c: MockCustomer) {
  return { id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email };
}

export function itemSummary(i: CommercialItem | undefined) {
  return i ? { id: i.id, nameEs: i.nameEs, nameEn: i.nameEn, type: i.type, isActive: i.isActive, approvalStatus: i.approvalStatus } : null;
}

export function categorySummary(c: CommercialCategory): CommercialItem["category"] {
  return { id: c.id, nameEs: c.nameEs, nameEn: c.nameEn, isActive: c.isActive, displayOrder: c.displayOrder };
}

export function assigneeEmbed(store: MockStore, id: string | null) {
  if (!id) return null;
  const u = store.users.find((x) => x.id === id);
  return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, isActive: u.isActive, isEligible: isEligibleAssignee(u) } : null;
}

export function findCustomer(store: MockStore, id: string) {
  return store.customers.find((c) => c.id === id)!;
}

export function conversationOut(store: MockStore, conv: MockConversation): Conversation {
  const unreadCount = store.messages.filter((m) => m.conversationId === conv.id && m.direction === "INBOUND" && m.readAt === null).length;
  return { ...conv, customer: customerSummary(findCustomer(store, conv.customerId)), assignedUser: assigneeEmbed(store, conv.assignedUserId), unreadCount };
}

export function requestOut(store: MockStore, r: MockRequest): ReservationRequest {
  return {
    ...r,
    customer: customerSummary(findCustomer(store, r.customerId)),
    commercialItem: itemSummary(store.items.find((i) => i.id === r.commercialItemId)),
  };
}

export function reservationOut(store: MockStore, r: MockReservation): Reservation {
  const { noteHistory: _n, rescheduleHistory: _h, ...base } = r;
  void _n;
  void _h;
  return {
    ...base,
    assignedUser: assigneeEmbed(store, r.assignedUserId),
    customer: customerSummary(findCustomer(store, r.customerId)),
    commercialItem: itemSummary(store.items.find((i) => i.id === r.commercialItemId)),
  };
}

export function author(store: MockStore, id: string) {
  const u = store.users.find((x) => x.id === id);
  return { id, firstName: u?.firstName ?? "", lastName: u?.lastName ?? "" };
}

export function reservationDetailOut(store: MockStore, r: MockReservation): ReservationDetail {
  return {
    ...reservationOut(store, r),
    noteHistory: r.noteHistory.map((n) => ({ ...n, author: author(store, n.authorUserId) })),
    rescheduleHistory: r.rescheduleHistory.map((h) => ({ ...h, changedBy: author(store, h.changedByUserId) })),
  };
}

export function customerOut(c: MockCustomer): Customer {
  const { interests: _i, messengerPsid: _p, ...base } = c;
  void _i;
  void _p;
  return base;
}

export function interestOut(store: MockStore, i: MockCustomer["interests"][number]): CustomerInterest {
  const { commercialItemId, ...rest } = i;
  return { ...rest, commercialItem: itemSummary(store.items.find((x) => x.id === commercialItemId))! };
}

export function customerDetailOut(store: MockStore, c: MockCustomer): CustomerDetail {
  return {
    ...customerOut(c),
    interests: [...c.interests]
      .sort((a, b) => b.lastInterestedAt.localeCompare(a.lastInterestedAt) || a.id.localeCompare(b.id))
      .map((i) => interestOut(store, i)),
  };
}
