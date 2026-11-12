import type { CustomerStatus, ReservationRequestStatus, ReservationStatus } from "@/lib/api/types";
import { TONES, type Tone } from "./tones";

// ---------------------------------------------------------------- solicitudes

/**
 * Grupos del mockup: definen el color y las pestañas de Solicitudes. «cambio» es MODIFICATION_REQUESTED: el
 * propietario propuso un cambio y la solicitud espera a una persona del equipo, no al propietario.
 */
export type RequestGroup = "negociando" | "esperando" | "cambio" | "aceptada" | "rechazada" | "cancelada";

export const REQUEST_GROUP_TONE: Record<RequestGroup, Tone> = {
  negociando: TONES.blue,
  esperando: TONES.amber,
  cambio: TONES.orange,
  aceptada: TONES.green,
  rechazada: TONES.red,
  cancelada: TONES.gray,
};

export const REQUEST_STATUS: Record<ReservationRequestStatus, { label: string; group: RequestGroup }> = {
  INCOMPLETE_DATA: { label: "Negociando", group: "negociando" },
  READY_TO_SEND: { label: "Lista para enviar", group: "negociando" },
  SENT_TO_OWNER: { label: "Enviada al propietario", group: "esperando" },
  WAITING_RESPONSE: { label: "Esperando al propietario", group: "esperando" },
  ACCEPTED: { label: "Aceptada", group: "aceptada" },
  REJECTED: { label: "Rechazada", group: "rechazada" },
  MODIFICATION_REQUESTED: { label: "Cambio propuesto", group: "cambio" },
  // Ninguna ruta lo asigna todavía (renegociación, M10).
  RENEGOTIATING: { label: "Renegociando", group: "negociando" },
  CANCELLED: { label: "Cancelada", group: "cancelada" },
};

/** Estados en los que ADMIN y OWNER pueden aprobar (POST …/approve); en otro estado, 409. */
export const APPROVABLE_REQUEST_STATUSES: readonly ReservationRequestStatus[] = ["READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE"];

/** Estados en los que ADMIN y OWNER pueden rechazar (POST …/reject); en otro estado, 409. */
export const REJECTABLE_REQUEST_STATUSES: readonly ReservationRequestStatus[] = [
  "INCOMPLETE_DATA",
  "READY_TO_SEND",
  "SENT_TO_OWNER",
  "WAITING_RESPONSE",
];

/** Estados en los que la solicitud ya tiene decisión (del propietario o del CRM). CANCELLED no cuenta: la retiró el equipo. */
export const DECIDED_REQUEST_STATUSES: readonly ReservationRequestStatus[] = ["ACCEPTED", "REJECTED", "MODIFICATION_REQUESTED"];

export function requestStatusView(status: ReservationRequestStatus): { label: string; tone: Tone; group: RequestGroup } {
  const meta = REQUEST_STATUS[status];
  return { ...meta, tone: REQUEST_GROUP_TONE[meta.group] };
}

/** Estados de cada pestaña de Solicitudes. */
export const REQUEST_TAB_STATUSES = {
  todas: null,
  esperando: ["SENT_TO_OWNER", "WAITING_RESPONSE"],
  cambio: ["MODIFICATION_REQUESTED"],
  aceptadas: ["ACCEPTED"],
  rechazadas: ["REJECTED"],
} as const satisfies Record<string, readonly ReservationRequestStatus[] | null>;

export type RequestTab = keyof typeof REQUEST_TAB_STATUSES;

export interface TimelineStep {
  label: string;
  sub: string;
  /** Color del punto (relleno si el paso está hecho). */
  dot: string;
  ring: string;
  fg: string;
  line: boolean;
}

/**
 * Línea de tiempo de 3 pasos del panel de la Bandeja (misma lógica visual del mockup).
 * El backend no guarda la fecha de cada paso: la posición se deduce solo del estado.
 */
export function requestTimeline(status: ReservationRequestStatus): TimelineStep[] {
  const group = REQUEST_STATUS[status].group;
  const stage = group === "negociando" ? 0 : group === "esperando" ? 1 : 2;
  // Una solicitud cancelada nunca se envió al dueño (bk-crm solo cancela antes de enviar): ese paso no se marca.
  const skipped = group === "cancelada" ? 1 : -1;
  const final: [string, string, string] =
    group === "aceptada"
      ? ["Aceptada", "Reserva en el calendario", "#1f9d55"]
      : group === "rechazada"
        ? ["Rechazada", "No se registró ninguna reserva", "#dc2626"]
        : group === "cambio"
          ? ["Cambio propuesto", "Coordina el cambio con el cliente", "#f26a1b"]
          : group === "cancelada"
            ? ["Cancelada", "Retirada por el equipo", "#6b7385"]
            : ["Respuesta del propietario", "Aceptar, rechazar o proponer cambio", "#1f3fbf"];
  const defs: Array<[string, string, string]> = [
    ["Datos de la reserva", status === "READY_TO_SEND" ? "Datos completos: fecha, hora y personas" : "Fecha, hora, personas y servicio", "#1f3fbf"],
    ["Enviada al propietario", "Por su WhatsApp personal", "#f26a1b"],
    final,
  ];
  return defs.map(([label, sub, color], i) => {
    const done = i !== skipped && (i < stage || (i === 2 && stage === 2));
    const current = i === stage && stage < 2;
    return {
      label,
      sub,
      dot: done ? color : "#fff",
      ring: done || current ? color : "#d6dbe4",
      fg: done || current ? "#131a2e" : "#8a92a5",
      line: i < 2,
    };
  });
}

// ---------------------------------------------------------------- reservas

/**
 * "Marcar como preparada" (mockup) se representa con el estado UPCOMING del backend, el único estado
 * manual previo a la llegada. No hay transición directa UPCOMING → CONFIRMED (409), pero al reprogramar
 * la reserva pasa a RESCHEDULED y desde ahí puede volver a CONFIRMED.
 * Pendiente de confirmar con el dueño del producto (ver README, "Decisiones pendientes").
 */
export const PREPARED_STATUS: ReservationStatus = "UPCOMING";

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; tone: Tone }> = {
  CONFIRMED: { label: "Confirmada", tone: TONES.green },
  UPCOMING: { label: "Preparada", tone: TONES.teal },
  IN_SERVICE: { label: "En servicio", tone: TONES.blue },
  COMPLETED: { label: "Completada", tone: TONES.gray },
  RESCHEDULED: { label: "Reprogramada", tone: TONES.amber },
  CANCELLED: { label: "Cancelada", tone: TONES.grayMuted },
  NO_SHOW: { label: "No asistió", tone: TONES.red },
};

// ---------------------------------------------------------------- clientes

export const CUSTOMER_STATUS: Record<CustomerStatus, { label: string; tone: Tone }> = {
  NEW: { label: "Nuevo", tone: TONES.gray },
  INTERESTED: { label: "Interesado", tone: TONES.blue },
  IN_CONVERSATION: { label: "En conversación", tone: TONES.blue },
  REQUESTED_RESERVATION: { label: "Solicitó reserva", tone: TONES.amber },
  CONFIRMED: { label: "Confirmado", tone: TONES.green },
  REJECTED: { label: "Rechazado", tone: TONES.red },
  LOST: { label: "Perdido", tone: TONES.grayMuted },
  RECURRENT: { label: "Recurrente", tone: TONES.teal },
};
