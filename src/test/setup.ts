import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom no implementa `matchMedia`. Esta versión evalúa `min-width`/`max-width` (px o rem) contra
 * `window.innerWidth`, que se fija en 1440 px: la disposición de escritorio, igual que las pruebas e2e.
 * Un test puede cambiar `window.innerWidth` antes de renderizar para probar otra disposición.
 */
const DESKTOP_WIDTH = 1440;

function evaluate(query: string): boolean {
  const width = window.innerWidth;
  return query.split(/\s+and\s+/).every((part) => {
    const match = /\((min|max)-width:\s*([\d.]+)(px|rem)\)/.exec(part);
    if (!match) return false;
    const px = Number(match[2]) * (match[3] === "rem" ? 16 : 1);
    return match[1] === "min" ? width >= px : width <= px;
  });
}

// Las pruebas del servidor corren en entorno node: sin `window` no hay nada que simular.
const browser = typeof window !== "undefined";

if (browser) {
  Object.defineProperty(window, "innerWidth", { value: DESKTOP_WIDTH, writable: true, configurable: true });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        media: query,
        get matches() {
          return evaluate(query);
        },
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

afterEach(() => {
  cleanup();
  if (browser) window.innerWidth = DESKTOP_WIDTH;
});
