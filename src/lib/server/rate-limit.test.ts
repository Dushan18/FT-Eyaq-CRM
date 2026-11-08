// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("límite de intentos por clave", () => {
  it("permite hasta el límite y bloquea el resto de la ventana", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => limiter.hit("ip-a", t0).allowed)).toEqual([true, true, true]);
    expect(limiter.hit("ip-a", t0 + 1_000)).toEqual({ allowed: false, retryAfterSeconds: 59 });
  });

  it("cuenta cada clave por separado", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit("ip-a", 0).allowed).toBe(true);
    expect(limiter.hit("ip-a", 0).allowed).toBe(false);
    expect(limiter.hit("ip-b", 0).allowed).toBe(true);
  });

  it("vuelve a permitir cuando termina la ventana", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit("ip-a", 0).allowed).toBe(true);
    expect(limiter.hit("ip-a", 59_999).allowed).toBe(false);
    expect(limiter.hit("ip-a", 60_000).allowed).toBe(true);
  });

  it("no crece sin tope ante muchas claves distintas", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    for (let i = 0; i < 10_050; i += 1) limiter.hit(`ip-${i}`, 0);
    // Las más antiguas se descartaron para hacer lugar; las recientes siguen contadas.
    expect(limiter.hit("ip-10049", 0).allowed).toBe(false);
    expect(limiter.hit("ip-0", 0).allowed).toBe(true);
  });
});
