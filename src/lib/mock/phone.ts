/**
 * Normalización de teléfonos del backend simulado. bk-crm usa libphonenumber; aquí basta una tabla de
 * prefijos y longitudes nacionales de los países más habituales para reproducir sus reglas:
 * - con "+": número internacional válido (prefijo conocido y longitud nacional plausible);
 * - sin "+" y con phoneCountry: número válido para ese país;
 * - sin "+" ni país: se guarda tal cual, sin normalizar (no cuenta para la unicidad ni como destinatario).
 */

interface CountryRule {
  /** Prefijo internacional sin "+". */
  code: string;
  /** Longitudes válidas del número nacional (sin prefijo ni 0 troncal). */
  lengths: readonly number[];
  /** Regla extra sobre el número nacional. */
  pattern?: RegExp;
}

const COUNTRIES: Record<string, CountryRule> = {
  // Perú: móviles de 9 dígitos que empiezan por 9; fijos de 8 (Lima 1 + 7, provincias 2 + 6).
  PE: { code: "51", lengths: [8, 9], pattern: /^(?:9\d{8}|[1-8]\d{7})$/ },
  US: { code: "1", lengths: [10], pattern: /^[2-9]\d{2}[2-9]\d{6}$/ },
  CA: { code: "1", lengths: [10], pattern: /^[2-9]\d{2}[2-9]\d{6}$/ },
  MX: { code: "52", lengths: [10] },
  GT: { code: "502", lengths: [8] },
  CR: { code: "506", lengths: [8] },
  PA: { code: "507", lengths: [7, 8] },
  CU: { code: "53", lengths: [8] },
  DO: { code: "1", lengths: [10] },
  CO: { code: "57", lengths: [10] },
  VE: { code: "58", lengths: [10] },
  EC: { code: "593", lengths: [8, 9] },
  BO: { code: "591", lengths: [8] },
  BR: { code: "55", lengths: [10, 11] },
  CL: { code: "56", lengths: [9] },
  AR: { code: "54", lengths: [10, 11] },
  UY: { code: "598", lengths: [8] },
  PY: { code: "595", lengths: [9] },
  ES: { code: "34", lengths: [9] },
  PT: { code: "351", lengths: [9] },
  FR: { code: "33", lengths: [9] },
  DE: { code: "49", lengths: [10, 11] },
  IT: { code: "39", lengths: [9, 10] },
  GB: { code: "44", lengths: [10] },
  IE: { code: "353", lengths: [9] },
  NL: { code: "31", lengths: [9] },
  BE: { code: "32", lengths: [8, 9] },
  CH: { code: "41", lengths: [9] },
  CN: { code: "86", lengths: [11] },
  JP: { code: "81", lengths: [10] },
  KR: { code: "82", lengths: [9, 10] },
  IN: { code: "91", lengths: [10] },
  AU: { code: "61", lengths: [9] },
  NZ: { code: "64", lengths: [8, 9] },
};

/** Países ISO 3166-1 alfa-2 que entiende el simulador (`UK` no existe: es `GB`). */
export function isSupportedCountry(code: string): boolean {
  return code in COUNTRIES;
}

export type PhoneCheck =
  | { ok: true; e164: string | null }
  | { ok: false; message: "El teléfono tiene un formato inválido" | "El teléfono no es válido para el país indicado" };

function validNational(rule: CountryRule, national: string): boolean {
  return rule.lengths.includes(national.length) && (!rule.pattern || rule.pattern.test(national));
}

/** Comprueba y normaliza a E.164 un teléfono (ya recortado) con su país opcional. */
export function checkPhone(phone: string, country: string | null): PhoneCheck {
  const digitCount = phone.replace(/\D/g, "").length;
  if (!/^\+?[\d\s().-]+$/.test(phone) || digitCount < 6 || digitCount > 15) {
    return { ok: false, message: "El teléfono tiene un formato inválido" };
  }
  const allDigits = phone.replace(/\D/g, "");

  if (phone.startsWith("+")) {
    // El país sale del prefijo: se prueba el más largo primero (p. ej. 593 antes que 59).
    const rules = Object.values(COUNTRIES).sort((a, b) => b.code.length - a.code.length);
    const rule = rules.find((r) => allDigits.startsWith(r.code));
    const valid = rule ? validNational(rule, allDigits.slice(rule.code.length)) : allDigits.length >= 8 && !allDigits.startsWith("0");
    return valid ? { ok: true, e164: `+${allDigits}` } : { ok: false, message: "El teléfono no es válido para el país indicado" };
  }

  if (!country) return { ok: true, e164: null };
  const rule = COUNTRIES[country];
  if (!rule) return { ok: false, message: "El teléfono no es válido para el país indicado" };
  let national = allDigits;
  if (national.startsWith(rule.code) && validNational(rule, national.slice(rule.code.length))) national = national.slice(rule.code.length);
  else if (national.startsWith("0")) national = national.slice(1);
  return validNational(rule, national) ? { ok: true, e164: `+${rule.code}${national}` } : { ok: false, message: "El teléfono no es válido para el país indicado" };
}

/** E.164 de un teléfono guardado, o null si no es normalizable (nacional sin país, formato inválido…). */
export function normalizedPhone(phone: string | null, country: string | null): string | null {
  if (!phone) return null;
  const r = checkPhone(phone.trim(), country);
  return r.ok ? r.e164 : null;
}
