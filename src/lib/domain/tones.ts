/** Par de colores fondo/texto usado por pills, etiquetas y eventos. Valores exactos del mockup. */
export interface Tone {
  bg: string;
  fg: string;
}

export const TONES = {
  blue: { bg: "#eef2ff", fg: "#2b45b8" },
  amber: { bg: "#fff1e6", fg: "#b14a0b" },
  green: { bg: "#e8f6ee", fg: "#14753f" },
  red: { bg: "#fdecec", fg: "#b42323" },
  gray: { bg: "#f0f2f5", fg: "#4a5368" },
  grayMuted: { bg: "#f0f2f5", fg: "#6b7385" },
  teal: { bg: "#e6f4f1", fg: "#0f6b5c" },
  /** Atención: requiere a una persona (p. ej. «Cambio propuesto» por el propietario). */
  orange: { bg: "#ffe8d6", fg: "#9a3a06" },
  event: { bg: "#eceff4", fg: "#4a5368" },
} as const satisfies Record<string, Tone>;

export type ToneName = keyof typeof TONES;
