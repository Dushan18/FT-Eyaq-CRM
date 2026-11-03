/**
 * Datos de ejemplo del modo mock. Reproducen los escenarios del mockup aprobado (docs/diseno) con
 * datos inventados de Perú (el backend solo admite PEN/USD y zona America/Lima).
 * Las fechas se calculan respecto de "ahora" para que la demo siempre esté vigente.
 */
import { TZDate } from "@date-fns/tz";
import type {
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
} from "@/lib/api/types";
import { iso, uuid, type MockConversation, type MockCustomer, type MockRequest, type MockReservation, type MockStore, type MockUser } from "./store";

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

/** Instante relativo a hoy (días hacia atrás) a una hora fija en Lima. */
function daysAgoAt(now: number, daysAgo: number, time: string): number {
  const today = new TZDate(now, MOCK_TIME_ZONE);
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hh, mm, 0, 0, MOCK_TIME_ZONE).getTime();
}

function dayOfYear(now: number, month: number, day: number, time: string): number {
  const today = new TZDate(now, MOCK_TIME_ZONE);
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(today.getFullYear(), month, day, hh, mm, 0, 0, MOCK_TIME_ZONE).getTime();
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

  // ---------------------------------------------------------------- clientes
  const customers: MockCustomer[] = [];
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
  ): MockCustomer => {
    const c: MockCustomer = {
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
  const carlos = customer("Carlos", "Ibáñez", "+51 915 220 187", null, "FACEBOOK", "IN_CONVERSATION", daysAgoAt(now, 1, "10:00"), now - 14 * MIN, [
    { itemId: itCena.id, at: now - 14 * MIN },
  ]);
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
  const ricardo = customer("Ricardo", "Núñez", "+51 918 330 901", "rnunez@correo.pe", "INSTAGRAM", "LOST", now - 4 * DAY, daysAgoAt(now, 1, "11:15"), [
    { itemId: itAlmuerzo.id, at: daysAgoAt(now, 1, "10:02") },
  ]);
  const paola = customer("Paola", "Duarte", "+51 904 771 229", "paoduarte@correo.pe", "FACEBOOK", "CONFIRMED", now - 9 * DAY, daysAgoAt(now, 2, "09:25"), [
    { itemId: itCena.id, at: daysAgoAt(now, 2, "09:10") },
  ]);
  const camilaV = customer("Camila", "Vargas", "+51 911 883 004", null, "WHATSAPP", "REJECTED", now - 20 * DAY, now - 4 * DAY, [
    { itemId: itCena.id, at: now - 4 * DAY },
  ]);
  const natalia = customer("Natalia", "Ruiz", "+51 920 114 778", "natalia.ruiz@correo.pe", "WHATSAPP", "CONFIRMED", now - 70 * DAY, now - 5 * DAY, [
    { itemId: itSalon.id, at: now - 5 * DAY },
  ]);
  const felipe = customer("Felipe", "Ortiz", "+51 901 552 663", "fortiz@empresa.pe", "WEBSITE", "RECURRENT", now - 200 * DAY, now - 6 * DAY, [
    { itemId: itEjecutivo.id, at: now - 6 * DAY },
  ]);
  const diego = customer("Diego", "Restrepo", "+51 913 404 120", null, "INSTAGRAM", "REQUESTED_RESERVATION", now - 1 * DAY, now - 38 * MIN, [
    { itemId: itCena.id, at: now - 40 * MIN },
  ]);
  const valentina = customer("Valentina", "Ríos", "+51 905 600 318", "vrios@correo.pe", "FACEBOOK", "CONFIRMED", now - 15 * DAY, now - 7 * DAY);
  const sinNombre = customer(null, null, "+51912345678", null, "WHATSAPP", "NEW", now - 40 * MIN, now - 40 * MIN);

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
  const requests: MockRequest[] = [];
  const reservations: MockReservation[] = [];
  let reqSeq = 400;
  let resSeq = 200;
  const year = new TZDate(now, MOCK_TIME_ZONE).getFullYear();

  const request = (
    num: number,
    c: MockCustomer,
    status: ReservationRequestStatus,
    at: number | null,
    people: number | null,
    itemRef: CommercialItem | null,
    comments: string | null,
    createdAgoMin: number,
    updatedAgoMin: number,
  ): MockRequest => {
    const r: MockRequest = {
      id: uuid(),
      code: `RES-${year}-${String(num).padStart(6, "0")}`,
      customerId: c.id,
      commercialItemId: itemRef?.id ?? null,
      sourceChannel: c.sourceChannel,
      reservationAt: at === null ? null : iso(at),
      numberOfPeople: people,
      quotedPrice: null,
      currency: null,
      comments,
      specialRequirements: null,
      status,
      createdAt: iso(now - createdAgoMin * MIN),
      updatedAt: iso(now - updatedAgoMin * MIN),
    };
    reqSeq = Math.max(reqSeq, num);
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
    resSeq += 1;
    const created = Math.min(now - 2 * HOUR, at - 2 * DAY);
    const r: MockReservation = {
      id: uuid(),
      code: `R-${new TZDate(created, MOCK_TIME_ZONE).getFullYear()}-${String(resSeq).padStart(6, "0")}`,
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

  // Escenarios del mockup (semana actual: 0 = lunes … 6 = domingo).
  request(461, maria, "WAITING_RESPONSE", weekDayAt(now, 4, "20:00"), 6, itCena, "Terraza. Cumpleaños, pide torta de chocolate.", 4, 2);
  request(460, diego, "WAITING_RESPONSE", weekDayAt(now, 5, "21:00"), 2, itCena, "Salón.", 45, 38);
  const reqAndrea = request(458, andrea, "ACCEPTED", weekDayAt(now, 5, "13:00"), 2, itAlmuerzo, "Salón.", 80, 66);
  request(455, jorge, "CANCELLED", dayOfYear(now, 7, 8, "20:00"), 4, itCena, "Salón principal. Cancelada por el cliente.", 72 * 24 * 60, 5 * 60);
  request(449, ricardo, "REJECTED", weekDayAt(now, 6, "14:00"), 8, itAlmuerzo, "Terraza. Sin cupo en terraza.", 28 * 60, 27 * 60);
  const reqValentina = request(447, valentina, "ACCEPTED", weekDayAt(now, 2, "19:30"), 4, itCena, "Salón. Silla para bebé.", 8 * 24 * 60, 8 * 24 * 60 - 8);
  const reqPaola = request(440, paola, "ACCEPTED", weekDayAt(now, 3, "19:00"), 3, itCena, "Salón.", 9 * 24 * 60, 9 * 24 * 60 - 12);
  const reqFelipe = request(438, felipe, "ACCEPTED", weekDayAt(now, 1, "13:30"), 5, itEjecutivo, "Salón. Factura a empresa.", 10 * 24 * 60, 10 * 24 * 60 - 5);
  request(431, camilaV, "REJECTED", weekDayAt(now, 0, "20:00"), 2, itCena, "Terraza.", 4 * 24 * 60, 4 * 24 * 60 - 41);
  request(312, jorge, "REJECTED", dayOfYear(now - 330 * DAY, 10, 2, "20:00"), 6, itCena, null, 345 * 24 * 60, 345 * 24 * 60);

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
  const conversations: MockConversation[] = [];
  const messages: Message[] = [];

  type Line = ["c" | "s" | "a", string, number, ...([string] | [])];
  const conversation = (
    c: MockCustomer,
    channel: ContactChannel,
    lines: Line[],
    opts: { unread?: number; paused?: boolean; assignee?: MockUser | null } = {},
  ): MockConversation => {
    const conv: MockConversation = {
      id: uuid(),
      customerId: c.id,
      channel,
      isAssistantPaused: opts.paused ?? false,
      assignedUserId: opts.assignee?.id ?? null,
      lastMessageAt: null,
      createdAt: iso(lines[0]![2]),
      updatedAt: iso(lines[lines.length - 1]![2]),
    };
    const inboundIdx = lines.map((l, i) => (l[0] === "c" ? i : -1)).filter((i) => i >= 0);
    const unreadFrom = inboundIdx.length - (opts.unread ?? 0);
    lines.forEach(([kind, text, at, authorId], index) => {
      const inbound = kind === "c";
      const inboundOrder = inboundIdx.indexOf(index);
      const unread = inbound && inboundOrder >= unreadFrom;
      messages.push({
        id: uuid(),
        conversationId: conv.id,
        channel,
        sequence: index + 1,
        externalMessageId: inbound ? `mock-in-${conv.id.slice(0, 8)}-${index}` : `mock-out-${conv.id.slice(0, 8)}-${index}`,
        direction: inbound ? "INBOUND" : "OUTBOUND",
        status: inbound ? "PROCESSED" : "DELIVERED",
        type: "TEXT",
        content: text,
        authorUserId: kind === "a" ? (authorId ?? operator.id) : null,
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
      });
    });
    conv.lastMessageAt = iso(lines[lines.length - 1]![2]);
    conversations.push(conv);
    return conv;
  };

  conversation(maria, "WHATSAPP", [
    ["c", "Hola, quiero reservar para el viernes en la noche, somos 6", now - 5 * MIN],
    ["s", "¡Hola María! Con gusto. Tenemos disponibilidad a las 19:30 o 20:00, en salón o terraza. ¿Cuál prefieres?", now - 5 * MIN + 20_000],
    ["c", "A las 8 en terraza. Es un cumpleaños, ¿pueden poner una torta?", now - 3 * MIN],
    ["s", "Perfecto. Podemos incluir torta de chocolate por S/ 45.00. Te confirmo: viernes, 20:00, 6 personas, terraza, con torta. ¿Es correcto?", now - 3 * MIN + 20_000],
    ["c", "Sí, perfecto", now - 2 * MIN],
    ["s", "Listo, envié tu solicitud. Te aviso apenas el restaurante la confirme.", now - 2 * MIN + 15_000],
  ], { unread: 2 });

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
  ], { unread: 1, paused: true, assignee: operator });

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

  conversation(ricardo, "INSTAGRAM", [
    ["c", "Reserva para 8 el domingo a las 2 en terraza", daysAgoAt(now, 1, "10:02")],
    ["s", "Ricardo, la terraza no tiene cupo ese horario. Puedo ofrecerte salón principal a las 14:00 o terraza a las 16:00.", daysAgoAt(now, 1, "10:30")],
    ["c", "No podré asistir, gracias", daysAgoAt(now, 1, "11:15")],
  ]);

  conversation(paola, "FACEBOOK", [
    ["c", "¿Me confirman la reserva del jueves?", daysAgoAt(now, 2, "09:10")],
    ["s", "Confirmado para el jueves a las 19:00, 3 personas.", daysAgoAt(now, 2, "09:22")],
    ["c", "Confirmado para el jueves, gracias", daysAgoAt(now, 2, "09:25")],
  ]);

  return {
    users,
    sessions: [],
    config,
    categories,
    items,
    customers,
    requests,
    reservations,
    conversations,
    messages,
    idempotency: new Map(),
    sequences: { request: reqSeq, reservation: resSeq },
  };
}
