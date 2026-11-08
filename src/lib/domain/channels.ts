import type { ContactChannel } from "@/lib/api/types";

export interface ChannelMeta {
  label: string;
}

/** Nombre visible de cada canal. El icono está en `components/ui/channel-icon.tsx`. */
export const CHANNELS: Record<ContactChannel, ChannelMeta> = {
  WHATSAPP: { label: "WhatsApp" },
  FACEBOOK: { label: "Facebook" },
  INSTAGRAM: { label: "Instagram" },
  WEBSITE: { label: "Web" },
  PHONE: { label: "Teléfono" },
  EMAIL: { label: "Correo" },
  OTHER: { label: "Otro" },
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

