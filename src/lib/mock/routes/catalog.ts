/** Rutas simuladas de configuración del restaurante y catálogo comercial (Parte 02). */
import type {
  CommercialCategory,
  CommercialEventDetail,
  CommercialItem,
  CommercialItemFaq,
  CommercialItemImage,
  CommercialItemSchedule,
  CommercialItemVariant,
  CommercialPromotionDetail,
  DayOfWeek,
  RestaurantConfig,
} from "@/lib/api/types";
import { COMMERCIAL_ITEM_TYPES, DAYS_OF_WEEK } from "@/lib/api/types";
import {
  ADMIN,
  BodyCheck,
  HHMM_RE,
  READERS,
  boolParam,
  enumParam,
  fail,
  json,
  lower,
  normalizeName,
  pageParams,
  paginate,
  readQuery,
  requireBodyKeys,
  requireSomeField,
  searchParam,
  uuidParam,
  type Ctx,
  type Route,
} from "../http";
import { iso, uuid, type MockStore } from "../store";
import { categorySummary } from "../views";

// ---------------------------------------------------------------------------- categorías

function findCategory(store: MockStore, id: string): CommercialCategory {
  const cat = store.categories.find((c) => c.id === id);
  if (!cat) fail(404, "Categoría comercial no encontrada");
  return cat;
}

/** Cada elemento trae un resumen de su categoría: se mantiene al día al editarla. */
function syncCategorySummary(store: MockStore, cat: CommercialCategory) {
  for (const item of store.items) if (item.categoryId === cat.id) item.category = categorySummary(cat);
}

function readCategoryBody(ctx: Ctx) {
  const b = ctx.body;
  const check = new BodyCheck();
  check.only(b, ["nameEs", "nameEn", "descriptionEs", "descriptionEn", "displayOrder"]);
  const out = {
    nameEs: check.text("nameEs", b.nameEs, 150),
    nameEn: check.text("nameEn", b.nameEn, 150),
    descriptionEs: check.text("descriptionEs", b.descriptionEs, 2000),
    descriptionEn: check.text("descriptionEn", b.descriptionEn, 2000),
    displayOrder: check.int("displayOrder", b.displayOrder, 0, 1_000_000, { coerce: true, nullable: false }),
  };
  check.done();
  return out;
}

/** Nombres únicos normalizados y cruzados entre idiomas, contra las demás categorías (activas o no). */
function assertUniqueCategoryNames(store: MockStore, names: Array<string | null>, selfId: string | null) {
  const taken = new Set(
    store.categories.filter((c) => c.id !== selfId).flatMap((c) => [c.nameEs, c.nameEn].filter((n): n is string => !!n).map(normalizeName)),
  );
  if (names.some((n) => n && taken.has(normalizeName(n)))) fail(409, "Ya existe una categoría comercial con ese nombre");
}

// ---------------------------------------------------------------------------- elementos: validación del DTO

interface VariantIn {
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  price: string;
  isActive: boolean;
  displayOrder: number;
}
interface ImageIn {
  url: string;
  altTextEs: string | null;
  altTextEn: string | null;
  isPrimary: boolean;
  displayOrder: number;
}
interface FaqIn {
  questionEs: string;
  questionEn: string | null;
  answerEs: string;
  answerEn: string | null;
  displayOrder: number;
}
interface ScheduleIn {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
}
interface PromotionIn {
  validFrom: string | null;
  validUntil: string | null;
  promotionalPrice: string | null;
}
interface EventIn {
  startAt: string | null;
  endAt: string | null;
  capacity: number | null;
}

/** Campos validados; undefined = no se envió. */
interface ItemInput {
  nameEs?: string | null;
  nameEn?: string | null;
  descriptionEs?: string | null;
  descriptionEn?: string | null;
  basePrice?: string | null;
  displayOrder?: number;
  conditions?: string | null;
  internalNotes?: string | null;
  availabilityNote?: string | null;
  variants?: VariantIn[];
  images?: ImageIn[];
  faqs?: FaqIn[];
  schedules?: ScheduleIn[];
  promotionDetail?: PromotionIn | null;
  eventDetail?: EventIn | null;
}

const WRITABLE_ITEM_FIELDS = [
  "nameEs", "nameEn", "descriptionEs", "descriptionEn", "basePrice", "displayOrder", "conditions", "internalNotes",
  "availabilityNote", "variants", "images", "faqs", "schedules", "promotionDetail", "eventDetail",
] as const;

const URL_RE = /^https?:\/\/(?:[^\s/?#:@]+\.[A-Za-z]{2,63}|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:[/?#]\S*)?$/;

function nestedArray<T>(
  check: BodyCheck,
  key: string,
  value: unknown,
  max: number,
  each: (c: BodyCheck, el: Record<string, unknown>, index: number) => T,
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    const msgs = [`${key} must be an array`, `${key} must contain no more than ${max} elements`, `each value in nested property ${key} must be either object or array`];
    if (key === "schedules" && value === null) msgs.push("All schedules's elements must be unique");
    check.add(...msgs);
    return undefined;
  }
  if (value.length > max) check.add(`${key} must contain no more than ${max} elements`);
  const out: T[] = [];
  value.forEach((el, index) => {
    if (el === null || typeof el !== "object" || Array.isArray(el)) {
      check.add(`${key}.each value in nested property ${key} must be either object or array`);
      return;
    }
    out.push(each(check.child(`${key}.${index}.`), el as Record<string, unknown>, index));
  });
  return out;
}

function nestedObject(check: BodyCheck, key: string, value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object" || Array.isArray(value)) {
    check.add(`nested property ${key} must be either object or array`);
    return undefined;
  }
  return value as Record<string, unknown>;
}

function scheduleTime(c: BodyCheck, key: string, value: unknown): { ok: boolean; value: string | null } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    c.add(`${key} must be a string`, `${key} debe tener el formato HH:mm`);
    return { ok: false, value: null };
  }
  const t = value.trim();
  if (!HHMM_RE.test(t)) {
    c.add(`${key} debe tener el formato HH:mm`);
    return { ok: false, value: null };
  }
  return { ok: true, value: t };
}

function readItemFields(check: BodyCheck, b: Record<string, unknown>): ItemInput {
  const out: ItemInput = {
    nameEs: check.text("nameEs", b.nameEs, 200),
    nameEn: check.text("nameEn", b.nameEn, 200),
    descriptionEs: check.text("descriptionEs", b.descriptionEs, 5000),
    descriptionEn: check.text("descriptionEn", b.descriptionEn, 5000),
    basePrice: check.catalogMoney("basePrice", b.basePrice),
    displayOrder: check.int("displayOrder", b.displayOrder, 0, 1_000_000, { coerce: true, nullable: false }) ?? undefined,
    conditions: check.text("conditions", b.conditions, 5000),
    internalNotes: check.text("internalNotes", b.internalNotes, 5000),
    availabilityNote: check.text("availabilityNote", b.availabilityNote, 2000),
  };
  out.variants = nestedArray(check, "variants", b.variants, 50, (c, el, index) => {
    c.only(el, ["nameEs", "nameEn", "descriptionEs", "descriptionEn", "price", "isActive", "displayOrder"]);
    return {
      nameEs: c.text("nameEs", el.nameEs, 150) ?? null,
      nameEn: c.text("nameEn", el.nameEn, 150) ?? null,
      descriptionEs: c.text("descriptionEs", el.descriptionEs, 2000) ?? null,
      descriptionEn: c.text("descriptionEn", el.descriptionEn, 2000) ?? null,
      price: c.catalogMoney("price", el.price, { required: true }) ?? "0.00",
      isActive: c.bool("isActive", el.isActive) ?? true,
      displayOrder: c.int("displayOrder", el.displayOrder, 0, 1_000_000, { coerce: true }) ?? index,
    };
  });
  out.images = nestedArray(check, "images", b.images, 20, (c, el, index) => {
    c.only(el, ["url", "altTextEs", "altTextEn", "isPrimary", "displayOrder"]);
    const url = typeof el.url === "string" ? el.url.trim() : null;
    const msgs: string[] = [];
    if (url === null || !URL_RE.test(url)) msgs.push("url must be a URL address");
    if (url === null || url.length > 2048) msgs.push("url must be shorter than or equal to 2048 characters");
    c.add(...msgs);
    return {
      url: url ?? "",
      altTextEs: c.text("altTextEs", el.altTextEs, 300) ?? null,
      altTextEn: c.text("altTextEn", el.altTextEn, 300) ?? null,
      isPrimary: c.bool("isPrimary", el.isPrimary) ?? false,
      displayOrder: c.int("displayOrder", el.displayOrder, 0, 1_000_000, { coerce: true }) ?? index,
    };
  });
  out.faqs = nestedArray(check, "faqs", b.faqs, 50, (c, el, index) => {
    c.only(el, ["questionEs", "questionEn", "answerEs", "answerEn", "displayOrder"]);
    return {
      questionEs: c.text("questionEs", el.questionEs, 500, { required: true }) ?? "",
      questionEn: c.text("questionEn", el.questionEn, 500) ?? null,
      answerEs: c.text("answerEs", el.answerEs, 5000, { required: true }) ?? "",
      answerEn: c.text("answerEn", el.answerEn, 5000) ?? null,
      displayOrder: c.int("displayOrder", el.displayOrder, 0, 1_000_000, { coerce: true }) ?? index,
    };
  });
  out.schedules = nestedArray(check, "schedules", b.schedules, 7, (c, el) => {
    c.only(el, ["dayOfWeek", "isAvailable", "startTime", "endTime"]);
    const dayOfWeek = c.enumOf("dayOfWeek", el.dayOfWeek, DAYS_OF_WEEK, { required: true });
    const isAvailable = c.bool("isAvailable", el.isAvailable, { required: true });
    const start = scheduleTime(c, "startTime", el.startTime);
    const end = scheduleTime(c, "endTime", el.endTime);
    if (typeof isAvailable === "boolean") {
      const coherent = isAvailable
        ? start.ok && end.ok && start.value !== null && end.value !== null && start.value !== end.value
        : el.startTime == null && el.endTime == null;
      if (!coherent) c.add("Un horario disponible requiere startTime y endTime distintos en formato HH:mm; un horario no disponible no admite horas");
    }
    return { dayOfWeek: dayOfWeek ?? "MONDAY", isAvailable: isAvailable ?? false, startTime: start.value, endTime: end.value };
  });
  if (out.schedules && Array.isArray(b.schedules)) {
    const days = (b.schedules as Array<Record<string, unknown> | null>).map((s) => s?.dayOfWeek).filter((d) => d !== undefined);
    if (new Set(days).size !== days.length) check.add("All schedules's elements must be unique");
  }
  const promo = nestedObject(check, "promotionDetail", b.promotionDetail);
  if (promo === null) out.promotionDetail = null;
  else if (promo) {
    const c = check.child("promotionDetail.");
    c.only(promo, ["validFrom", "validUntil", "promotionalPrice"]);
    out.promotionDetail = {
      validFrom: c.catalogInstant("validFrom", promo.validFrom) ?? null,
      validUntil: c.catalogInstant("validUntil", promo.validUntil) ?? null,
      promotionalPrice: c.catalogMoney("promotionalPrice", promo.promotionalPrice) ?? null,
    };
  }
  const event = nestedObject(check, "eventDetail", b.eventDetail);
  if (event === null) out.eventDetail = null;
  else if (event) {
    const c = check.child("eventDetail.");
    c.only(event, ["startAt", "endAt", "capacity"]);
    out.eventDetail = {
      startAt: c.catalogInstant("startAt", event.startAt) ?? null,
      endAt: c.catalogInstant("endAt", event.endAt) ?? null,
      capacity: c.int("capacity", event.capacity, 1, 1_000_000, { coerce: true }) ?? null,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------- elementos: reglas del servicio

function assertItemNames(nameEs: string | null, nameEn: string | null) {
  if (!nameEs && !nameEn) fail(400, "El elemento comercial debe tener al menos un nombre en español o inglés");
}

function assertVariants(variants: VariantIn[] | undefined) {
  if (!variants) return;
  if (variants.some((v) => !v.nameEs && !v.nameEn)) fail(400, "Cada variante debe tener al menos un nombre en español o inglés");
  const names = variants.map((v) => normalizeName(v.nameEs ?? v.nameEn));
  if (new Set(names).size !== names.length) fail(400, "Las variantes no pueden duplicarse");
}

function assertImages(images: ImageIn[] | undefined) {
  if (!images) return;
  if (new Set(images.map((i) => i.url)).size !== images.length) fail(400, "Las imágenes no pueden duplicarse");
  if (images.filter((i) => i.isPrimary).length > 1) fail(400, "Un elemento comercial solo puede tener una imagen principal");
}

function assertDetailRanges(input: ItemInput) {
  const p = input.promotionDetail;
  if (p?.validFrom && p.validUntil && Date.parse(p.validFrom) > Date.parse(p.validUntil)) fail(400, "validFrom no puede ser posterior a validUntil");
  const e = input.eventDetail;
  if (e?.startAt && e.endAt && Date.parse(e.startAt) > Date.parse(e.endAt)) fail(400, "startAt no puede ser posterior a endAt");
}

/** DISH y BEVERAGE: precio base o variantes activas, nunca los dos ni ninguno. */
function assertPriceRule(type: CommercialItem["type"], basePrice: string | null, activeVariants: number) {
  if ((type === "DISH" || type === "BEVERAGE") && (basePrice !== null) === activeVariants > 0) {
    fail(400, "Un plato o bebida debe tener un precio base o variantes activas, pero no ambos");
  }
}

function assertDetailTypes(type: CommercialItem["type"], input: ItemInput) {
  if (input.promotionDetail && type !== "PROMOTION") fail(400, "promotionDetail solo corresponde a elementos PROMOTION");
  if (input.eventDetail && type !== "EVENT") fail(400, "eventDetail solo corresponde a elementos EVENT");
}

function usableCategory(store: MockStore, id: string): CommercialCategory {
  const cat = store.categories.find((c) => c.id === id);
  if (!cat) fail(400, "La categoría comercial no existe");
  if (!cat.isActive) fail(400, "La categoría comercial está inactiva");
  return cat;
}

const DAY_ORDER: readonly string[] = DAYS_OF_WEEK;
const byOrder = <T extends { displayOrder: number; createdAt: string }>(a: T, b: T) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt);

function buildVariants(list: VariantIn[], now: string): CommercialItemVariant[] {
  return list.map((v) => ({ id: uuid(), ...v, createdAt: now, updatedAt: now })).sort(byOrder);
}
function buildImages(list: ImageIn[], now: string): CommercialItemImage[] {
  return list.map((i) => ({ id: uuid(), ...i, createdAt: now })).sort(byOrder);
}
function buildFaqs(list: FaqIn[], now: string): CommercialItemFaq[] {
  return list.map((f) => ({ id: uuid(), ...f, createdAt: now, updatedAt: now })).sort(byOrder);
}
function buildSchedules(list: ScheduleIn[]): CommercialItemSchedule[] {
  return list
    .map((s) => ({ id: uuid(), dayOfWeek: s.dayOfWeek, isAvailable: s.isAvailable, startTime: s.isAvailable ? s.startTime : null, endTime: s.isAvailable ? s.endTime : null }))
    .sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek));
}
function buildPromotion(input: PromotionIn, current: CommercialPromotionDetail | null, now: string): CommercialPromotionDetail {
  return { id: current?.id ?? uuid(), ...input, createdAt: current?.createdAt ?? now, updatedAt: now };
}
function buildEvent(input: EventIn, current: CommercialEventDetail | null, now: string): CommercialEventDetail {
  return { id: current?.id ?? uuid(), ...input, createdAt: current?.createdAt ?? now, updatedAt: now };
}

function findItem(store: MockStore, id: string): CommercialItem {
  const item = store.items.find((i) => i.id === id);
  if (!item) fail(404, "Elemento comercial no encontrado");
  return item;
}

// ---------------------------------------------------------------------------- rutas

export const catalogRoutes: Route[] = [
  // ------------------------------------------------------------------ configuración
  {
    method: "GET",
    pattern: "/restaurant-config",
    access: READERS,
    handler: (ctx) => {
      if (!ctx.store.config) fail(404, "Configuración del restaurante no encontrada");
      return json(200, ctx.store.config);
    },
  },
  {
    method: "PUT",
    pattern: "/restaurant-config",
    access: ADMIN,
    handler: (ctx) => {
      const keys = [
        "businessName", "logoUrl", "description", "address", "latitude", "longitude", "whatsappNumber", "email", "website",
        "currency", "timeZone", "reservationPolicy", "cancellationPolicy", "responseTimeoutMinutes", "approvalResponsibleId",
        "languages", "schedules",
      ];
      requireBodyKeys(ctx, keys, ["businessName", "address", "whatsappNumber", "email", "currency", "timeZone", "reservationPolicy", "cancellationPolicy", "responseTimeoutMinutes", "languages", "schedules"]);
      const b = ctx.body as Record<string, unknown>;
      const errors: string[] = [];
      if (!/^\+[1-9]\d{7,14}$/.test(String(b.whatsappNumber))) errors.push("whatsappNumber debe usar formato internacional E.164");
      if (!["PEN", "USD"].includes(String(b.currency))) errors.push("currency must be one of the following values: PEN, USD");
      const timeout = Number(b.responseTimeoutMinutes);
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > 1440) errors.push("responseTimeoutMinutes must not be greater than 1440");
      const schedules = Array.isArray(b.schedules) ? (b.schedules as Array<Record<string, unknown>>) : [];
      if (schedules.length !== 7 || new Set(schedules.map((s) => s.dayOfWeek)).size !== 7) {
        errors.push("schedules debe contener exactamente una entrada para cada día de la semana");
      }
      schedules.forEach((s, i) => {
        if (s.isOpen) {
          const okFormat = [s.openTime, s.closeTime].every((t) => typeof t === "string" && HHMM_RE.test(t));
          if (!okFormat || String(s.openTime) >= String(s.closeTime)) {
            errors.push(`schedules.${i}.isOpen Un día abierto requiere openTime y closeTime en formato HH:mm, con apertura anterior al cierre; un día cerrado no admite horas`);
          }
        } else if (s.openTime || s.closeTime) {
          errors.push(`schedules.${i}.isOpen Un día abierto requiere openTime y closeTime en formato HH:mm, con apertura anterior al cierre; un día cerrado no admite horas`);
        }
      });
      for (const key of ["logoUrl", "website"]) {
        const v = b[key];
        if (v !== null && v !== undefined && !/^https?:\/\/[^\s/]+\.[^\s/]+/.test(String(v))) errors.push(`${key} must be a URL address`);
      }
      if (errors.length) fail(400, errors);
      let responsible: RestaurantConfig["approvalResponsible"] = null;
      if (b.approvalResponsibleId) {
        const u = ctx.store.users.find((x) => x.id === b.approvalResponsibleId);
        if (!u) fail(400, "El responsable de aprobación no existe");
        if (!u.isActive) fail(400, "El responsable de aprobación debe estar activo");
        if (!u.roles.includes("OWNER")) fail(400, "El responsable de aprobación debe tener el rol OWNER");
        responsible = { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email };
      }
      const now = iso(Date.now());
      const config: RestaurantConfig = {
        id: ctx.store.config?.id ?? uuid(),
        businessName: String(b.businessName).trim(),
        logoUrl: (b.logoUrl as string | null) ?? null,
        description: (b.description as string | null) ?? null,
        address: String(b.address).trim(),
        latitude: (b.latitude as number | null) ?? null,
        longitude: (b.longitude as number | null) ?? null,
        whatsappNumber: String(b.whatsappNumber),
        email: lower(String(b.email)).trim(),
        website: (b.website as string | null) ?? null,
        currency: b.currency as RestaurantConfig["currency"],
        timeZone: String(b.timeZone),
        reservationPolicy: String(b.reservationPolicy),
        cancellationPolicy: String(b.cancellationPolicy),
        responseTimeoutMinutes: timeout,
        approvalResponsibleId: responsible?.id ?? null,
        approvalResponsible: responsible,
        languages: ["ES", "EN", "PT"].filter((l) => (b.languages as string[]).includes(l)) as RestaurantConfig["languages"],
        schedules: [...schedules]
          .sort((x, y) => DAY_ORDER.indexOf(String(x.dayOfWeek)) - DAY_ORDER.indexOf(String(y.dayOfWeek)))
          .map((s) => ({
            dayOfWeek: s.dayOfWeek as RestaurantConfig["schedules"][number]["dayOfWeek"],
            isOpen: Boolean(s.isOpen),
            openTime: s.isOpen ? String(s.openTime) : null,
            closeTime: s.isOpen ? String(s.closeTime) : null,
          })),
        createdAt: ctx.store.config?.createdAt ?? now,
        updatedAt: now,
      };
      ctx.store.config = config;
      return json(200, config);
    },
  },

  // ------------------------------------------------------------------ categorías
  {
    method: "GET",
    pattern: "/commercial-categories",
    access: READERS,
    handler: (ctx) =>
      json(
        200,
        [...ctx.store.categories].sort(
          (a, b) => a.displayOrder - b.displayOrder || (a.nameEs ?? "").localeCompare(b.nameEs ?? "") || (a.nameEn ?? "").localeCompare(b.nameEn ?? ""),
        ),
      ),
  },
  {
    method: "POST",
    pattern: "/commercial-categories",
    access: ADMIN,
    handler: (ctx) => {
      const input = readCategoryBody(ctx);
      const nameEs = input.nameEs ?? null;
      const nameEn = input.nameEn ?? null;
      if (!nameEs && !nameEn) fail(400, "La categoría debe tener al menos un nombre en español o inglés");
      assertUniqueCategoryNames(ctx.store, [nameEs, nameEn], null);
      const now = iso(Date.now());
      const category: CommercialCategory = {
        id: uuid(),
        nameEs,
        nameEn,
        descriptionEs: input.descriptionEs ?? null,
        descriptionEn: input.descriptionEn ?? null,
        isActive: true,
        displayOrder: input.displayOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      ctx.store.categories.push(category);
      return json(201, category);
    },
  },
  {
    method: "GET",
    pattern: "/commercial-categories/:id",
    access: READERS,
    handler: (ctx) => json(200, findCategory(ctx.store, ctx.params.id!)),
  },
  {
    method: "PATCH",
    pattern: "/commercial-categories/:id",
    access: ADMIN,
    handler: (ctx) => {
      const input = readCategoryBody(ctx);
      requireSomeField(ctx.body, "Debes proporcionar al menos un campo para actualizar");
      const cat = findCategory(ctx.store, ctx.params.id!);
      const nameEs = input.nameEs === undefined ? cat.nameEs : input.nameEs;
      const nameEn = input.nameEn === undefined ? cat.nameEn : input.nameEn;
      if (!nameEs && !nameEn) fail(400, "La categoría debe tener al menos un nombre en español o inglés");
      assertUniqueCategoryNames(ctx.store, [nameEs, nameEn], cat.id);
      cat.nameEs = nameEs;
      cat.nameEn = nameEn;
      if (input.descriptionEs !== undefined) cat.descriptionEs = input.descriptionEs;
      if (input.descriptionEn !== undefined) cat.descriptionEn = input.descriptionEn;
      if (input.displayOrder !== undefined && input.displayOrder !== null) cat.displayOrder = input.displayOrder;
      cat.updatedAt = iso(Date.now());
      syncCategorySummary(ctx.store, cat);
      return json(200, cat);
    },
  },
  {
    method: "PATCH",
    pattern: "/commercial-categories/:id/status",
    access: ADMIN,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["isActive"]);
      const isActive = check.bool("isActive", ctx.body.isActive, { required: true });
      check.done();
      const cat = findCategory(ctx.store, ctx.params.id!);
      cat.isActive = isActive!;
      cat.updatedAt = iso(Date.now());
      syncCategorySummary(ctx.store, cat);
      return json(200, cat);
    },
  },

  // ------------------------------------------------------------------ elementos
  {
    method: "GET",
    pattern: "/commercial-items",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "type", "approvalStatus", "isActive", "categoryId", "search", "sort", "order"]);
      const { page, limit } = pageParams(ctx, 20);
      const type = enumParam(ctx, "type", COMMERCIAL_ITEM_TYPES);
      const approval = enumParam(ctx, "approvalStatus", ["DRAFT", "APPROVED", "REJECTED"] as const);
      const isActive = boolParam(ctx, "isActive");
      const categoryId = uuidParam(ctx, "categoryId");
      const search = searchParam(ctx);
      const sort = enumParam(ctx, "sort", ["category", "name", "createdAt"] as const) ?? "createdAt";
      const order = enumParam(ctx, "order", ["asc", "desc"] as const) ?? "desc";
      let rows = ctx.store.items.filter(
        (i) =>
          (!type || i.type === type) &&
          (!approval || i.approvalStatus === approval) &&
          (isActive === undefined || i.isActive === isActive) &&
          (!categoryId || i.categoryId === categoryId) &&
          (!search || [i.nameEs, i.nameEn, i.descriptionEs, i.descriptionEn].some((f) => lower(f).includes(lower(search)))),
      );
      const dir = order === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        if (sort === "category") return dir * (a.category.displayOrder - b.category.displayOrder || a.displayOrder - b.displayOrder || lower(a.nameEs).localeCompare(lower(b.nameEs)));
        if (sort === "name") return dir * lower(a.nameEs ?? a.nameEn).localeCompare(lower(b.nameEs ?? b.nameEn));
        return dir * a.createdAt.localeCompare(b.createdAt);
      });
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "POST",
    pattern: "/commercial-items",
    access: ADMIN,
    handler: (ctx) => {
      const b = ctx.body;
      const check = new BodyCheck();
      check.only(b, ["type", "categoryId", ...WRITABLE_ITEM_FIELDS]);
      const type = check.enumOf("type", b.type, COMMERCIAL_ITEM_TYPES, { required: true });
      const categoryId = check.uuid("categoryId", b.categoryId, { required: true });
      const input = readItemFields(check, b);
      check.done();

      const nameEs = input.nameEs ?? null;
      const nameEn = input.nameEn ?? null;
      assertItemNames(nameEs, nameEn);
      assertVariants(input.variants);
      assertImages(input.images);
      assertDetailRanges(input);
      const basePrice = input.basePrice ?? null;
      assertPriceRule(type!, basePrice, (input.variants ?? []).filter((v) => v.isActive).length);
      assertDetailTypes(type!, input);
      const cat = usableCategory(ctx.store, categoryId!);

      const now = iso(Date.now());
      const item: CommercialItem = {
        id: uuid(),
        type: type!,
        categoryId: cat.id,
        nameEs,
        nameEn,
        descriptionEs: input.descriptionEs ?? null,
        descriptionEn: input.descriptionEn ?? null,
        basePrice,
        displayOrder: input.displayOrder ?? 0,
        isActive: true,
        approvalStatus: "DRAFT",
        conditions: input.conditions ?? null,
        internalNotes: input.internalNotes ?? null,
        availabilityNote: input.availabilityNote ?? null,
        createdAt: now,
        updatedAt: now,
        category: categorySummary(cat),
        variants: buildVariants(input.variants ?? [], now),
        images: buildImages(input.images ?? [], now),
        faqs: buildFaqs(input.faqs ?? [], now),
        schedules: buildSchedules(input.schedules ?? []),
        promotionDetail: input.promotionDetail ? buildPromotion(input.promotionDetail, null, now) : null,
        eventDetail: input.eventDetail ? buildEvent(input.eventDetail, null, now) : null,
      };
      ctx.store.items.push(item);
      return json(201, item);
    },
  },
  {
    method: "GET",
    pattern: "/commercial-items/:id",
    access: READERS,
    handler: (ctx) => json(200, findItem(ctx.store, ctx.params.id!)),
  },
  {
    method: "PATCH",
    pattern: "/commercial-items/:id",
    access: ADMIN,
    handler: (ctx) => {
      const b = ctx.body;
      const check = new BodyCheck();
      check.only(b, ["categoryId", ...WRITABLE_ITEM_FIELDS]);
      const categoryId = check.uuid("categoryId", b.categoryId, { nullable: false });
      const input = readItemFields(check, b);
      check.done();
      requireSomeField(b, "Debes proporcionar al menos un campo para actualizar");
      const item = findItem(ctx.store, ctx.params.id!);

      // Orden del servicio: categoría, nombres, variantes, precio, tipo de detalle, imágenes, horarios y fechas.
      const cat = categoryId ? usableCategory(ctx.store, categoryId) : null;
      const nameEs = input.nameEs === undefined ? item.nameEs : input.nameEs;
      const nameEn = input.nameEn === undefined ? item.nameEn : input.nameEn;
      assertItemNames(nameEs, nameEn);
      assertVariants(input.variants);
      const basePrice = input.basePrice === undefined ? item.basePrice : input.basePrice;
      const activeVariants = input.variants ? input.variants.filter((v) => v.isActive).length : item.variants.filter((v) => v.isActive).length;
      assertPriceRule(item.type, basePrice, activeVariants);
      assertDetailTypes(item.type, input);
      assertImages(input.images);
      assertDetailRanges(input);

      const now = iso(Date.now());
      if (cat) {
        item.categoryId = cat.id;
        item.category = categorySummary(cat);
      }
      item.nameEs = nameEs;
      item.nameEn = nameEn;
      item.basePrice = basePrice;
      for (const key of ["descriptionEs", "descriptionEn", "conditions", "internalNotes", "availabilityNote"] as const) {
        if (input[key] !== undefined) item[key] = input[key] ?? null;
      }
      if (input.displayOrder !== undefined) item.displayOrder = input.displayOrder;
      // Cada array enviado reemplaza la lista completa, con ids nuevos.
      if (input.variants) item.variants = buildVariants(input.variants, now);
      if (input.images) item.images = buildImages(input.images, now);
      if (input.faqs) item.faqs = buildFaqs(input.faqs, now);
      if (input.schedules) item.schedules = buildSchedules(input.schedules);
      // Un objeto actualiza el detalle (conserva su id); null lo elimina.
      if (input.promotionDetail !== undefined) item.promotionDetail = input.promotionDetail ? buildPromotion(input.promotionDetail, item.promotionDetail, now) : null;
      if (input.eventDetail !== undefined) item.eventDetail = input.eventDetail ? buildEvent(input.eventDetail, item.eventDetail, now) : null;
      // Editar un elemento aprobado lo devuelve a borrador (deja de verlo Samanta).
      if (item.approvalStatus === "APPROVED") item.approvalStatus = "DRAFT";
      item.updatedAt = now;
      return json(200, item);
    },
  },
  {
    method: "PATCH",
    pattern: "/commercial-items/:id/status",
    access: ADMIN,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["isActive"]);
      const isActive = check.bool("isActive", ctx.body.isActive, { required: true });
      check.done();
      const item = findItem(ctx.store, ctx.params.id!);
      item.isActive = isActive!;
      item.updatedAt = iso(Date.now());
      return json(200, item);
    },
  },
  {
    method: "PATCH",
    pattern: "/commercial-items/:id/approval",
    access: ADMIN,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["approvalStatus"]);
      const status = check.enumOf("approvalStatus", ctx.body.approvalStatus, ["DRAFT", "APPROVED", "REJECTED"] as const, { required: true });
      check.done();
      const item = findItem(ctx.store, ctx.params.id!);
      if (status === "APPROVED") {
        if (!item.nameEs?.trim()) fail(400, "El elemento necesita un nombre en español antes de aprobarse");
        if (!item.category.isActive) fail(400, "No se puede aprobar un elemento de una categoría inactiva");
      }
      item.approvalStatus = status!;
      item.updatedAt = iso(Date.now());
      return json(200, item);
    },
  },
];
