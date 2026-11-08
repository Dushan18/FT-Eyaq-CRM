// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const headers = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

describe("IP del navegador detrás de proxies inversos", () => {
  it("sin proxies de confianza no se usa X-Forwarded-For (el navegador podría escribirla)", () => {
    expect(clientIp(headers("203.0.113.7"), 0)).toBeNull();
  });

  it("con un proxy toma la última IP: la que agregó ese proxy", () => {
    expect(clientIp(headers("203.0.113.7"), 1)).toBe("203.0.113.7");
    // El navegador mandó una falsa; Nginx agregó la real a la derecha.
    expect(clientIp(headers("1.1.1.1, 203.0.113.7"), 1)).toBe("203.0.113.7");
  });

  it("con dos proxies (CDN + Nginx) toma la penúltima", () => {
    expect(clientIp(headers("1.1.1.1, 203.0.113.7, 198.51.100.2"), 2)).toBe("203.0.113.7");
    // Cadena más corta que los saltos: la más lejana disponible.
    expect(clientIp(headers("203.0.113.7"), 2)).toBe("203.0.113.7");
  });

  it("acepta IPv6 y rechaza valores que no son IP", () => {
    expect(clientIp(headers("2001:db8::1"), 1)).toBe("2001:db8::1");
    expect(clientIp(headers("unknown"), 1)).toBeNull();
    expect(clientIp(headers(""), 1)).toBeNull();
    expect(clientIp(headers(), 1)).toBeNull();
  });
});
