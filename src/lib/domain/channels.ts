import type { ContactChannel } from "@/lib/api/types";

export interface ChannelMeta {
  label: string;
  color: string;
  /** Sigla del indicador circular. */
  short: string;
}

/** Colores y siglas del mockup para WhatsApp, Facebook, Instagram y Web. */
export const CHANNELS: Record<ContactChannel, ChannelMeta> = {
  WHATSAPP: { label: "WhatsApp", color: "#1f9d55", short: "W" },
  FACEBOOK: { label: "Facebook", color: "#2b55e6", short: "f" },
  INSTAGRAM: { label: "Instagram", color: "#c13584", short: "IG" },
  WEBSITE: { label: "Web", color: "#6b7385", short: "W" },
  PHONE: { label: "Teléfono", color: "#4a5368", short: "T" },
  EMAIL: { label: "Correo", color: "#4a5368", short: "@" },
  OTHER: { label: "Otro", color: "#8a92a5", short: "•" },
};

export function channelMeta(channel: ContactChannel | null | undefined): ChannelMeta {
  return channel ? CHANNELS[channel] : CHANNELS.OTHER;
}

/** Filtros de canal de la Bandeja (mockup). `undefined` = Todos. */
export const INBOX_CHANNEL_FILTERS: ReadonlyArray<{ label: string; channel: ContactChannel | undefined }> = [
  { label: "Todos", channel: undefined },
  { label: "WhatsApp", channel: "WHATSAPP" },
  { label: "Facebook", channel: "FACEBOOK" },
  { label: "Instagram", channel: "INSTAGRAM" },
  { label: "Web", channel: "WEBSITE" },
];

/** Canales que hoy tienen envío real desde el CRM (bk-crm solo implementa WhatsApp). */
export const SENDABLE_CHANNELS: readonly ContactChannel[] = ["WHATSAPP"];
