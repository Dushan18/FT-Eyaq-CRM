import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { CommercialItem, CommercialItemVariant, Paginated } from "@/lib/api/types";
import { TONES } from "@/lib/domain/tones";
import { formatMoney } from "@/lib/format/money";
import {
  CONDITIONS_PREVIEW_LENGTH,
  EMPTY_SERVICE_FORM,
  actionErrorText,
  approvalBadge,
  buildCreateItemBody,
  categoryName,
  currencySymbol,
  itemDescription,
  pageFromParam,
  patchItemInPage,
  priceView,
  replaceItemInPage,
  validateServiceForm,
  type ServiceFormValues,
} from "./servicios-logic";

/** Intl usa un espacio duro entre el símbolo y el importe ("S/ 38.00"). */
const plain = (text: string | undefined) => text?.replace(/ /g, " ");

const CATEGORY = { id: "c1", nameEs: "Parrillas", nameEn: null, isActive: true, displayOrder: 1 };

function variant(price: string, isActive: boolean, displayOrder: number, nameEs: string | null = null, nameEn: string | null = null): CommercialItemVariant {
  return {
    id: `v-${price}-${displayOrder}`,
    nameEs,
    nameEn,
    descriptionEs: null,
    descriptionEn: null,
    price,
    isActive,
    displayOrder,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  };
}

function makeItem(overrides: Partial<CommercialItem> = {}): CommercialItem {
  return {
    id: "i1",
    type: "DISH",
    categoryId: CATEGORY.id,
    nameEs: "Lomo al grill",
    nameEn: null,
    descriptionEs: "Con papas nativas",
    descriptionEn: null,
    basePrice: null,
    displayOrder: 0,
    isActive: true,
    approvalStatus: "APPROVED",
    conditions: null,
    internalNotes: null,
    availabilityNote: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    category: CATEGORY,
    variants: [],
    images: [],
    faqs: [],
    schedules: [],
    promotionDetail: null,
    eventDetail: null,
    ...overrides,
  };
}

describe("precio mostrado en la lista", () => {
  it("usa el precio base con la moneda del restaurante", () => {
    const view = priceView(makeItem({ basePrice: "38.00" }), "PEN");
    expect(view.kind).toBe("base");
    expect(plain(view.text)).toBe("S/ 38.00");
    expect(view.text).toBe(formatMoney("38.00", "PEN"));
  });

  it("usa la moneda configurada (USD)", () => {
    const view = priceView(makeItem({ basePrice: "38.00" }), "USD");
    expect(view.text).toBe(formatMoney("38.00", "USD"));
    expect(view.text).not.toContain("S/");
  });

  it("sin precio base muestra «Desde» la variante activa más barata e ignora las inactivas", () => {
    const view = priceView(
      makeItem({
        variants: [
          variant("17.00", true, 1, null, "With Milk"),
          variant("9.00", false, 2, "Promo vieja"),
          variant("14.00", true, 0, null, "Without Milk"),
        ],
      }),
      "PEN",
    );
    expect(view.kind).toBe("from");
    expect(plain(view.text)).toBe("Desde S/ 14.00");
    expect(plain(view.amount)).toBe("S/ 14.00");
    // El detalle lista las variantes activas en su orden.
    expect(plain(view.title)).toBe("Without Milk: S/ 14.00 · With Milk: S/ 17.00");
  });

  it("el precio base tiene prioridad sobre las variantes", () => {
    const view = priceView(makeItem({ basePrice: "20.00", variants: [variant("5.00", true, 0)] }), "PEN");
    expect(plain(view.text)).toBe("S/ 20.00");
  });

  it("si solo hay variantes inactivas no muestra «Desde»", () => {
    const view = priceView(makeItem({ variants: [variant("5.00", false, 0)] }), "PEN");
    expect(view.kind).toBe("none");
  });

  it("sin base ni variantes usa el precio promocional", () => {
    const view = priceView(
      makeItem({ type: "PROMOTION", promotionDetail: { promotionalPrice: "30.00", validFrom: null, validUntil: null } }),
      "PEN",
    );
    expect(view.kind).toBe("promo");
    expect(plain(view.text)).toBe("S/ 30.00");
  });

  it("sin ningún precio muestra las condiciones recortadas, con el texto completo en el detalle", () => {
    const short = priceView(makeItem({ type: "SERVICE", conditions: "  Consumo mínimo\nS/ 1,200.00 " }), "PEN");
    expect(short).toEqual({ kind: "conditions", text: "Consumo mínimo S/ 1,200.00", title: "Consumo mínimo S/ 1,200.00" });

    const long = "Consumo mínimo de S/ 1,200.00 por evento, con reserva previa de 48 horas y abono del 30% del total";
    const view = priceView(makeItem({ type: "SERVICE", conditions: long }), "PEN");
    expect(view.text.length).toBeLessThanOrEqual(CONDITIONS_PREVIEW_LENGTH);
    expect(view.text.endsWith("…")).toBe(true);
    expect(long.startsWith(view.text.slice(0, -1))).toBe(true);
    expect(view.title).toBe(long);
  });

  it("sin precio ni condiciones muestra «—»", () => {
    expect(priceView(makeItem({ type: "SERVICE", conditions: "   " }), "PEN")).toEqual({ kind: "none", text: "—" });
    expect(priceView(makeItem({ type: "SERVICE", promotionDetail: { promotionalPrice: null, validFrom: null, validUntil: null } }), "PEN").text).toBe("—");
  });
});

describe("textos de la fila", () => {
  it("usa el nombre de categoría en español o, si no hay, en inglés", () => {
    expect(categoryName(makeItem())).toBe("Parrillas");
    expect(categoryName(makeItem({ category: { ...CATEGORY, nameEs: null, nameEn: "BEER" } }))).toBe("BEER");
  });

  it("descripción en una sola línea y null si está vacía", () => {
    expect(itemDescription(makeItem({ descriptionEs: "Res,\n cerdo y pollo" }))).toBe("Res, cerdo y pollo");
    expect(itemDescription(makeItem({ descriptionEs: null, descriptionEn: "(750ml)red" }))).toBe("(750ml)red");
    expect(itemDescription(makeItem({ descriptionEs: null }))).toBeNull();
  });

  it("insignia de aprobación solo para borrador y rechazado", () => {
    expect(approvalBadge("DRAFT")).toEqual({ label: "Borrador", tone: TONES.amber });
    expect(approvalBadge("REJECTED")).toEqual({ label: "Rechazado", tone: TONES.red });
    expect(approvalBadge("APPROVED")).toBeNull();
  });

  it("símbolo de la moneda para la etiqueta del precio", () => {
    expect(currencySymbol("PEN")).toBe("S/");
  });
});

describe("validación del formulario de servicio", () => {
  const valid: ServiceFormValues = { ...EMPTY_SERVICE_FORM, nameEs: "Cata de vinos", categoryId: "c1" };

  it("un servicio sin precio es válido", () => {
    expect(validateServiceForm(valid)).toEqual({});
  });

  it("exige nombre en español (sin solo espacios) y categoría", () => {
    const errors = validateServiceForm({ ...EMPTY_SERVICE_FORM, nameEs: "   " });
    expect(errors.nameEs).toBeTruthy();
    expect(errors.categoryId).toBeTruthy();
  });

  it("limita el nombre a 200 caracteres", () => {
    expect(validateServiceForm({ ...valid, nameEs: "a".repeat(200) }).nameEs).toBeUndefined();
    expect(validateServiceForm({ ...valid, nameEs: "a".repeat(201) }).nameEs).toBe("Máximo 200 caracteres.");
  });

  it("el precio base es obligatorio para platos y bebidas", () => {
    expect(validateServiceForm({ ...valid, type: "DISH" }).basePrice).toBe("El precio base es obligatorio para platos y bebidas.");
    expect(validateServiceForm({ ...valid, type: "BEVERAGE", basePrice: "  " }).basePrice).toBeTruthy();
    expect(validateServiceForm({ ...valid, type: "DISH", basePrice: "38.50" })).toEqual({});
    for (const type of ["SERVICE", "PROMOTION", "EVENT"] as const) {
      expect(validateServiceForm({ ...valid, type }).basePrice).toBeUndefined();
    }
  });

  it("acepta solo el formato de dinero del backend", () => {
    for (const ok of ["0", "7", "38", "38.5", "38.50", "0.99", "99999999.99", " 45.00 "]) {
      expect(validateServiceForm({ ...valid, basePrice: ok }).basePrice, ok).toBeUndefined();
    }
    for (const bad of ["38,50", "1,200", "-5", "012", "38.505", "123456789", "S/ 38", ".5", "38.", "1e3", "abc"]) {
      expect(validateServiceForm({ ...valid, basePrice: bad }).basePrice, bad).toBeTruthy();
    }
  });

  it("explica que no se usan comas", () => {
    expect(validateServiceForm({ ...valid, basePrice: "1,200" }).basePrice).toContain("Sin comas");
  });

  it("limita la descripción a 5000 caracteres", () => {
    expect(validateServiceForm({ ...valid, descriptionEs: "a".repeat(5001) }).descriptionEs).toBe("Máximo 5000 caracteres.");
  });
});

describe("cuerpo de POST /commercial-items", () => {
  it("envía solo los campos con valor, recortados", () => {
    const body = buildCreateItemBody({
      nameEs: "  Cata de vinos ",
      type: "EVENT",
      categoryId: "c1",
      basePrice: "",
      descriptionEs: "   ",
    });
    expect(body).toEqual({ type: "EVENT", categoryId: "c1", nameEs: "Cata de vinos" });
    expect("basePrice" in body).toBe(false);
    expect("descriptionEs" in body).toBe(false);
  });

  it("incluye precio (como texto) y descripción cuando existen", () => {
    const body = buildCreateItemBody({
      nameEs: "Lomo al grill",
      type: "DISH",
      categoryId: "c1",
      basePrice: " 38.50 ",
      descriptionEs: " Con papas nativas ",
    });
    expect(body).toEqual({ type: "DISH", categoryId: "c1", nameEs: "Lomo al grill", descriptionEs: "Con papas nativas", basePrice: "38.50" });
    expect(Object.keys(body).sort()).toEqual(["basePrice", "categoryId", "descriptionEs", "nameEs", "type"]);
  });

  it("nunca envía cadenas vacías", () => {
    const body = buildCreateItemBody({ ...EMPTY_SERVICE_FORM, nameEs: "X", categoryId: "c1" });
    expect(Object.values(body).every((v) => typeof v !== "string" || v.trim() !== "")).toBe(true);
  });
});

describe("página de la URL", () => {
  it("usa la página 1 si falta o no es válida", () => {
    for (const value of [null, "", "abc", "0", "-3", "Infinity"]) {
      expect(pageFromParam(value), String(value)).toBe(1);
    }
  });

  it("redondea hacia abajo y respeta el máximo que acepta el backend", () => {
    expect(pageFromParam("2")).toBe(2);
    expect(pageFromParam("2.7")).toBe(2);
    expect(pageFromParam("1e30")).toBe(1_000_000);
  });
});

describe("caché del listado", () => {
  const page: Paginated<CommercialItem> = {
    data: [makeItem({ id: "a" }), makeItem({ id: "b", nameEs: "Pisco sour", approvalStatus: "DRAFT" })],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
  };

  it("cambia solo el servicio indicado sin mutar la página original", () => {
    const next = patchItemInPage(page, "a", { isActive: false });
    expect(next?.data.map((i) => i.isActive)).toEqual([false, true]);
    expect(page.data[0]!.isActive).toBe(true);
    expect(patchItemInPage(undefined, "a", { isActive: false })).toBeUndefined();
  });

  it("reemplaza el servicio por la respuesta del backend", () => {
    const updated = { ...page.data[1]!, approvalStatus: "APPROVED" as const };
    expect(replaceItemInPage(page, updated)?.data[1]).toBe(updated);
  });
});

describe("mensaje de error de una acción", () => {
  it("usa el mensaje de negocio del backend", () => {
    const error = new ApiError(400, ["El elemento necesita un nombre en español antes de aprobarse"]);
    expect(actionErrorText(error)).toBe("El elemento necesita un nombre en español antes de aprobarse.");
  });

  it("une los mensajes de validación", () => {
    expect(actionErrorText(new ApiError(400, ["a", "b."]))).toBe("a. b.");
  });
});
