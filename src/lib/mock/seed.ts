/**
 * Datos de ejemplo del modo mock. Reproducen los escenarios del mockup aprobado (docs/diseno) con
 * datos inventados de Perú (el backend solo admite PEN/USD y zona America/Lima).
 * Las fechas se calculan respecto de "ahora" para que la demo siempre esté vigente.
 *
 * Flujo de aprobación del propietario (M8.1–M9.3): los escenarios se reproducen con la misma lógica que las
 * rutas y el simulador (./requests), en orden cronológico y con instantes en el pasado, para que el
 * historial, la conversación del «Propietario» y los avisos al cliente queden coherentes:
 * - RES-…461 (María, WhatsApp, Samanta): WAITING_RESPONSE, plantilla al propietario DELIVERED.
 * - RES-…460 (Diego, Instagram, Samanta): SENT_TO_OWNER, plantilla QUEUED.
 * - RES-…462 (Sofía, WhatsApp, Samanta): ACCEPTED por el propietario, reserva CONFIRMED, aviso entregado y
 *   un «sí» tardío con respuesta automática ALREADY_DECIDED.
 * - RES-…465 (Gabriel, WhatsApp, Samanta): MODIFICATION_REQUESTED, propuesta en comments, aviso entregado y
 *   conversación en pausa SAMANTA_HANDOFF.
 * - RES-…449 (Ricardo, Instagram, Samanta): REJECTED por el propietario, sin aviso (WINDOW_CLOSED).
 * - RES-…466 (Patricia, web SM-…): la plantilla falló (WHATSAPP_SEND_REJECTED) y volvió a READY_TO_SEND.
 * - RES-…468 (Rocío, web SM-…): INCOMPLETE_DATA. RES-…469 (Natalia, teléfono): READY_TO_SEND creada en el CRM.
 * - RES-…438 (Felipe): ACCEPTED en el CRM (USER). RES-…431 (Camila V.): REJECTED en el CRM con motivo.
 * - RES-…455 (Jorge): CANCELLED con motivo. Las demás son anteriores al 10/11 (historial vacío).
 */
import { TZDate } from "@date-fns/tz";
import type {
  AssistantPauseReason,
  CommercialCategory,
  CommercialItem,
  CommercialItemType,
  ContactChannel,
  CustomerStatus,
  Message,
  ReservationRequestStatus,
  ReservationStatus,
  RestaurantConfig,
  RoleCode,
  SamantaReservationOutcome,
  SamantaReservationProposal,
} from "@/lib/api/types";
import { RESERVED_IDEMPOTENCY_PREFIX, SAMANTA_USER_ID } from "@/lib/api/types";
import {
  SAMANTA_REQUEST_NOTE,
  alreadyDecidedText,
  changeStatus,
  dayAndTime,
  ownerConversation,
  ownerMessageFailed,
  ownerProposal,
  ownerReply,
  samantaTexts,
  sendToOwner,
} from "./requests";
import { approvedDraft, autoDraft, knowledgeHash } from "./samanta";
import { iso, lastSequence, uuid, type MockConversation, type MockCustomer, type MockRequest, type MockReservation, type MockStore, type MockUser } from "./store";

export const MOCK_TIME_ZONE = "America/Lima";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Instante de un día de la semana actual (0 = lunes) a una hora "HH:mm" en Lima. */
function weekDayAt(now: number, dayIndex: number, time: string): number {
  const today = new TZDate(now, MOCK_TIME_ZONE);
  const mondayOffset = (today.getDay() + 6) % 7;
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset + dayIndex, hh, mm, 0, 0, MOCK_TIME_ZONE).getTime();
}

/** Instante de un día del mes actual a una hora en Lima. */
function monthDayAt(now: number, day: number, time: string): number {
  const today = new TZDate(now, MOCK_TIME_ZONE);
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(today.getFullYear(), today.getMonth(), day, hh, mm, 0, 0, MOCK_TIME_ZONE).getTime();
}

/** Instante relativo a hoy (días hacia atrás; negativo, hacia adelante) a una hora fija en Lima. */
function daysAgoAt(now: number, daysAgo: number, time: string): number {
  const today = new TZDate(now, MOCK_TIME_ZONE);
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hh, mm, 0, 0, MOCK_TIME_ZONE).getTime();
}

const daysAhead = (now: number, days: number, time: string) => daysAgoAt(now, -days, time);

function dayOfYear(now: number, month: number, day: number, time: string): number {
  const today = new TZDate(now, MOCK_TIME_ZONE);
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(today.getFullYear(), month, day, hh, mm, 0, 0, MOCK_TIME_ZONE).getTime();
}

/** Fecha local AAAA-MM-DD (la de `reservationProposal.date`). */
function localDate(ms: number): string {
  const d = new TZDate(ms, MOCK_TIME_ZONE);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Código de la web: SM-AAAAMMDD-XXXXXX. */
function webCode(ms: number, suffix: string): string {
  return `SM-${localDate(ms).replace(/-/g, "")}-${suffix}`;
}

export function buildSeed(now: number = Date.now()): MockStore {
  // ---------------------------------------------------------------- usuarios
  const user = (firstName: string, lastName: string, email: string, roles: RoleCode[], lastLoginAgoMin: number | null): MockUser => ({
    id: uuid(),
    firstName,
    lastName,
    email,
    isActive: true,
    lastLoginAt: lastLoginAgoMin === null ? null : iso(now - lastLoginAgoMin * MIN),
    createdAt: iso(now - 120 * DAY),
    updatedAt: iso(now - 10 * DAY),
    roles,
    password: "",
  });
  const admin = user("Frank", "Quispe", "frank@eyaqsystems.com", ["ADMIN"], 75);
  // El OWNER activo es el responsable de aprobación (approvalResponsibleId) y el actor de las entradas OWNER.
  const owner = user("Ricardo", "Mora", "ricardo@sabormagico.pe", ["OWNER"], 110);
  const operator = user("Camila", "Torres", "camila@sabormagico.pe", ["OPERATOR"], 1);
  const support = user("Soporte", "EYAQ", "soporte@eyaqsystems.com", ["SUPPORT"], 22 * 60);
  const users = [admin, owner, operator, support];

  // ---------------------------------------------------------------- configuración
  const day = (dayOfWeek: RestaurantConfig["schedules"][number]["dayOfWeek"], open: string | null, close: string | null) => ({
    dayOfWeek,
    isOpen: open !== null,
    openTime: open,
    closeTime: close,
  });
  const config: RestaurantConfig = {
    id: uuid(),
    businessName: "Sabor Mágico Grill",
    logoUrl: null,
    description: "Restaurante de parrillas y cocina peruana.",
    address: "Av. José Larco 1234, Miraflores, Lima",
    latitude: -12.1216,
    longitude: -77.0298,
    whatsappNumber: "+51987000192",
    // WhatsApp personal del propietario: adonde llegan las solicitudes para aprobar (M9.1).
    ownerWhatsappNumber: "+51999888777",
    email: "reservas@sabormagico.pe",
    website: "https://sabormagico.pe",
    currency: "PEN",
    timeZone: MOCK_TIME_ZONE,
    reservationPolicy:
      "Las reservas se confirman cuando el restaurante las aprueba. Se guarda la mesa por 15 minutos después de la hora reservada. Grupos de más de 10 personas requieren abono del 30%.",
    cancellationPolicy:
      "Puedes cancelar sin costo hasta 4 horas antes. Para grupos con abono, la cancelación con menos de 24 horas no es reembolsable.",
    responseTimeoutMinutes: 30,
    approvalResponsibleId: owner.id,
    approvalResponsible: { id: owner.id, firstName: owner.firstName, lastName: owner.lastName, email: owner.email },
    languages: ["ES", "EN"],
    schedules: [
      day("MONDAY", null, null),
      day("TUESDAY", "12:00", "22:00"),
      day("WEDNESDAY", "12:00", "22:00"),
      day("THURSDAY", "12:00", "23:00"),
      day("FRIDAY", "12:00", "23:59"),
      day("SATURDAY", "12:00", "23:59"),
      day("SUNDAY", "12:00", "18:00"),
    ],
    createdAt: iso(now - 60 * DAY),
    updatedAt: iso(now - 3 * DAY),
  };

  // ---------------------------------------------------------------- catálogo
  const category = (nameEs: string, displayOrder: number): CommercialCategory => ({
    id: uuid(),
    nameEs,
    nameEn: null,
    descriptionEs: null,
    descriptionEn: null,
    isActive: true,
    displayOrder,
    createdAt: iso(now - 90 * DAY),
    updatedAt: iso(now - 90 * DAY),
  });
  const catReservas = category("Reservas", 0);
  const catParrillas = category("Parrillas", 1);
  const catMenu = category("Menú", 2);
  const catExperiencias = category("Experiencias", 3);
  const catAdicionales = category("Adicionales", 4);
  const catEspacios = category("Espacios", 5);
  const categories = [catReservas, catParrillas, catMenu, catExperiencias, catAdicionales, catEspacios];

  const item = (
    type: CommercialItemType,
    cat: CommercialCategory,
    nameEs: string,
    descriptionEs: string | null,
    basePrice: string | null,
    opts: { isActive?: boolean; approval?: CommercialItem["approvalStatus"]; conditions?: string; order?: number } = {},
  ): CommercialItem => ({
    id: uuid(),
    type,
    categoryId: cat.id,
    nameEs,
    nameEn: null,
    descriptionEs,
    descriptionEn: null,
    basePrice,
    displayOrder: opts.order ?? 0,
    isActive: opts.isActive ?? true,
    approvalStatus: opts.approval ?? "APPROVED",
    conditions: opts.conditions ?? null,
    internalNotes: null,
    availabilityNote: null,
    createdAt: iso(now - 80 * DAY),
    updatedAt: iso(now - 5 * DAY),
    category: { id: cat.id, nameEs: cat.nameEs, nameEn: cat.nameEn, isActive: cat.isActive, displayOrder: cat.displayOrder },
    variants: [],
    images: [],
    faqs: [],
    schedules: [],
    promotionDetail: null,
    eventDetail: null,
  });
  const itCena = item("SERVICE", catReservas, "Cena", "Reserva de mesa para la cena", null, { order: 0 });
  const itAlmuerzo = item("SERVICE", catReservas, "Almuerzo", "Reserva de mesa para el almuerzo", null, { order: 1 });
  const itEjecutivo = item("SERVICE", catReservas, "Almuerzo ejecutivo", "Entrada, fondo y bebida para grupos de trabajo", "35.00", { order: 2 });
  const itLomo = item("DISH", catParrillas, "Lomo al grill", "Con papas nativas y ensalada", "38.00");
  const itParrillada = item("DISH", catParrillas, "Parrillada para 2", "Res, cerdo, pollo y chorizo", "89.00", { order: 1 });
  const itMenuDia = item("DISH", catMenu, "Menú del día", "Entrada, fondo y bebida", "28.00");
  const itDegustacion = item("SERVICE", catExperiencias, "Menú degustación", "5 tiempos con maridaje", "160.00", { isActive: false });
  const itTorta = item("SERVICE", catAdicionales, "Torta de cumpleaños", "Chocolate, para 6 a 8 personas", "45.00");
  const itSalon = item("SERVICE", catEspacios, "Salón privado", "Hasta 20 personas", null, {
    conditions: "Consumo mínimo S/ 1,200.00",
  });
  const itPisco = item("BEVERAGE", catMenu, "Pisco sour", null, "22.00", { approval: "DRAFT", order: 3 });
  const items = [itCena, itAlmuerzo, itEjecutivo, itLomo, itParrillada, itMenuDia, itDegustacion, itTorta, itSalon, itPisco];

  // ---------------------------------------------------------------- estado (lo usan los flujos de ./requests)
  const store: MockStore = {
    users,
    sessions: [],
    config,
    categories,
    items,
    customers: [],
    requests: [],
    reservations: [],
    conversations: [],
    messages: [],
    drafts: [],
    idempotency: new Map(),
    templates: new Map(),
    sequences: { request: 400, reservation: 200 },
  };
  const { customers, requests, reservations, conversations, messages, drafts, idempotency } = store;

  // ---------------------------------------------------------------- clientes
  const customer = (
    firstName: string | null,
    lastName: string | null,
    phone: string | null,
    email: string | null,
    sourceChannel: ContactChannel,
    status: CustomerStatus,
    firstContactAt: number,
    lastContactAt: number,
    interests: Array<{ itemId: string; at: number }> = [],
    /** Identidad de Messenger (cliente creado por el webhook): PSID interno. */
    messengerPsid: string | null = null,
  ): MockCustomer => {
    const c: MockCustomer = {
      messengerPsid,
      id: uuid(),
      firstName,
      lastName,
      phone,
      phoneCountry: null,
      email,
      sourceChannel,
      status,
      firstContactAt: iso(firstContactAt),
      lastContactAt: iso(lastContactAt),
      notes: null,
      createdAt: iso(firstContactAt),
      updatedAt: iso(lastContactAt),
      interests: interests.map((i) => ({
        id: uuid(),
        commercialItemId: i.itemId,
        firstInterestedAt: iso(i.at),
        lastInterestedAt: iso(i.at),
        notes: null,
      })),
    };
    customers.push(c);
    return c;
  };

  const maria = customer("María", "Fernández", "+51 910 442 908", "maria.fdz@correo.pe", "WHATSAPP", "REQUESTED_RESERVATION", daysAgoAt(now, 2, "18:40"), now - 2 * MIN, [
    { itemId: itCena.id, at: now - 5 * MIN },
    { itemId: itTorta.id, at: now - 3 * MIN },
  ]);
  // Messenger, como en bk-crm: el webhook guarda el nombre del perfil entero en firstName y no trae
  // teléfono ni correo. Paola es una identidad de Messenger a la que el equipo añadió contacto a mano.
  const carlos = customer("Carlos Ibáñez", null, null, null, "FACEBOOK", "IN_CONVERSATION", daysAgoAt(now, 1, "10:00"), now - 14 * MIN, [
    { itemId: itCena.id, at: now - 14 * MIN },
  ], "7712049386512230");
  const andrea = customer("Andrea", "Salazar", "+51 900 918 552", "andrea.s@correo.pe", "INSTAGRAM", "CONFIRMED", now - 42 * DAY, now - 60 * MIN, [
    { itemId: itAlmuerzo.id, at: now - 80 * MIN },
  ]);
  const tauro = customer("Grupo Empresarial Tauro", null, "+51 1 744 3300", "eventos@tauro.pe", "WHATSAPP", "INTERESTED", daysAgoAt(now, 1, "15:00"), now - 3 * HOUR, [
    { itemId: itSalon.id, at: now - 3 * HOUR },
  ]);
  const jorge = customer("Jorge", "Peña", "+51 900 551 112", "jorge@correo.pe", "WEBSITE", "RECURRENT", now - 122 * DAY, now - 5 * HOUR, [
    { itemId: itCena.id, at: now - 5 * HOUR },
  ]);
  const lucia = customer("Lucía", "Fernández", "+51 912 006 441", null, "WHATSAPP", "NEW", daysAgoAt(now, 1, "12:28"), daysAgoAt(now, 1, "12:30"), [
    { itemId: itMenuDia.id, at: daysAgoAt(now, 1, "12:30") },
  ]);
  const ricardo = customer("Ricardo", "Núñez", "+51 918 330 901", "rnunez@correo.pe", "INSTAGRAM", "REQUESTED_RESERVATION", now - 4 * DAY, now - 29 * HOUR, [
    { itemId: itAlmuerzo.id, at: now - 29 * HOUR },
  ]);
  const paola = customer("Paola", "Duarte", "+51 904 771 229", "paoduarte@correo.pe", "FACEBOOK", "CONFIRMED", now - 9 * DAY, daysAgoAt(now, 2, "09:25"), [
    { itemId: itCena.id, at: daysAgoAt(now, 2, "09:10") },
  ], "6604918273340915");
  const camilaV = customer("Camila", "Vargas", "+51 911 883 004", null, "WHATSAPP", "REJECTED", now - 20 * DAY, now - 4 * DAY, [
    { itemId: itCena.id, at: now - 4 * DAY },
  ]);
  const natalia = customer("Natalia", "Ruiz", "+51 920 114 778", "natalia.ruiz@correo.pe", "WHATSAPP", "CONFIRMED", now - 70 * DAY, now - 5 * DAY, [
    { itemId: itSalon.id, at: now - 5 * DAY },
  ]);
  const felipe = customer("Felipe", "Ortiz", "+51 901 552 663", "fortiz@empresa.pe", "WEBSITE", "RECURRENT", now - 200 * DAY, now - 6 * DAY, [
    { itemId: itEjecutivo.id, at: now - 6 * DAY },
  ]);
  const diego = customer("Diego", "Restrepo", "+51 913 404 120", null, "INSTAGRAM", "REQUESTED_RESERVATION", now - 1 * DAY, now - 5 * MIN, [
    { itemId: itCena.id, at: now - 9 * MIN },
  ]);
  const valentina = customer("Valentina", "Ríos", "+51 905 600 318", "vrios@correo.pe", "FACEBOOK", "CONFIRMED", now - 15 * DAY, now - 7 * DAY);
  const sinNombre = customer(null, null, "+51912345678", null, "WHATSAPP", "NEW", now - 40 * MIN, now - 40 * MIN);
  // Messenger sin nombre de perfil: ni nombre, ni teléfono, ni correo.
  const messengerSinNombre = customer(null, null, null, null, "FACEBOOK", "NEW", now - 25 * MIN, now - 25 * MIN, [], "5893120476618842");
  // Flujo del propietario (10/11).
  const sofia = customer("Sofía", "Paredes", "+51 945 210 377", null, "WHATSAPP", "REQUESTED_RESERVATION", now - 26 * HOUR - 8 * MIN, now - 24 * HOUR - 40 * MIN);
  const gabriel = customer("Gabriel", "Soto", "+51 956 330 118", "gsoto@correo.pe", "WHATSAPP", "REQUESTED_RESERVATION", now - 5 * HOUR - 10 * MIN, now - 4 * HOUR);
  const patricia = customer("Patricia Lozano", null, "+51 987 450 221", "patricia.lozano@correo.pe", "WEBSITE", "REQUESTED_RESERVATION", now - 27 * HOUR, now - 27 * HOUR);
  const rocio = customer("Rocío Vela", null, "+51 934 118 602", "rocio.vela@correo.pe", "WEBSITE", "REQUESTED_RESERVATION", now - 90 * MIN, now - 90 * MIN);

  const filler = [
    customer("Familia", "Gómez", "+51 902 110 455", null, "WHATSAPP", "RECURRENT", now - 300 * DAY, now - 9 * DAY),
    customer("Andrés", "Mejía", "+51 903 221 566", null, "INSTAGRAM", "CONFIRMED", now - 30 * DAY, now - 8 * DAY),
    customer("Sergio", "Pardo", "+51 906 332 677", null, "WHATSAPP", "CONFIRMED", now - 12 * DAY, now - 6 * DAY),
    customer("Laura", "Cano", "+51 907 443 788", "lcano@correo.pe", "WHATSAPP", "CONFIRMED", now - 18 * DAY, now - 5 * DAY),
    customer("Martín", "Rojas", "+51 908 554 899", "mrojas@correo.pe", "WEBSITE", "CONFIRMED", now - 25 * DAY, now - 4 * DAY),
    customer("Óscar", "León", "+51 909 665 900", null, "FACEBOOK", "CONFIRMED", now - 11 * DAY, now - 3 * DAY),
    customer("Familia", "Herrera", "+51 914 776 011", null, "WHATSAPP", "RECURRENT", now - 400 * DAY, now - 3 * DAY),
    customer("Rosa", "Quispe", "+51 916 887 122", null, "WHATSAPP", "RECURRENT", now - 150 * DAY, now - 12 * DAY),
    customer("Luis", "Huamán", "+51 917 998 233", "lhuaman@correo.pe", "FACEBOOK", "CONFIRMED", now - 40 * DAY, now - 13 * DAY),
    customer("Carmen", "Flores", "+51 919 109 344", null, "INSTAGRAM", "CONFIRMED", now - 35 * DAY, now - 14 * DAY),
    customer("Pedro", "Castillo", "+51 921 210 455", "pcastillo@correo.pe", "WEBSITE", "RECURRENT", now - 220 * DAY, now - 15 * DAY),
    customer("Elena", "Ramírez", "+51 922 321 566", null, "WHATSAPP", "CONFIRMED", now - 28 * DAY, now - 16 * DAY),
  ];
  const [gomez, mejia, pardo, cano, rojas, leon, herrera, ...pool] = filler;

  // ---------------------------------------------------------------- solicitudes y reservas
  const year = new TZDate(now, MOCK_TIME_ZONE).getFullYear();

  const request = (
    num: number,
    c: MockCustomer,
    init: {
      status: ReservationRequestStatus;
      at: number | null;
      people: number | null;
      item: CommercialItem | null;
      comments?: string | null;
      special?: string | null;
      created: number;
      updated?: number;
      channel?: ContactChannel;
      conversation?: MockConversation | null;
      externalReference?: string | null;
    },
  ): MockRequest => {
    const r: MockRequest = {
      id: uuid(),
      code: `RES-${year}-${String(num).padStart(6, "0")}`,
      externalReference: init.externalReference ?? null,
      customerId: c.id,
      commercialItemId: init.item?.id ?? null,
      conversationId: init.conversation?.id ?? null,
      sourceChannel: init.channel ?? init.conversation?.channel ?? c.sourceChannel,
      reservationAt: init.at === null ? null : iso(init.at),
      numberOfPeople: init.people,
      quotedPrice: null,
      currency: null,
      comments: init.comments ?? null,
      specialRequirements: init.special ?? null,
      status: init.status,
      createdAt: iso(init.created),
      updatedAt: iso(init.updated ?? init.created),
      statusHistory: [],
      ownerMessageId: null,
      customerNoticeMessageId: null,
      customerNoticeError: null,
    };
    store.sequences.request = Math.max(store.sequences.request, num);
    requests.push(r);
    return r;
  };

  const reservation = (
    c: MockCustomer,
    at: number,
    people: number,
    itemRef: CommercialItem | null,
    notes: string | null,
    status: ReservationStatus | null,
    fromRequest: MockRequest | null = null,
  ): MockReservation => {
    store.sequences.reservation += 1;
    const created = Math.min(now - 2 * HOUR, at - 2 * DAY);
    const r: MockReservation = {
      id: uuid(),
      code: `R-${new TZDate(created, MOCK_TIME_ZONE).getFullYear()}-${String(store.sequences.reservation).padStart(6, "0")}`,
      reservationRequestId: fromRequest?.id ?? null,
      customerId: c.id,
      commercialItemId: itemRef?.id ?? null,
      reservationAt: iso(at),
      numberOfPeople: people,
      status: status ?? (at < now ? "COMPLETED" : "CONFIRMED"),
      notes,
      assignedUserId: null,
      createdAt: iso(created),
      updatedAt: iso(created),
      noteHistory: [],
      rescheduleHistory: [],
    };
    reservations.push(r);
    return r;
  };

  // Escenarios del mockup (semana actual: 0 = lunes … 6 = domingo). Anteriores al 10/11: historial vacío.
  const reqAndrea = request(458, andrea, { status: "ACCEPTED", at: weekDayAt(now, 5, "13:00"), people: 2, item: itAlmuerzo, comments: "Salón.", created: now - 80 * MIN, updated: now - 66 * MIN });
  const reqJorge = request(455, jorge, {
    status: "READY_TO_SEND",
    at: dayOfYear(now, 7, 8, "20:00"),
    people: 4,
    item: itCena,
    comments: "Salón principal.",
    created: now - 72 * DAY,
    updated: now - 72 * DAY,
  });
  // Cancelada en el CRM con motivo (USER).
  changeStatus(reqJorge, "CANCELLED", { type: "USER", id: operator.id }, "El cliente canceló por la web.", now - 5 * HOUR);
  const reqValentina = request(447, valentina, { status: "ACCEPTED", at: weekDayAt(now, 2, "19:30"), people: 4, item: itCena, comments: "Salón. Silla para bebé.", created: now - 8 * DAY, updated: now - 8 * DAY + 8 * MIN });
  const reqPaola = request(440, paola, { status: "ACCEPTED", at: weekDayAt(now, 3, "19:00"), people: 3, item: itCena, comments: "Salón.", created: now - 9 * DAY, updated: now - 9 * DAY + 12 * MIN });
  // Aprobada en el CRM (USER, sin aviso automático: customerNoticeMessage y customerNoticeError en null).
  const reqFelipe = request(438, felipe, {
    status: "READY_TO_SEND",
    at: weekDayAt(now, 1, "13:30"),
    people: 5,
    item: itEjecutivo,
    comments: "Salón. Factura a empresa.",
    special: "Salón. Factura a empresa.",
    created: now - 10 * DAY,
  });
  changeStatus(reqFelipe, "ACCEPTED", { type: "USER", id: admin.id }, null, now - 10 * DAY + 5 * MIN);
  // Rechazada en el CRM por el propietario (USER, con motivo).
  const reqCamila = request(431, camilaV, { status: "READY_TO_SEND", at: weekDayAt(now, 0, "20:00"), people: 2, item: itCena, comments: "Terraza.", created: now - 4 * DAY });
  changeStatus(reqCamila, "REJECTED", { type: "USER", id: owner.id }, "Sin cupo en terraza ese día.", now - 4 * DAY + 41 * MIN);
  request(312, jorge, { status: "REJECTED", at: dayOfYear(now - 330 * DAY, 10, 2, "20:00"), people: 6, item: itCena, created: now - 345 * DAY });
  // Creada a mano por teléfono: INCOMPLETE_DATA → READY_TO_SEND al completar las personas (USER). No se envía al propietario.
  const reqNatalia = request(469, natalia, {
    status: "INCOMPLETE_DATA",
    at: daysAhead(now, 3, "20:00"),
    people: null,
    item: itSalon,
    comments: "Llamó por teléfono: aniversario, prefiere una mesa tranquila.",
    created: now - 50 * MIN,
    channel: "PHONE",
  });
  reqNatalia.numberOfPeople = 2;
  changeStatus(reqNatalia, "READY_TO_SEND", { type: "USER", id: operator.id }, null, now - 45 * MIN);
  // De la web, con datos que no se entendieron: INCOMPLETE_DATA, sin historial.
  request(468, rocio, {
    status: "INCOMPLETE_DATA",
    at: null,
    people: null,
    item: null,
    comments: "Queremos celebrar un cumpleaños\nPaís: Perú\nFecha: el sábado\nPersonas: 2-3\nCRM: no se le escribió por WhatsApp: faltan la fecha, la hora o las personas.",
    special: "Mesa en terraza",
    created: now - 90 * MIN,
    channel: "WEBSITE",
    externalReference: webCode(now - 90 * MIN, "4C7D21"),
  });

  reservation(gomez!, weekDayAt(now, 0, "13:00"), 4, itAlmuerzo, "Salón.", null);
  reservation(mejia!, weekDayAt(now, 0, "20:30"), 2, itCena, "Terraza. Aniversario.", null);
  reservation(felipe, weekDayAt(now, 1, "13:30"), 5, itEjecutivo, "Salón. Factura a empresa.", null, reqFelipe);
  reservation(valentina, weekDayAt(now, 2, "19:30"), 4, itCena, "Salón. Silla para bebé.", null, reqValentina);
  reservation(pardo!, weekDayAt(now, 2, "21:00"), 2, itCena, "Barra.", null);
  reservation(paola, weekDayAt(now, 3, "19:00"), 3, itCena, "Salón.", "UPCOMING", reqPaola);
  reservation(cano!, weekDayAt(now, 4, "12:30"), 6, itAlmuerzo, "Terraza.", null);
  reservation(rojas!, weekDayAt(now, 4, "20:00"), 8, itDegustacion, "Salón principal. Menú degustación.", null);
  reservation(andrea, weekDayAt(now, 5, "13:00"), 2, itAlmuerzo, "Salón.", null, reqAndrea);
  reservation(natalia, weekDayAt(now, 5, "20:00"), 10, itSalon, "Salón privado. Cumpleaños, decoración.", null);
  reservation(leon!, weekDayAt(now, 5, "21:30"), 2, itCena, "Terraza.", null);
  reservation(herrera!, weekDayAt(now, 6, "13:00"), 7, itAlmuerzo, "Terraza. Dos vegetarianos.", null);

  // Historial de clientes recurrentes.
  reservation(andrea, now - 24 * DAY, 2, itAlmuerzo, null, "COMPLETED");
  reservation(jorge, now - 122 * DAY, 4, itCena, null, "COMPLETED");

  // Resto del mes, con las cantidades por día del mockup (fuera de la semana actual).
  const monthCounts: Record<number, number> = { 1: 3, 2: 5, 3: 7, 4: 4, 5: 2, 6: 3, 7: 2, 8: 4, 9: 6, 10: 8, 11: 5, 19: 1, 20: 1, 23: 2, 24: 3, 30: 1 };
  const weekStart = weekDayAt(now, 0, "00:00");
  const weekEnd = weekDayAt(now, 7, "00:00");
  const times = ["13:00", "13:30", "19:30", "20:00", "20:30", "21:00", "12:30", "14:00"];
  const fillerItems = [itCena, itAlmuerzo, itCena, itMenuDia, itCena, itEjecutivo];
  let k = 0;
  for (const [d, count] of Object.entries(monthCounts)) {
    for (let i = 0; i < count; i += 1) {
      const at = monthDayAt(now, Number(d), times[(Number(d) + i) % times.length]!);
      if (at >= weekStart && at < weekEnd) continue;
      if (new TZDate(at, MOCK_TIME_ZONE).getMonth() !== new TZDate(now, MOCK_TIME_ZONE).getMonth()) continue;
      const c = pool[k % pool.length]!;
      const status: ReservationStatus | null = at < now ? (k % 11 === 0 ? "NO_SHOW" : "COMPLETED") : null;
      reservation(c, at, 2 + ((Number(d) + i) % 5), fillerItems[k % fillerItems.length]!, null, status);
      k += 1;
    }
  }
  // Una cancelada (no debe aparecer en el calendario).
  reservation(pool[0]!, weekDayAt(now, 3, "13:00"), 3, itAlmuerzo, "Cancelada por el cliente.", "CANCELLED");

  // ---------------------------------------------------------------- conversaciones y mensajes
  const knowledge = knowledgeHash({ config, categories, items });

  /** Datos del borrador AUTO de una línea «S». */
  interface AutoExtra {
    outcome?: SamantaReservationOutcome;
    proposal?: SamantaReservationProposal;
    requiresHuman?: boolean;
  }
  /**
   * c = cliente, s = Samanta manual, S = Samanta automática, a = equipo (autor opcional; por defecto, Camila).
   * Como en bk-crm, todo OUTBOUND tiene autor:
   * - «s»: en WhatsApp sale de un borrador MANUAL APPROVED por el responsable de la conversación (o el ADMIN si
   *   no tiene) y lleva a esa persona como autora; en los demás canales es una respuesta del equipo.
   * - «S»: borrador AUTO APPROVED por SAMANTA_USER_ID, que también es el autor del OUTBOUND (cualquier canal).
   */
  type Line = ["c", string, number] | ["s", string, number] | ["a", string, number, string?] | ["S", string, number, AutoExtra?];

  const say = (conv: MockConversation, lines: Line[], opts: { unread?: number } = {}) => {
    const inboundIdx = lines.map((l, i) => (l[0] === "c" ? i : -1)).filter((i) => i >= 0);
    const unreadFrom = inboundIdx.length - (opts.unread ?? 0);
    lines.forEach((line, index) => {
      const [kind, text, at] = line;
      const inbound = kind === "c";
      const auto = kind === "S";
      const manual = kind === "s" && conv.channel === "WHATSAPP";
      const unread = inbound && inboundIdx.indexOf(index) >= unreadFrom;
      const authorUserId = inbound
        ? null
        : auto
          ? SAMANTA_USER_ID
          : kind === "a"
            ? (line[3] ?? operator.id)
            : manual
              ? (conv.assignedUserId ?? admin.id)
              : (conv.assignedUserId ?? operator.id);
      const source = [...messages]
        .filter((m) => m.conversationId === conv.id && m.direction === "INBOUND")
        .sort((a, b) => b.sequence - a.sequence)[0];
      const message: Message = {
        id: uuid(),
        conversationId: conv.id,
        channel: conv.channel,
        sequence: lastSequence(store, conv.id) + 1,
        externalMessageId: inbound ? `mock-in-${conv.id.slice(0, 8)}-${index}-${at}` : `mock-out-${conv.id.slice(0, 8)}-${index}-${at}`,
        direction: inbound ? "INBOUND" : "OUTBOUND",
        status: inbound ? "PROCESSED" : "DELIVERED",
        type: "TEXT",
        content: text,
        authorUserId,
        occurredAt: inbound ? iso(at - 2000) : null,
        receivedAt: inbound ? iso(at) : null,
        processedAt: inbound ? iso(at + 1000) : null,
        sentAt: inbound ? null : iso(at + 1500),
        deliveredAt: inbound ? null : iso(at + 3000),
        providerReadAt: null,
        failedAt: null,
        readAt: inbound && !unread ? iso(at + 60_000) : null,
        errorCode: null,
        createdAt: iso(at),
        updatedAt: iso(at),
        attachments: [],
      };
      messages.push(message);
      if (manual && source) {
        const draft = approvedDraft({
          source,
          outbound: message,
          reviewerId: authorUserId!,
          businessName: config.businessName,
          knowledgeHash: knowledge,
          requestedAt: at - 15_000,
          approvedAt: at,
        });
        drafts.push(draft);
        idempotency.set(`${conv.id}:${RESERVED_IDEMPOTENCY_PREFIX}${draft.id}`, { messageId: message.id, authorUserId: authorUserId!, content: text });
      }
      if (auto && source) {
        const extra = (line[3] ?? {}) as AutoExtra;
        drafts.push(
          autoDraft({
            source,
            outbound: message,
            knowledgeHash: knowledge,
            reservationOutcome: extra.outcome ?? null,
            reservationProposal: extra.proposal ?? null,
            requiresHuman: extra.requiresHuman,
          }),
        );
      }
      if (Date.parse(conv.lastMessageAt ?? "1970-01-01T00:00:00.000Z") < at) conv.lastMessageAt = iso(at);
      if (Date.parse(conv.updatedAt) < at) conv.updatedAt = iso(at);
    });
  };

  const conversation = (
    c: MockCustomer,
    channel: ContactChannel,
    lines: Line[],
    opts: { unread?: number; paused?: AssistantPauseReason; assignee?: MockUser | null } = {},
  ): MockConversation => {
    const last = lines[lines.length - 1]![2];
    const conv: MockConversation = {
      id: uuid(),
      customerId: c.id,
      channel,
      isAssistantPaused: opts.paused !== undefined,
      assistantPauseReason: opts.paused ?? null,
      assistantPausedAt: opts.paused ? iso(last) : null,
      assignedUserId: opts.assignee?.id ?? null,
      lastMessageAt: null,
      createdAt: iso(lines[0]![2]),
      updatedAt: iso(lines[0]![2]),
    };
    conversations.push(conv);
    say(conv, lines, opts);
    return conv;
  };

  /** Resumen de Samanta (PROPOSED) y su `reservationProposal`. */
  const proposal = (at: number, people: number, itemRef: CommercialItem | null, special: string | null): { text: string; extra: AutoExtra } => {
    const { date, time } = dayAndTime(iso(at), MOCK_TIME_ZONE);
    return {
      text: samantaTexts.proposal({ date, time, people, service: itemRef?.nameEs ?? null, specialRequirements: special }),
      extra: {
        outcome: "PROPOSED",
        proposal: { date: localDate(at), time, people, commercialItemId: itemRef?.id ?? null, service: itemRef?.nameEs ?? null, specialRequirements: special, language: "es" },
      },
    };
  };
  const createdText = (code: number, at: number, people: number) => {
    const { date, time } = dayAndTime(iso(at), MOCK_TIME_ZONE);
    return samantaTexts.created(`RES-${year}-${String(code).padStart(6, "0")}`, { date, time, people });
  };
  /** Solicitud que registra Samanta al confirmar el cliente: READY_TO_SEND, vinculada a la conversación. */
  const samantaRequest = (num: number, c: MockCustomer, conv: MockConversation, at: number, people: number, itemRef: CommercialItem | null, special: string | null, created: number) => {
    const r = request(num, c, { status: "READY_TO_SEND", at, people, item: itemRef, special, comments: SAMANTA_REQUEST_NOTE, created, conversation: conv });
    const summary = [...drafts].reverse().find((d) => d.conversationId === conv.id && d.reservationOutcome === "PROPOSED");
    if (summary) summary.reservationRequestId = r.id;
    return r;
  };

  conversation(carlos, "FACEBOOK", [
    ["c", "¿Tienen mesa para hoy a las 9?", now - 16 * MIN],
    ["s", "Hola Carlos. Hoy a las 21:00 tenemos mesa en salón principal. ¿Para cuántas personas sería?", now - 16 * MIN + 20_000],
    ["c", "Somos 4, ¿tienen menú vegetariano?", now - 14 * MIN],
  ], { unread: 1 });

  conversation(andrea, "INSTAGRAM", [
    ["c", "Quiero reservar almuerzo el sábado para 2", now - 80 * MIN],
    ["s", "Claro. ¿Te funciona a las 13:00 en salón?", now - 80 * MIN + 20_000],
    ["c", "Sí", now - 79 * MIN],
    ["s", "¡Confirmado! Te esperamos el sábado a las 13:00.", now - 66 * MIN],
    ["c", "Genial, muchas gracias", now - 60 * MIN],
  ]);

  conversation(tauro, "WHATSAPP", [
    ["c", "Necesitamos cotización para cena de fin de año, 40 personas", now - 3 * HOUR - 2 * MIN],
    ["s", "Con gusto. Para grupos de más de 20 personas un asesor prepara la propuesta. Te transfiero ahora.", now - 3 * HOUR],
  ], { unread: 1, paused: "SAMANTA_HANDOFF", assignee: operator });

  conversation(jorge, "WEBSITE", [
    ["c", "Quisiera cancelar mi reserva del sábado", now - 5 * HOUR - 4 * MIN],
    ["s", "Hola Jorge. Encontré tu reserva del sábado a las 20:00 para 4 personas. ¿Confirmas que deseas cancelarla?", now - 5 * HOUR - 4 * MIN + 20_000],
    ["c", "Sí, por favor", now - 5 * HOUR - 2 * MIN],
    ["s", "Listo, quedó cancelada. Si quieres reprogramar, escríbeme cuando gustes.", now - 5 * HOUR],
  ]);

  conversation(sinNombre, "WHATSAPP", [["c", "Hola, ¿atienden el feriado?", now - 40 * MIN]], { unread: 1 });

  conversation(lucia, "WHATSAPP", [
    ["c", "¿Cuál es el menú del día?", daysAgoAt(now, 1, "12:30")],
    ["s", "Hoy tenemos lomo al grill con papas nativas y ensalada, S/ 38.00. ¿Te ayudo con una reserva?", daysAgoAt(now, 1, "12:30") + 20_000],
  ]);

  conversation(paola, "FACEBOOK", [
    ["c", "¿Me confirman la reserva del jueves?", daysAgoAt(now, 2, "09:10")],
    ["s", "Confirmado para el jueves a las 19:00, 3 personas.", daysAgoAt(now, 2, "09:22")],
    ["c", "Confirmado para el jueves, gracias", daysAgoAt(now, 2, "09:25")],
  ]);

  conversation(messengerSinNombre, "FACEBOOK", [["c", "Hola, ¿tienen estacionamiento cerca?", now - 25 * MIN]], { unread: 1 });

  // ---------------------------------------------------------------- flujo del propietario, en orden cronológico

  // Ricardo (Instagram): Samanta registra la solicitud; se envía al propietario y WhatsApp la entrega y la lee.
  const tRicardo = now - 29 * HOUR;
  const atRicardo = daysAhead(now, 4, "14:00");
  const pRicardo = proposal(atRicardo, 8, itAlmuerzo, "Terraza");
  const convRicardo = conversation(ricardo, "INSTAGRAM", [
    ["c", "Hola, quiero reservar almuerzo para 8 personas, en 4 días a las 2 de la tarde, en terraza", tRicardo - 6 * MIN],
    ["S", pRicardo.text, tRicardo - 6 * MIN + 10_000, pRicardo.extra],
    ["c", "Sí, confírmalo", tRicardo - 1 * MIN],
    ["S", createdText(449, atRicardo, 8), tRicardo - 1 * MIN + 10_000, { outcome: "CREATED" }],
  ]);
  const reqRicardo = samantaRequest(449, ricardo, convRicardo, atRicardo, 8, itAlmuerzo, "Terraza", tRicardo - 1 * MIN + 10_000);
  sendToOwner(store, reqRicardo, tRicardo + 15_000, { finalStatus: "READ", acceptedAfterMs: 2_000 });

  // Patricia (web): la plantilla al propietario falla y la solicitud vuelve a READY_TO_SEND (no se reenvía).
  const tPatricia = now - 27 * HOUR;
  const reqPatricia = request(466, patricia, {
    status: "READY_TO_SEND",
    at: daysAhead(now, 5, "19:30"),
    people: 4,
    item: itCena,
    comments: "Es el cumpleaños de mi mamá\nPaís: Perú",
    special: "Mesa junto a la ventana",
    created: tPatricia,
    channel: "WEBSITE",
    externalReference: webCode(tPatricia, "9E49B1"),
  });
  sendToOwner(store, reqPatricia, tPatricia + 20_000, { accepted: false });
  ownerMessageFailed(store, reqPatricia, "FAILED", "WHATSAPP_SEND_REJECTED", tPatricia + 2 * MIN);

  // Sofía (WhatsApp): el propietario acepta → reserva CONFIRMED y aviso entregado; luego un «sí» tardío (ALREADY_DECIDED).
  const tSofia = now - 26 * HOUR;
  const atSofia = daysAhead(now, 2, "20:00");
  const pSofia = proposal(atSofia, 4, itCena, null);
  const convSofia = conversation(sofia, "WHATSAPP", [
    ["c", "Hola, quiero reservar una cena para 4 personas, pasado mañana a las 8 de la noche", tSofia - 8 * MIN],
    ["S", pSofia.text, tSofia - 8 * MIN + 10_000, pSofia.extra],
    ["c", "Sí", tSofia - 2 * MIN],
    ["S", createdText(462, atSofia, 4), tSofia - 2 * MIN + 10_000, { outcome: "CREATED" }],
  ]);
  const reqSofia = samantaRequest(462, sofia, convSofia, atSofia, 4, itCena, null, tSofia - 2 * MIN + 10_000);
  sendToOwner(store, reqSofia, tSofia + 15_000, { finalStatus: "READ", acceptedAfterMs: 2_000 });
  ownerReply(store, reqSofia, "ACEPTAR", tSofia + 1 * HOUR);
  say(convSofia, [
    ["c", "Sí, confirmo", tSofia + 1 * HOUR + 20 * MIN],
    ["S", alreadyDecidedText(store, reqSofia)!.text, tSofia + 1 * HOUR + 20 * MIN + 10_000, { outcome: "ALREADY_DECIDED" }],
  ]);

  // Gabriel (WhatsApp): el propietario propone un cambio → MODIFICATION_REQUESTED, aviso y pausa SAMANTA_HANDOFF.
  const tGabriel = now - 5 * HOUR;
  const atGabriel = daysAhead(now, 3, "20:00");
  const pGabriel = proposal(atGabriel, 6, itCena, "Salón");
  const convGabriel = conversation(gabriel, "WHATSAPP", [
    ["c", "Buenas, quiero reservar una cena para 6 en el salón, en 3 días a las 8 pm", tGabriel - 10 * MIN],
    ["S", pGabriel.text, tGabriel - 10 * MIN + 10_000, pGabriel.extra],
    ["c", "Sí, perfecto", tGabriel - 3 * MIN],
    ["S", createdText(465, atGabriel, 6), tGabriel - 3 * MIN + 10_000, { outcome: "CREATED" }],
  ]);
  const reqGabriel = samantaRequest(465, gabriel, convGabriel, atGabriel, 6, itCena, "Salón", tGabriel - 3 * MIN + 10_000);
  sendToOwner(store, reqGabriel, tGabriel + 15_000, { finalStatus: "DELIVERED", acceptedAfterMs: 2_000 });
  ownerReply(store, reqGabriel, "PROPONER CAMBIO", tGabriel + 50 * MIN);
  ownerProposal(store, reqGabriel, "Mejor a las 21:30: a las 20:00 el salón está completo.", tGabriel + 53 * MIN);
  say(convGabriel, [["c", "Ok, ¿qué horario me proponen?", tGabriel + 60 * MIN]], { unread: 1 });

  // Ricardo: el propietario rechaza; Instagram no admite plantillas y la ventana se cerró → WINDOW_CLOSED.
  ownerReply(store, reqRicardo, "RECHAZAR", now - 3 * HOUR);

  // Diego (Instagram): recién registrada; la plantilla al propietario sigue en cola (SENT_TO_OWNER).
  const atDiego = daysAhead(now, 4, "21:00");
  const pDiego = proposal(atDiego, 2, itCena, "Salón");
  const convDiego = conversation(diego, "INSTAGRAM", [
    ["c", "Hola, ¿tienen mesa en salón para 2 en 4 días a las 9 pm?", now - 9 * MIN],
    ["S", pDiego.text, now - 9 * MIN + 10_000, pDiego.extra],
    ["c", "Sí", now - 5 * MIN],
    ["S", createdText(460, atDiego, 2), now - 5 * MIN + 10_000, { outcome: "CREATED" }],
  ]);
  const reqDiego = samantaRequest(460, diego, convDiego, atDiego, 2, itCena, "Salón", now - 5 * MIN + 10_000);
  sendToOwner(store, reqDiego, now - 3 * MIN, { accepted: false });

  // María (WhatsApp): registrada por Samanta y entregada al propietario (WAITING_RESPONSE).
  const atMaria = daysAhead(now, 3, "20:00");
  const pMaria = proposal(atMaria, 6, itCena, "Terraza. Cumpleaños, torta de chocolate.");
  const convMaria = conversation(maria, "WHATSAPP", [
    ["c", "Hola, quiero reservar en 3 días en la noche, somos 6", now - 8 * MIN],
    ["S", "¡Hola María! Con gusto. ¿A qué hora te gustaría? Tenemos mesas a las 19:30 o 20:00, en salón o terraza.", now - 8 * MIN + 10_000],
    ["c", "A las 8 en terraza. Es un cumpleaños, ¿pueden poner una torta?", now - 5 * MIN],
    ["S", pMaria.text, now - 5 * MIN + 10_000, pMaria.extra],
    ["c", "Sí, perfecto", now - 2 * MIN],
    ["S", createdText(461, atMaria, 6), now - 2 * MIN + 10_000, { outcome: "CREATED" }],
  ], { unread: 2 });
  const reqMaria = samantaRequest(461, maria, convMaria, atMaria, 6, itCena, "Terraza. Cumpleaños, torta de chocolate.", now - 2 * MIN + 10_000);
  sendToOwner(store, reqMaria, now - 90_000, { finalStatus: "DELIVERED", acceptedAfterMs: 2_000 });

  // El equipo ya leyó las respuestas del propietario.
  const ownerConv = ownerConversation(store, now);
  for (const m of messages) if (m.conversationId === ownerConv.id && m.direction === "INBOUND") m.readAt ??= iso(Date.parse(m.createdAt) + MIN);

  return store;
}
