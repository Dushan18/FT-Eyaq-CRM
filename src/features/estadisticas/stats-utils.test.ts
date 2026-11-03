import { describe, expect, it, vi } from "vitest";
import type { CommercialItemSummary, Conversation, Paginated, ReservationRequestStatus } from "@/lib/api/types";
import {
  acceptanceRate,
  barHeight,
  barPercent,
  channelStats,
  collectConversationsSince,
  formatPercent,
  monthWeeks,
  periodRange,
  reservationsByDay,
  reservationsByMonthWeek,
  summarizeRequests,
  topServices,
} from "./stats-utils";

const LIMA = "America/Lima";
// Miércoles 14 oct 2026, 00:45 en Lima (05:45 UTC).
const NOW = Date.parse("2026-10-14T05:45:00.000Z");

const at = (iso: string) => ({ reservationAt: iso });

describe("periodRange", () => {
  it("toma la semana de lunes a domingo en la zona del restaurante", () => {
    const range = periodRange("semana", NOW, LIMA);
    expect(range.fromIso).toBe("2026-10-12T05:00:00.000Z");
    expect(range.toIso).toBe("2026-10-19T05:00:00.000Z");
    expect(range.end - range.start).toBe(7 * 24 * 3_600_000);
    expect(range.label).toBe("la semana del 12 al 18 de octubre");
  });

  it("toma el mes calendario completo", () => {
    const range = periodRange("mes", NOW, LIMA);
    expect(range.fromIso).toBe("2026-10-01T05:00:00.000Z");
    expect(range.toIso).toBe("2026-11-01T05:00:00.000Z");
    expect(range.label).toBe("octubre 2026");
  });

  it("envía las fechas al backend en UTC con segundos (toISOString)", () => {
    const range = periodRange("semana", NOW, LIMA);
    expect(range.fromIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(range.toIso).toMatch(/Z$/);
  });

  it("usa la zona del restaurante y no la del navegador", () => {
    // Domingo 18 oct 23:30 en Lima ya es lunes 19 en UTC: sigue siendo la semana del 12.
    const sundayNight = Date.parse("2026-10-19T04:30:00.000Z");
    expect(periodRange("semana", sundayNight, LIMA).fromIso).toBe("2026-10-12T05:00:00.000Z");
    // En Tokio ese mismo instante es lunes 19 a mediodía: otra semana.
    expect(periodRange("semana", sundayNight, "Asia/Tokyo").fromIso).toBe("2026-10-18T15:00:00.000Z");
  });

  it("respeta el cambio de horario dentro de la semana", () => {
    // Madrid pasa de UTC+2 a UTC+1 el domingo 25 oct 2026: la semana dura 7 días y 1 hora.
    const range = periodRange("semana", Date.parse("2026-10-21T10:00:00.000Z"), "Europe/Madrid");
    expect(range.fromIso).toBe("2026-10-18T22:00:00.000Z");
    expect(range.toIso).toBe("2026-10-25T23:00:00.000Z");
  });

  it("describe semanas que cruzan de mes o de año", () => {
    expect(periodRange("semana", Date.parse("2026-10-01T15:00:00.000Z"), LIMA).label).toBe(
      "la semana del 28 de septiembre al 4 de octubre",
    );
    expect(periodRange("semana", Date.parse("2026-01-01T15:00:00.000Z"), LIMA).label).toBe(
      "la semana del 29 de diciembre de 2025 al 4 de enero de 2026",
    );
  });

  it("cierra diciembre en el 1 de enero siguiente", () => {
    const range = periodRange("mes", Date.parse("2026-12-15T15:00:00.000Z"), LIMA);
    expect(range.toIso).toBe("2027-01-01T05:00:00.000Z");
    expect(range.label).toBe("diciembre 2026");
  });
});

describe("reservas por día", () => {
  const week = periodRange("semana", NOW, LIMA);

  it("cuenta por día local de lunes a domingo", () => {
    const buckets = reservationsByDay(
      [
        at("2026-10-12T18:00:00.000Z"), // lun 13:00
        at("2026-10-13T01:30:00.000Z"), // lun 20:30 (martes en UTC)
        at("2026-10-14T00:30:00.000Z"), // mar 19:30
        at("2026-10-19T02:00:00.000Z"), // dom 21:00 (lunes en UTC)
      ],
      week,
      LIMA,
    );
    expect(buckets.map((b) => b.label)).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
    expect(buckets.map((b) => b.value)).toEqual([2, 1, 0, 0, 0, 0, 1]);
    expect(buckets[0]!.detail).toBe("Lunes 12 oct");
    expect(buckets[6]!.detail).toBe("Domingo 18 oct");
  });

  it("ignora reservas fuera del periodo", () => {
    const buckets = reservationsByDay([at("2026-10-12T04:59:59.000Z"), at("2026-10-19T05:00:00.000Z")], week, LIMA);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });
});

describe("reservas por semana del mes", () => {
  it("divide el mes en semanas de lunes a domingo recortadas al mes", () => {
    // Octubre 2026 empieza en jueves.
    expect(monthWeeks(periodRange("mes", NOW, LIMA), LIMA)).toEqual([
      { label: "Sem 1", fromDay: 1, toDay: 4 },
      { label: "Sem 2", fromDay: 5, toDay: 11 },
      { label: "Sem 3", fromDay: 12, toDay: 18 },
      { label: "Sem 4", fromDay: 19, toDay: 25 },
      { label: "Sem 5", fromDay: 26, toDay: 31 },
    ]);
  });

  it("admite meses de 4 y de 6 semanas", () => {
    // Febrero 2021 empieza en lunes y tiene 28 días; agosto 2026 empieza en sábado y tiene 31.
    expect(monthWeeks(periodRange("mes", Date.parse("2021-02-10T15:00:00.000Z"), LIMA), LIMA)).toHaveLength(4);
    const august = monthWeeks(periodRange("mes", Date.parse("2026-08-10T15:00:00.000Z"), LIMA), LIMA);
    expect(august).toHaveLength(6);
    expect(august[0]).toEqual({ label: "Sem 1", fromDay: 1, toDay: 2 });
    expect(august[5]).toEqual({ label: "Sem 6", fromDay: 31, toDay: 31 });
  });

  it("cuenta cada reserva en su semana según el día local", () => {
    const month = periodRange("mes", NOW, LIMA);
    const buckets = reservationsByMonthWeek(
      [
        at("2026-10-01T18:00:00.000Z"), // jue 1
        at("2026-10-05T04:30:00.000Z"), // dom 4 23:30 en Lima (lunes 5 en UTC) → Sem 1
        at("2026-10-05T18:00:00.000Z"), // lun 5 → Sem 2
        at("2026-11-01T04:00:00.000Z"), // sáb 31 23:00 → Sem 5
        at("2026-11-01T06:00:00.000Z"), // noviembre: fuera
      ],
      month,
      LIMA,
    );
    expect(buckets.map((b) => b.value)).toEqual([2, 1, 0, 0, 1]);
    expect(buckets[0]!.detail).toBe("Semana 1, del 1 al 4 oct");
  });
});

describe("solicitudes", () => {
  const rows = (statuses: ReservationRequestStatus[]) => statuses.map((status) => ({ status }));

  it("calcula la tasa de aceptación sobre las respondidas", () => {
    const summary = summarizeRequests(
      rows(["ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED", "REJECTED", "REJECTED", "WAITING_RESPONSE", "RENEGOTIATING", "MODIFICATION_REQUESTED"]),
    );
    expect(summary).toEqual({ count: 9, accepted: 4, rejected: 2, renegotiating: 2, acceptanceRate: 4 / 6 });
    expect(formatPercent(summary.acceptanceRate)).toBe("67%");
  });

  it("no inventa una tasa cuando no hay respuestas (denominador 0)", () => {
    expect(acceptanceRate(0, 0)).toBeNull();
    expect(summarizeRequests(rows(["WAITING_RESPONSE", "INCOMPLETE_DATA"])).acceptanceRate).toBeNull();
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(acceptanceRate(0, 3))).toBe("0%");
    expect(formatPercent(acceptanceRate(5, 0))).toBe("100%");
  });

  it("ordena los servicios más solicitados y omite las solicitudes sin servicio", () => {
    const item = (nameEs: string | null, nameEn: string | null = null): CommercialItemSummary => ({
      id: `${nameEs ?? nameEn}`,
      nameEs,
      nameEn,
      type: "SERVICE",
      isActive: true,
      approvalStatus: "APPROVED",
    });
    const requests = [
      ...Array.from({ length: 5 }, () => ({ commercialItem: item("Cena") })),
      ...Array.from({ length: 2 }, () => ({ commercialItem: item("Almuerzo") })),
      { commercialItem: item(null, "Tasting menu") },
      { commercialItem: item("Almuerzo ejecutivo") },
      { commercialItem: item("Salón privado") },
      { commercialItem: item("Bebidas") },
      { commercialItem: null },
      { commercialItem: null },
    ];
    expect(topServices(requests)).toEqual([
      { name: "Cena", count: 5 },
      { name: "Almuerzo", count: 2 },
      { name: "Almuerzo ejecutivo", count: 1 },
      { name: "Bebidas", count: 1 },
      { name: "Salón privado", count: 1 },
    ]);
    expect(topServices([{ commercialItem: null }])).toEqual([]);
  });
});

describe("canales", () => {
  const week = periodRange("semana", NOW, LIMA);
  const conv = (channel: Conversation["channel"], lastMessageAt: string | null) => ({ channel, lastMessageAt });

  it("cuenta conversaciones con actividad en el periodo y solicitudes por canal de origen", () => {
    const stats = channelStats(
      [
        conv("WHATSAPP", "2026-10-14T05:40:00.000Z"),
        conv("WHATSAPP", "2026-10-12T05:00:00.000Z"),
        conv("WHATSAPP", "2026-10-12T04:59:59.000Z"), // domingo anterior
        conv("INSTAGRAM", "2026-10-13T15:00:00.000Z"),
        conv("FACEBOOK", null),
        conv("PHONE", "2026-10-13T15:00:00.000Z"),
      ],
      [{ sourceChannel: "WHATSAPP" }, { sourceChannel: "WEBSITE" }, { sourceChannel: "WEBSITE" }, { sourceChannel: "EMAIL" }],
      week,
    );
    expect(stats).toEqual([
      { channel: "WHATSAPP", conversations: 2, requests: 1 },
      { channel: "INSTAGRAM", conversations: 1, requests: 0 },
      { channel: "FACEBOOK", conversations: 0, requests: 0 },
      { channel: "WEBSITE", conversations: 0, requests: 2 },
    ]);
  });

  it("calcula anchos y altos relativos al máximo sin dividir por 0", () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(10, 10, 60)).toBe(60);
    expect(barPercent(3, 0)).toBe(0);
    expect(barPercent(0, 0, 60)).toBe(0);
    expect(barHeight(3, 3)).toBe(110);
    expect(barHeight(1, 2)).toBe(55);
    expect(barHeight(0, 0)).toBe(0);
  });
});

describe("collectConversationsSince", () => {
  const SINCE = Date.parse("2026-10-12T05:00:00.000Z");
  const DAY = 86_400_000;

  /** Simula GET /conversations: orden lastMessageAt desc con nulos al final, páginas de `limit`. */
  function fakeApi(dates: Array<number | null>) {
    const rows = dates.map((d, i) => ({ id: String(i), lastMessageAt: d === null ? null : new Date(d).toISOString() }));
    return vi.fn(async (page: number, limit: number): Promise<Paginated<(typeof rows)[number]>> => ({
      data: rows.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
    }));
  }

  it("se detiene en la primera página cuyo último elemento es anterior al periodo", async () => {
    // 100 en el periodo y 150 más antiguas: la página 2 ya termina antes del periodo.
    const api = fakeApi([...Array.from({ length: 100 }, (_, i) => SINCE + DAY - i * 1000), ...Array.from({ length: 150 }, (_, i) => SINCE - (i + 1) * 1000)]);
    const result = await collectConversationsSince(api, SINCE);
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenNthCalledWith(1, 1, 100);
    expect(api).toHaveBeenNthCalledWith(2, 2, 100);
    expect(result.rows).toHaveLength(200);
    expect(result.truncated).toBe(false);
  });

  it("no pide más páginas si la primera ya termina fuera del periodo", async () => {
    const api = fakeApi([SINCE + 10, SINCE - 10, ...Array.from({ length: 200 }, () => SINCE - DAY)]);
    await collectConversationsSince(api, SINCE);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("no pasa de la última página ni sigue tras conversaciones sin mensajes", async () => {
    const all = fakeApi(Array.from({ length: 150 }, () => SINCE + DAY));
    expect((await collectConversationsSince(all, SINCE)).rows).toHaveLength(150);
    expect(all).toHaveBeenCalledTimes(2);

    const withNulls = fakeApi([...Array.from({ length: 99 }, () => SINCE + DAY), null, null, null]);
    await collectConversationsSince(withNulls, SINCE);
    expect(withNulls).toHaveBeenCalledTimes(1);

    const empty = fakeApi([]);
    expect(await collectConversationsSince(empty, SINCE)).toEqual({ rows: [], truncated: false });
  });

  it("marca la lectura como parcial al llegar al límite de páginas", async () => {
    const api = fakeApi(Array.from({ length: 450 }, () => SINCE + DAY));
    const result = await collectConversationsSince(api, SINCE, 3);
    expect(api).toHaveBeenCalledTimes(3);
    expect(result.rows).toHaveLength(300);
    expect(result.truncated).toBe(true);
  });

  it("no cuenta dos veces una conversación que se desplaza de página durante la lectura", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ id: `c${i}`, lastMessageAt: new Date(SINCE + DAY - i * 1000).toISOString() }));
    let fresh = false;
    const api = vi.fn(async (page: number, limit: number): Promise<Paginated<(typeof rows)[number]>> => {
      // Tras leer la página 1 llega un mensaje nuevo a otra conversación: todo baja un puesto.
      const list = fresh ? [{ id: "nueva", lastMessageAt: new Date(SINCE + 2 * DAY).toISOString() }, ...rows] : rows;
      fresh = true;
      return {
        data: list.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: list.length, totalPages: Math.ceil(list.length / limit) },
      };
    });
    const result = await collectConversationsSince(api, SINCE);
    const ids = result.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(150);
  });
});
