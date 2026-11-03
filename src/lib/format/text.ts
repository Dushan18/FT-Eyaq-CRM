/** Une clases condicionales sin dependencias externas. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** "María Fernández" → "MF"; "Grupo Empresarial Tauro" → "GE". */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("es"))
    .join("");
}

/** Nombre visible de una persona; nunca devuelve cadena vacía. */
export function personName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = "Sin nombre",
): string {
  const full = [firstName, lastName]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");
  return full || fallback;
}

/** Texto alternativo para valores vacíos, igual que el mockup ("—"). */
export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text === "" ? "—" : text;
}

/** Plural simple: plural(1, "reserva") → "1 reserva"; plural(3, "reserva") → "3 reservas". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Comparación de búsqueda sin tildes ni mayúsculas. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}
