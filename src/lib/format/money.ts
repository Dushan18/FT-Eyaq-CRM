/**
 * Importes del backend: Decimal(10,2) serializado como texto ("38.00").
 * Se formatean con la moneda configurada del restaurante (PEN o USD).
 */
export function formatMoney(amount: string | number | null | undefined, currency: string = "PEN"): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
