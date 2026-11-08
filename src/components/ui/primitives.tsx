import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import type { ContactChannel } from "@/lib/api/types";
import type { Tone } from "@/lib/domain/tones";
import { cn } from "@/lib/format/text";
import { ChannelDot } from "./channel-icon";

/** Tarjeta blanca principal (radio 20 px). */
export function Panel({
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  as?: "section" | "aside" | "main" | "div";
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("relative min-w-0 rounded-[20px] bg-white", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Encabezado de sección en mayúsculas ("SOLICITUD DE RESERVA"). */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-bold uppercase tracking-[.08em] text-subtle", className)}>{children}</div>
  );
}

/** Pill de estado (11.5 px, negrita, radio completo). */
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-self-start whitespace-nowrap rounded-full px-2.25 py-0.75 text-[11.5px] font-bold",
        className,
      )}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {children}
    </span>
  );
}

/** Etiqueta pequeña de la lista de conversaciones (10.5 px, radio 6 px). */
export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className="whitespace-nowrap rounded-md px-1.75 py-0.5 text-[10.5px] font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {children}
    </span>
  );
}

export { ChannelDot };

/** Avatar con iniciales; opcionalmente con el logotipo del canal en la esquina. */
export function Avatar({
  text,
  size = 40,
  fontSize,
  badge,
}: {
  text: string;
  size?: number;
  fontSize?: number;
  badge?: ContactChannel;
}) {
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full bg-avatar font-bold text-ink-2"
      style={{ width: size, height: size, fontSize: fontSize ?? (size >= 38 ? (size === 38 ? 14 : 13) : 11.5) }}
      aria-hidden="true"
    >
      {text}
      {badge ? (
        <ChannelDot channel={badge} size={size >= 38 ? 18 : 16} bordered className="absolute -bottom-0.5 -right-0.5" />
      ) : null}
    </div>
  );
}

/** Chip de filtro (Todos, WhatsApp, Nuevo…). */
export function FilterChip({
  active,
  children,
  size = "sm",
  ...rest
}: {
  active: boolean;
  children: ReactNode;
  size?: "sm" | "md";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-full border text-[12.5px] font-semibold transition-colors",
        size === "sm" ? "h-7 px-2.75" : "h-7.5 px-3",
        active ? "border-brand bg-brand text-white" : "border-field bg-white text-slate hover:bg-surface",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Control segmentado (Día/Semana/Mes, pestañas de Solicitudes…). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    // En pantallas estrechas las pestañas que no caben se desplazan en horizontal dentro del control.
    <div role="tablist" aria-label={ariaLabel} className="relative flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-segment p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-semibold",
              active ? "bg-white text-ink shadow-[0_1px_2px_rgba(20,27,45,.1)]" : "bg-transparent text-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Interruptor de activación (38 × 22 px). */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "flex h-5.5 w-9.5 shrink-0 cursor-pointer rounded-full border-0 p-0.5 transition-colors disabled:opacity-60",
        checked ? "justify-end bg-brand" : "justify-start bg-toggle-off",
      )}
    >
      <span className="size-4.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)]" />
    </button>
  );
}

/** Encabezado de página: título 24 px, subtítulo y controles a la derecha. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 text-[22px] font-bold tracking-[-.01em] sm:text-2xl">{title}</h1>
        {subtitle ? <p className="m-0 mt-1 text-[13.5px] text-pretty text-muted">{subtitle}</p> : null}
      </div>
      {/* Nunca más ancho que la página: en pantallas estrechas los controles bajan de línea o se desplazan. */}
      {actions ? <div className="min-w-0 max-w-full max-sm:w-full">{actions}</div> : null}
    </div>
  );
}

/** Tarjeta de indicador. */
export function KpiCard({
  label,
  value,
  sub,
  valueColor,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueColor?: string;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-2xl border border-card",
        size === "md" ? "px-4.5 py-4" : "p-4.5",
      )}
    >
      <div className="text-[12.5px] text-muted">{label}</div>
      <div
        className={cn("font-bold", size === "md" ? "text-[26px]" : "text-[30px] tracking-[-.02em]")}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      {sub ? <div className="text-xs text-subtle">{sub}</div> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "outline" | "orange" | "soft" | "link";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-0 bg-brand font-bold text-white hover:bg-brand-hover",
  outline: "border border-button bg-white font-semibold text-ink-2 hover:bg-[#f5f7fa]",
  orange: "border-0 bg-orange font-bold text-white hover:brightness-95",
  soft: "border-0 bg-brand-tint font-bold text-brand hover:brightness-[.98]",
  link: "border border-button bg-white font-semibold text-brand hover:bg-brand-soft",
};

export function Button({
  variant = "primary",
  className,
  style,
  children,
  type = "button",
  ...rest
}: {
  variant?: ButtonVariant;
  style?: CSSProperties;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-[10px] text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        BUTTON_VARIANTS[variant],
        className,
      )}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Lista de pares etiqueta/valor (detalle de solicitud, cliente, reserva). */
export function DetailList({
  rows,
  gap = "8px 14px",
}: {
  rows: Array<{ label: string; value: ReactNode; strong?: boolean; truncate?: boolean }>;
  gap?: string;
}) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] text-[13px]" style={{ gap }}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-subtle">{r.label}</dt>
          <dd className={cn("m-0 min-w-0", r.strong && "font-semibold", r.truncate && "truncate")}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
