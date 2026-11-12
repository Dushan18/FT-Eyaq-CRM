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
  CustomerNoticeMessage,
  Message,
  PublicUser,
  RequestMessageStatus,
  ReservationDetail,
  ReservationRequest,
  ReservationRequestDetail,
  Reservation,
  User,
} from "@/lib/api/types";
import { SAMANTA_USER_ID } from "@/lib/api/types";
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

/** Listado y escrituras de solicitudes: sin historial ni datos de los mensajes (solo los trae el detalle). */
export function requestOut(store: MockStore, r: MockRequest): ReservationRequest {
  const { statusHistory: _h, ownerMessageId: _o, customerNoticeMessageId: _m, customerNoticeError: _e, ...base } = r;
  void _h;
  void _o;
  void _m;
  void _e;
  return {
    ...base,
    customer: customerSummary(findCustomer(store, r.customerId)),
    commercialItem: itemSummary(store.items.find((i) => i.id === r.commercialItemId)),
  };
}

/** `{ id, firstName, lastName }` de quien hizo el cambio; SAMANTA_USER_ID no está en `users` (usuario de sistema). */
function actorOut(store: MockStore, id: string | null): PublicUser | null {
  if (!id) return null;
  if (id === SAMANTA_USER_ID) return { id, firstName: "Samanta", lastName: "" };
  const u = store.users.find((x) => x.id === id);
  return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName } : null;
}

function messageStatus(m: Message): RequestMessageStatus {
  return m.status as RequestMessageStatus;
}

/** `GET /reservation-requests/:id`: la solicitud más su historial, su reserva y los mensajes del flujo del propietario. */
export function requestDetailOut(store: MockStore, r: MockRequest): ReservationRequestDetail {
  const reservation = store.reservations.find((x) => x.reservationRequestId === r.id);
  const owner = r.ownerMessageId ? store.messages.find((m) => m.id === r.ownerMessageId) : undefined;
  const notice = r.customerNoticeMessageId ? store.messages.find((m) => m.id === r.customerNoticeMessageId) : undefined;
  return {
    ...requestOut(store, r),
    statusHistory: [...r.statusHistory]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((h) => ({ ...h, actor: actorOut(store, h.actorId) })),
    reservation: reservation ? { id: reservation.id, code: reservation.code, status: reservation.status, reservationAt: reservation.reservationAt } : null,
    ownerMessage: owner
      ? {
          id: owner.id,
          status: messageStatus(owner),
          errorCode: owner.errorCode,
          createdAt: owner.createdAt,
          sentAt: owner.sentAt,
          deliveredAt: owner.deliveredAt,
          providerReadAt: owner.providerReadAt,
        }
      : null,
    customerNoticeMessage: notice
      ? {
          id: notice.id,
          conversationId: notice.conversationId,
          channel: notice.channel as CustomerNoticeMessage["channel"],
          templateName: store.templates.get(notice.id) ?? null,
          status: messageStatus(notice),
          errorCode: notice.errorCode,
          createdAt: notice.createdAt,
          sentAt: notice.sentAt,
          deliveredAt: notice.deliveredAt,
          providerReadAt: notice.providerReadAt,
        }
      : null,
    customerNoticeError: notice ? null : r.customerNoticeError,
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
