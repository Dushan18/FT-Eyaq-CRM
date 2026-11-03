"use client";

import { useEffect, useEffectEvent, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/format/text";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type">;

/**
 * Buscador con espera (debounce): escribe en `onCommit` el texto recortado tras `delay` ms sin teclear,
 * o al pulsar Enter. `value` es el valor confirmado (la URL): si cambia desde fuera (otro enlace, atrás),
 * el campo lo adopta; el eco de lo que el propio campo confirmó no pisa lo que el usuario sigue escribiendo.
 */
export function SearchBox({
  value,
  onCommit,
  delay = 300,
  className,
  onKeyDown,
  ...rest
}: { value: string; onCommit: (value: string) => void; delay?: number } & InputProps) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // Valores confirmados que la URL aún no refleja, en orden.
  const [pending, setPending] = useState<readonly string[]>([]);

  if (value !== seen) {
    setSeen(value);
    const echo = pending.lastIndexOf(value);
    if (echo >= 0) {
      setPending(pending.slice(echo + 1));
    } else {
      setPending([]);
      setDraft(value);
    }
  }

  const target = pending.at(-1) ?? value;
  const next = draft.trim();

  const commit = useEffectEvent((text: string) => {
    setPending((list) => [...list, text]);
    onCommit(text);
  });

  useEffect(() => {
    if (next === target) return;
    const id = window.setTimeout(() => commit(next), delay);
    return () => window.clearTimeout(id);
  }, [next, target, delay]);

  return (
    <input
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter" && next !== target) {
          setPending((list) => [...list, next]);
          onCommit(next);
        }
      }}
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="search"
      className={cn(
        "h-10 rounded-[10px] border border-field bg-surface-2 px-3 text-[13.5px] text-ellipsis text-ink outline-none transition-colors placeholder:text-faint focus:border-brand",
        // Para que el texto de ayuda completo quepa en los 260 px del mockup: va a 13 px y, mientras el campo
        // está vacío, se oculta el botón de borrar de Chrome (aunque no se ve, reserva su espacio).
        "placeholder:text-[13px] [&:placeholder-shown::-webkit-search-cancel-button]:hidden",
        className,
      )}
      {...rest}
    />
  );
}
