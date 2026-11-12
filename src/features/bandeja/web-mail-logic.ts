/**
 * «Correos» de la web en la Bandeja (filtro Web).
 *
 * bk-crm no guarda el correo «Nueva reserva SM-…» del formulario: lo lee, crea el cliente y la solicitud
 * (`sourceChannel: "WEBSITE"`, `externalReference` = código web) y lo descarta. Tampoco crea conversaciones
 * de canal WEBSITE: si le escribe al cliente, lo hace por WhatsApp. Por eso el filtro Web lista las
 * solicitudes de la web (GET /reservation-requests?channel=WEBSITE) y muestra cada una como un correo de solo
 * lectura, armado con lo que el backend extrajo. Ver 03 › «Solicitudes que llegan de la web».
 */
import type { ReservationRequest } from "@/lib/api/types";
import { commentLines } from "@/features/solicitudes/request-detail-logic";

export const WEB_MAIL_PAGE = 50;
export const WEB_MAIL_MAX = 100;
/** bk-crm lee el buzón cada EMAIL_POLL_SECONDS (60 s por defecto). */
export const WEB_MAIL_POLL_MS = 30_000;

export const WEB_MAIL_READ_ONLY =
  "Los correos de la web solo se leen aquí: no se responden desde el CRM. Para escribirle al cliente, usa su WhatsApp.";

export const WEB_MAIL_SOURCE_NOTE =
  "Datos que el CRM extrajo del correo del formulario web; el correo original no se guarda.";

/** Asunto como el del correo del formulario: «Nueva reserva SM-…». */
export function webMailSubject(r: Pick<ReservationRequest, "externalReference" | "code">): string {
  return r.externalReference ? `Nueva reserva ${r.externalReference}` : `Solicitud web ${r.code}`;
}

/**
 * Cuerpo del correo: las líneas de `comments` que escribió el cliente («Mensaje», «País: …», datos que no se
 * entendieron) y, aparte, las notas internas del CRM («CRM: …»).
 */
export function webMailBody(comments: string | null): { message: string[]; crmNotes: string[] } {
  const lines = commentLines(comments);
  return {
    message: lines.filter((l) => !l.crm).map((l) => l.text),
    crmNotes: lines.filter((l) => l.crm).map((l) => l.text),
  };
}
