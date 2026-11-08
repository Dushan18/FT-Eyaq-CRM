import { Ellipsis, Globe, Mail, Phone, type LucideIcon } from "lucide-react";
import type { ContactChannel } from "@/lib/api/types";
import { channelMeta } from "@/lib/domain/channels";
import { cn } from "@/lib/format/text";
import { BRAND_ICONS, type BrandIcon } from "./brand-icons";

/**
 * Cómo se ve cada canal: los de marca con su logotipo oficial (Simple Icons) y el resto con un icono
 * genérico de Lucide sobre gris. `scale` es la fracción del círculo que ocupa el símbolo.
 */
type ChannelLook =
  | { brand: BrandIcon; background: string; color: string; scale: number }
  | { icon: LucideIcon; background: string; scale: number };

/** Degradado del icono de la app de Instagram. */
const INSTAGRAM_GRADIENT =
  "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)";

const LOOKS: Record<ContactChannel, ChannelLook> = {
  // Globo blanco sobre verde, como el icono de la app.
  WHATSAPP: { brand: BRAND_ICONS.WHATSAPP, background: BRAND_ICONS.WHATSAPP.hex, color: "#fff", scale: 0.66 },
  // El logotipo ya es un círculo azul con la «f» calada: ocupa todo el indicador sobre blanco.
  FACEBOOK: { brand: BRAND_ICONS.FACEBOOK, background: "#fff", color: BRAND_ICONS.FACEBOOK.hex, scale: 1 },
  INSTAGRAM: { brand: BRAND_ICONS.INSTAGRAM, background: INSTAGRAM_GRADIENT, color: "#fff", scale: 0.62 },
  WEBSITE: { icon: Globe, background: "#6b7385", scale: 0.66 },
  PHONE: { icon: Phone, background: "#4a5368", scale: 0.6 },
  EMAIL: { icon: Mail, background: "#4a5368", scale: 0.62 },
  OTHER: { icon: Ellipsis, background: "#8a92a5", scale: 0.7 },
};

/**
 * Indicador circular del canal con su logotipo (WhatsApp, Facebook, Instagram) o un icono genérico
 * (Web, Teléfono, Correo, Otro). Tiene `role="img"` con el nombre del canal.
 */
export function ChannelDot({
  channel,
  size = 16,
  bordered = false,
  className,
}: {
  channel: ContactChannel | null | undefined;
  /** Diámetro en px, borde incluido. */
  size?: number;
  /** Aro blanco de 2 px, para ir sobre un avatar. */
  bordered?: boolean;
  className?: string;
}) {
  const key = channel ?? "OTHER";
  const look = LOOKS[key];
  const label = channelMeta(key).label;
  const glyph = { width: `${look.scale * 100}%`, height: `${look.scale * 100}%` };

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-channel={key}
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full", bordered && "border-2 border-white", className)}
      style={{ width: size, height: size, background: look.background }}
    >
      {"brand" in look ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={glyph}>
          <path d={look.brand.path} fill={look.color} />
        </svg>
      ) : (
        <look.icon aria-hidden="true" focusable="false" color="#fff" strokeWidth={2.75} style={glyph} />
      )}
    </span>
  );
}
