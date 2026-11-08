/** Lleva el error de un guardado a los campos del formulario (docs/frontend-api-completo.md, Parte 05 §4.2). */
import { ApiError } from "@/lib/api/client";
import { fieldErrors, isConnectionError, isValidationError } from "@/lib/api/errors";

export interface ServerFormErrors<F extends string> {
  fields: Partial<Record<F, string>>;
  form: string | null;
}

/** `formFields` son los campos que el formulario muestra; las rutas anidadas ("schedules.2.openTime") van a su raíz. */
export function serverFormErrors<F extends string>(error: unknown, formFields: readonly F[]): ServerFormErrors<F> {
  if (isValidationError(error)) {
    const { fields, other } = fieldErrors(error.messages);
    const result: Partial<Record<F, string>> = {};
    let unmatched = other.length > 0;
    for (const [path, texts] of Object.entries(fields)) {
      const field = formFields.find((name) => path === name || path.startsWith(`${name}.`));
      if (!field) unmatched = true;
      else if (!result[field]) result[field] = texts[0];
    }
    return { fields: result, form: unmatched ? "No se pudo guardar. Revisa los datos e inténtalo de nuevo." : null };
  }
  if (isConnectionError(error)) return { fields: {}, form: "No se pudo conectar con el servidor. Inténtalo de nuevo." };
  if (error instanceof ApiError) return { fields: {}, form: error.messages.join(" ") };
  return { fields: {}, form: error instanceof Error ? error.message : "Ocurrió un error inesperado." };
}
