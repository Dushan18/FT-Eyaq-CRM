/**
 * Lógica pura de Ajustes > Servicios: cómo se muestra cada servicio del catálogo y cómo se valida y arma
 * el alta mínima (POST /commercial-items). Reglas del backend: docs/backend/catalogo-clientes.md §3.1.
 */
import { ApiError } from "@/lib/api/client";
import type {
  CommercialApprovalStatus,
  CommercialItem,
  CommercialItemType,
  CommercialItemVariant,
  CreateCommercialItemRequest,
  Paginated,
} from "@/lib/api/types";
import { MONEY_PATTERN } from "@/lib/api/types";
import { TONES, type Tone } from "@/lib/domain/tones";
import { formatMoney } from "@/lib/format/money";

export const SERVICES_PAGE_SIZE = 50;
/** El backend acepta `page` entero entre 1 y 1.000.000; fuera de ese rango responde 400. */
export const MAX_PAGE = 1_000_000;

/** Página pedida en la URL (?pagina=), acotada a lo que acepta el backend. */
export function pageFromParam(value: string | null): number {
  const page = Math.floor(Number(value));
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/** Mismo patrón que COMMERCIAL_MONEY_PATTERN del backend (se define una sola vez en lib/api/types). */
export { MONEY_PATTERN };
export const NAME_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 5000;
/** Las condiciones pueden tener hasta 5000 caracteres; en la columna de precio solo cabe un resumen. */
export const CONDITIONS_PREVIEW_LENGTH = 60;

export const ITEM_TYPE_OPTIONS: ReadonlyArray<{ value: CommercialItemType; label: string }> = [
  { value: "SERVICE", label: "Servicio" },
  { value: "DISH", label: "Plato" },
  { value: "BEVERAGE", label: "Bebida" },
  { value: "PROMOTION", label: "Promoción" },
  { value: "EVENT", label: "Evento" },
];

/**
 * Platos y bebidas necesitan precio base o variantes activas (no ambos). El alta desde Ajustes no maneja
 * variantes, así que para estos tipos el precio base es obligatorio.
 */
export const PRICE_REQUIRED_TYPES: readonly CommercialItemType[] = ["DISH", "BEVERAGE"];

export function priceRequired(type: CommercialItemType): boolean {
  return PRICE_REQUIRED_TYPES.includes(type);
}

// ---------------------------------------------------------------- presentación de la lista

/** Nombre visible de la categoría embebida (varias categorías del seed solo tienen nombre en inglés). */
export function categoryName(item: Pick<CommercialItem, "category">): string {
  return item.category.nameEs ?? item.category.nameEn ?? "—";
}

export function itemDescription(item: Pick<CommercialItem, "descriptionEs" | "descriptionEn">): string | null {
  const text = (item.descriptionEs ?? item.descriptionEn)?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function variantName(variant: Pick<CommercialItemVariant, "nameEs" | "nameEn">): string {
  return variant.nameEs ?? variant.nameEn ?? "Variante";
}

/** Recorta un texto a `max` caracteres (incluido el "…"). */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export interface PriceView {
  /** base: precio base · from: menor variante activa · promo: precio promocional · conditions / none: sin precio. */
  kind: "base" | "from" | "promo" | "conditions" | "none";
  /** Texto completo de la celda ("S/ 38.00", "Desde S/ 14.00", "—"). */
  text: string;
  /** Importe formateado, sin el prefijo "Desde". */
  amount?: string;
  /** Detalle para el tooltip (variantes, texto completo de las condiciones). */
  title?: string;
}

/**
 * Precio que se muestra en la lista, en este orden: precio base; "Desde" la variante activa más barata;
 * precio promocional; condiciones (recortadas); "—".
 */
export function priceView(
  item: Pick<CommercialItem, "basePrice" | "variants" | "promotionDetail" | "conditions">,
  currency: string,
): PriceView {
  if (item.basePrice !== null && item.basePrice.trim() !== "") {
    const amount = formatMoney(item.basePrice, currency);
    return { kind: "base", text: amount, amount };
  }

  const active = item.variants
    .filter((v) => v.isActive && Number.isFinite(Number(v.price)))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  if (active.length > 0) {
    const cheapest = active.reduce((min, v) => (Number(v.price) < Number(min.price) ? v : min));
    const amount = formatMoney(cheapest.price, currency);
    return {
      kind: "from",
      text: `Desde ${amount}`,
      amount,
      title: active.map((v) => `${variantName(v)}: ${formatMoney(v.price, currency)}`).join(" · "),
    };
  }

  const promotional = item.promotionDetail?.promotionalPrice;
  if (promotional) {
    const amount = formatMoney(promotional, currency);
    return { kind: "promo", text: amount, amount, title: "Precio promocional" };
  }

  const conditions = item.conditions?.replace(/\s+/g, " ").trim();
  if (conditions) return { kind: "conditions", text: shorten(conditions, CONDITIONS_PREVIEW_LENGTH), title: conditions };

  return { kind: "none", text: "—" };
}

/** Insignia de aprobación: Samanta solo puede ofrecer servicios aprobados. */
export function approvalBadge(status: CommercialApprovalStatus): { label: string; tone: Tone } | null {
  if (status === "DRAFT") return { label: "Borrador", tone: TONES.amber };
  if (status === "REJECTED") return { label: "Rechazado", tone: TONES.red };
  return null;
}

/** Símbolo de la moneda tal como lo muestra formatMoney ("S/" para PEN). */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("es-PE", { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

// ---------------------------------------------------------------- formulario "Nuevo servicio"

export interface ServiceFormValues {
  nameEs: string;
  type: CommercialItemType;
  categoryId: string;
  /** Texto tal como lo escribe el usuario; se envía como string ("38.50"). */
  basePrice: string;
  descriptionEs: string;
}

export type ServiceFormErrors = Partial<Record<keyof ServiceFormValues, string>>;

export const EMPTY_SERVICE_FORM: ServiceFormValues = {
  nameEs: "",
  type: "SERVICE",
  categoryId: "",
  basePrice: "",
  descriptionEs: "",
};

export function validateServiceForm(values: ServiceFormValues): ServiceFormErrors {
  const errors: ServiceFormErrors = {};

  const name = values.nameEs.trim();
  if (!name) errors.nameEs = "Escribe el nombre en español.";
  else if (name.length > NAME_MAX_LENGTH) errors.nameEs = `Máximo ${NAME_MAX_LENGTH} caracteres.`;

  if (!values.categoryId) errors.categoryId = "Elige una categoría.";

  const price = values.basePrice.trim();
  if (!price) {
    if (priceRequired(values.type)) errors.basePrice = "El precio base es obligatorio para platos y bebidas.";
  } else if (!MONEY_PATTERN.test(price)) {
    errors.basePrice = price.includes(",")
      ? "Sin comas: escribe 1200 o 38.50 (punto para los decimales)."
      : "Escribe un importe válido, por ejemplo 38.50 (hasta 2 decimales).";
  }

  if (values.descriptionEs.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.descriptionEs = `Máximo ${DESCRIPTION_MAX_LENGTH} caracteres.`;
  }
  return errors;
}

/**
 * Cuerpo de POST /commercial-items: solo type, categoryId, nameEs, descriptionEs y basePrice, sin cadenas
 * vacías (el backend rechaza propiedades no declaradas y textos vacíos). Debe llamarse con valores validados.
 */
export function buildCreateItemBody(values: ServiceFormValues): CreateCommercialItemRequest {
  const body: CreateCommercialItemRequest = {
    type: values.type,
    categoryId: values.categoryId,
    nameEs: values.nameEs.trim(),
  };
  const description = values.descriptionEs.trim();
  if (description) body.descriptionEs = description;
  const price = values.basePrice.trim();
  if (price) body.basePrice = price;
  return body;
}

// ---------------------------------------------------------------- caché y errores

/** Aplica un cambio a un servicio dentro de una página del listado (actualización optimista). */
export function patchItemInPage(
  page: Paginated<CommercialItem> | undefined,
  id: string,
  patch: Partial<Pick<CommercialItem, "isActive" | "approvalStatus">>,
): Paginated<CommercialItem> | undefined {
  if (!page) return page;
  return { ...page, data: page.data.map((item) => (item.id === id ? { ...item, ...patch } : item)) };
}

/** Reemplaza un servicio por la versión que devolvió el backend. */
export function replaceItemInPage(
  page: Paginated<CommercialItem> | undefined,
  updated: CommercialItem,
): Paginated<CommercialItem> | undefined {
  if (!page) return page;
  return { ...page, data: page.data.map((item) => (item.id === updated.id ? updated : item)) };
}

function withPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Motivo de una acción fallida, tal como lo explica el backend. */
export function actionErrorText(error: unknown): string {
  if (error instanceof ApiError) return error.messages.map(withPeriod).join(" ");
  if (error instanceof Error && error.message) return withPeriod(error.message);
  return "Inténtalo de nuevo.";
}
