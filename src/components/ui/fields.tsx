import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/format/text";

/** Estilo de campo del mockup: alto 40, borde #e1e5ec, radio 10, 13.5 px. */
export const inputClass =
  "h-10 w-full rounded-[10px] border border-field bg-white px-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted";

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-slate">
      {children}
    </label>
  );
}

function Hint({ id, error, hint }: { id: string; error?: string | null; hint?: ReactNode }) {
  if (error) {
    return (
      <span id={id} className="text-xs text-[#b42323]">
        {error}
      </span>
    );
  }
  return hint ? (
    <span id={id} className="text-xs text-subtle">
      {hint}
    </span>
  ) : null;
}

export function TextField({
  label,
  error,
  hint,
  className,
  wrapperClassName,
  ...rest
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  wrapperClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? hintId : undefined}
        className={cn(inputClass, error && "border-[#e0a3a3]", className)}
        {...rest}
      />
      <Hint id={hintId} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  wrapperClassName,
  ...rest
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  wrapperClassName?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? hintId : undefined}
        className={cn(
          "w-full resize-y rounded-[10px] border border-field px-3 py-2.5 text-[13.5px] leading-[1.5] text-ink outline-none focus:border-brand disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted",
          error && "border-[#e0a3a3]",
          className,
        )}
        {...rest}
      />
      <Hint id={hintId} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  wrapperClassName,
  children,
  ...rest
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  wrapperClassName?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? hintId : undefined}
        className={cn(inputClass, "cursor-pointer", error && "border-[#e0a3a3]", className)}
        {...rest}
      >
        {children}
      </select>
      <Hint id={hintId} error={error} hint={hint} />
    </div>
  );
}
