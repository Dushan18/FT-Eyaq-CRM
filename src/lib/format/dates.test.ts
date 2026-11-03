import { describe, expect, it } from "vitest";
import {
  dayKey,
  formatAgoLong,
  formatAgoShort,
  formatDate,
  formatDayTime,
  formatMessageTime,
  startOfZonedMonth,
  startOfZonedWeek,
} from "./dates";

const TZ = "America/Lima";
// Miércoles 14 oct 2026, 00:45 en Lima (05:45 UTC).
const NOW = Date.parse("2026-10-14T05:45:00.000Z");

describe("formatos de fecha en la zona del restaurante", () => {
  it("usa el formato del mockup para fecha y hora", () => {
    // 2026-10-17T01:00Z = viernes 16 oct 20:00 en Lima
    expect(formatDayTime("2026-10-17T01:00:00.000Z", TZ)).toBe("Vie 16 oct · 20:00");
    expect(formatDate("2026-09-02T15:00:00.000Z", TZ)).toBe("02 sep 2026");
  });

  it("agrupa por el día local, no por el día UTC", () => {
    expect(dayKey("2026-10-17T01:00:00.000Z", TZ)).toBe("2026-10-16");
  });

  it("muestra la hora de los mensajes como hoy / ayer / fecha", () => {
    expect(formatMessageTime("2026-10-14T05:30:00.000Z", TZ, NOW)).toBe("00:30");
    expect(formatMessageTime("2026-10-13T17:30:00.000Z", TZ, NOW)).toBe("Ayer 12:30");
    expect(formatMessageTime("2026-10-11T14:10:00.000Z", TZ, NOW)).toBe("11 oct 09:10");
  });

  it("expresa el tiempo transcurrido de forma compacta", () => {
    expect(formatAgoShort(NOW - 30_000, NOW, TZ)).toBe("ahora");
    expect(formatAgoShort(NOW - 2 * 60_000, NOW, TZ)).toBe("2 min");
    expect(formatAgoShort(NOW - 3 * 3_600_000, NOW, TZ)).toBe("3 h");
    expect(formatAgoShort(NOW - 2 * 86_400_000, NOW, TZ)).toBe("2 d");
  });

  it("no dice «Ayer» para algo de hace una hora aunque cruce la medianoche", () => {
    expect(formatAgoLong(NOW - 66 * 60_000, NOW, TZ)).toBe("Hace 1 h");
    expect(formatAgoLong(NOW - 20 * 3_600_000, NOW, TZ)).toBe("Ayer");
  });

  it("calcula inicio de semana (lunes) e inicio de mes en Lima", () => {
    expect(startOfZonedWeek(NOW, TZ).toISOString()).toBe("2026-10-12T00:00:00.000-05:00");
    expect(startOfZonedMonth(NOW, TZ).toISOString()).toBe("2026-10-01T00:00:00.000-05:00");
  });
});
