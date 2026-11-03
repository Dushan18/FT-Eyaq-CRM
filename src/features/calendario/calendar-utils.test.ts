import { describe, expect, it } from "vitest";
import { toSearch } from "@/lib/api/client";
import type { ReservationStatus } from "@/lib/api/types";
import {
  civilWeekday,
  dayTitle,
  groupByDay,
  isUuid,
  monthGrid,
  parseDayKey,
  periodRange,
  periodSubtitle,
  prepareAction,
  reservationsPageQuery,
  shiftAnchor,
  toDayKey,
  weekDays,
  type CivilDate,
} from "./calendar-utils";

const LIMA = "America/Lima";
const day = (key: string): CivilDate => {
  const parsed = parseDayKey(key);
  if (!parsed) throw new Error(`fecha inválida en la prueba: ${key}`);
  return parsed;
};
const keys = (dates: CivilDate[]) => dates.map(toDayKey);

describe("parseDayKey", () => {
  it("lee fechas civiles válidas", () => {
    expect(parseDayKey("2026-10-14")).toEqual({ year: 2026, month: 9, day: 14 });
    expect(parseDayKey("2028-02-29")).toEqual({ year: 2028, month: 1, day: 29 });
  });

  it("rechaza textos que no son una fecha real", () => {
    for (const value of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-1-5", "14/10/2026", "", null, undefined, "1969-12-31"]) {
      expect(parseDayKey(value)).toBeNull();
    }
  });
});

describe("periodRange (límites [inicio, fin) en la zona del restaurante, enviados en UTC)", () => {
  const anchor = day("2026-10-14"); // miércoles

  it("día: de medianoche a medianoche de Lima", () => {
    const range = periodRange("dia", anchor, LIMA);
    expect(range.dateFrom).toBe("2026-10-14T05:00:00.000Z");
    expect(range.dateTo).toBe("2026-10-15T05:00:00.000Z");
  });

  it("semana: de lunes a lunes siguiente", () => {
    const range = periodRange("semana", anchor, LIMA);
    expect(toDayKey(range.first)).toBe("2026-10-12");
    expect(toDayKey(range.end)).toBe("2026-10-19");
    expect(range.dateFrom).toBe("2026-10-12T05:00:00.000Z");
    expect(range.dateTo).toBe("2026-10-19T05:00:00.000Z");
  });

  it("mes: del día 1 al día 1 del mes siguiente, incluso al cambiar de año", () => {
    expect(periodRange("mes", anchor, LIMA)).toMatchObject({
      dateFrom: "2026-10-01T05:00:00.000Z",
      dateTo: "2026-11-01T05:00:00.000Z",
    });
    expect(periodRange("mes", day("2026-12-15"), LIMA)).toMatchObject({
      dateFrom: "2026-12-01T05:00:00.000Z",
      dateTo: "2027-01-01T05:00:00.000Z",
    });
  });

  it("semana que cruza de mes: del lunes 28 de septiembre al lunes 5 de octubre", () => {
    const range = periodRange("semana", day("2026-10-01"), LIMA);
    expect(toDayKey(range.first)).toBe("2026-09-28");
    expect(range.dateFrom).toBe("2026-09-28T05:00:00.000Z");
    expect(range.dateTo).toBe("2026-10-05T05:00:00.000Z");
  });

  it("la medianoche local puede caer en otro día UTC (Tokio, UTC+9)", () => {
    const range = periodRange("dia", anchor, "Asia/Tokyo");
    // El 14 de octubre en Tokio empieza el 13 de octubre a las 15:00 UTC.
    expect(range.dateFrom).toBe("2026-10-13T15:00:00.000Z");
    expect(range.dateTo).toBe("2026-10-14T15:00:00.000Z");
  });

  it("respeta el cambio de horario dentro del periodo (Madrid, fin del horario de verano el 25 oct)", () => {
    const range = periodRange("semana", day("2026-10-21"), "Europe/Madrid");
    expect(range.dateFrom).toBe("2026-10-18T22:00:00.000Z"); // lunes 19, 00:00 CEST (UTC+2)
    expect(range.dateTo).toBe("2026-10-25T23:00:00.000Z"); // lunes 26, 00:00 CET (UTC+1)
  });
});

describe("reservationsPageQuery", () => {
  it("arma exactamente los parámetros tipados de GET /reservations", () => {
    const range = periodRange("semana", day("2026-10-14"), LIMA);
    const query = reservationsPageQuery(range, 2, 100);
    expect(query).toStrictEqual({
      dateFrom: "2026-10-12T05:00:00.000Z",
      dateTo: "2026-10-19T05:00:00.000Z",
      excludeCancelled: true,
      page: 2,
      limit: 100,
    });
    expect(toSearch(query)).toBe(
      "?dateFrom=2026-10-12T05%3A00%3A00.000Z&dateTo=2026-10-19T05%3A00%3A00.000Z&excludeCancelled=true&page=2&limit=100",
    );
  });
});

describe("semana y grilla del mes", () => {
  it("la semana va de lunes a domingo aunque la fecha sea domingo", () => {
    expect(keys(weekDays(day("2026-10-14")))).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(toDayKey(weekDays(day("2026-10-18"))[0]!)).toBe("2026-10-12");
  });

  it("octubre 2026 ocupa 5 semanas, con días de septiembre y noviembre fuera del mes", () => {
    const cells = monthGrid(day("2026-10-14"));
    expect(cells).toHaveLength(35);
    expect(cells[0]).toMatchObject({ key: "2026-09-28", inMonth: false });
    expect(cells[3]).toMatchObject({ key: "2026-10-01", inMonth: true });
    expect(cells[34]).toMatchObject({ key: "2026-11-01", inMonth: false });
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it("usa 6 semanas cuando hacen falta y 4 si el mes calza exacto", () => {
    const november = monthGrid(day("2026-11-03")); // el 1 de noviembre de 2026 es domingo
    expect(november).toHaveLength(42);
    expect(november[0]!.key).toBe("2026-10-26");
    expect(november[41]!.key).toBe("2026-12-06");

    const february = monthGrid(day("2027-02-10")); // empieza lunes y tiene 28 días
    expect(february).toHaveLength(28);
    expect(february.every((c) => c.inMonth)).toBe(true);
  });

  it("la primera columna siempre es lunes", () => {
    for (const key of ["2026-01-01", "2026-03-15", "2026-06-30", "2026-11-01", "2027-02-01"]) {
      expect(civilWeekday(monthGrid(day(key))[0]!.date)).toBe(1);
    }
  });
});

describe("textos del encabezado", () => {
  it("subtítulo de semana, mes y día", () => {
    expect(periodSubtitle("semana", day("2026-10-14"))).toBe("Semana del 12 al 18 de octubre.");
    expect(periodSubtitle("semana", day("2026-10-01"))).toBe("Semana del 28 de septiembre al 4 de octubre.");
    expect(periodSubtitle("semana", day("2026-12-31"))).toBe("Semana del 28 de diciembre al 3 de enero.");
    expect(periodSubtitle("mes", day("2026-10-14"))).toBe("Octubre 2026.");
    expect(periodSubtitle("dia", day("2026-10-14"))).toBe("");
  });

  it("título de la vista Día", () => {
    expect(dayTitle(day("2026-10-14"))).toBe("Miércoles 14 de octubre");
    expect(dayTitle(day("2026-10-18"))).toBe("Domingo 18 de octubre");
  });
});

describe("shiftAnchor (‹ y ›)", () => {
  it("avanza o retrocede un día o una semana", () => {
    expect(toDayKey(shiftAnchor(day("2026-10-31"), "dia", 1))).toBe("2026-11-01");
    expect(toDayKey(shiftAnchor(day("2026-10-14"), "semana", -1))).toBe("2026-10-07");
    expect(toDayKey(shiftAnchor(day("2026-12-30"), "semana", 1))).toBe("2027-01-06");
  });

  it("en el mes conserva el día y lo recorta al último día del mes de destino", () => {
    expect(toDayKey(shiftAnchor(day("2026-01-31"), "mes", 1))).toBe("2026-02-28");
    expect(toDayKey(shiftAnchor(day("2026-03-31"), "mes", -1))).toBe("2026-02-28");
    expect(toDayKey(shiftAnchor(day("2028-01-31"), "mes", 1))).toBe("2028-02-29");
    expect(toDayKey(shiftAnchor(day("2026-12-15"), "mes", 1))).toBe("2027-01-15");
  });
});

describe("groupByDay", () => {
  const row = (id: string, reservationAt: string) => ({ id, reservationAt });

  it("agrupa por el día local del restaurante, no por el día UTC", () => {
    // Viernes 16 oct, 20:00 en Lima = sábado 17 oct, 01:00 UTC.
    const dinner = row("a", "2026-10-17T01:00:00.000Z");
    // Domingo 18 oct, 21:00 en Lima = lunes 19 oct, 02:00 UTC: sigue en la semana del 12 al 18.
    const sundayNight = row("b", "2026-10-19T02:00:00.000Z");
    const byDay = groupByDay([dinner, sundayNight], LIMA);
    expect([...byDay.keys()]).toEqual(["2026-10-16", "2026-10-18"]);

    const week = periodRange("semana", day("2026-10-14"), LIMA);
    expect(sundayNight.reservationAt >= week.dateFrom && sundayNight.reservationAt < week.dateTo).toBe(true);
  });

  it("el mismo instante cae en otro día según la zona del restaurante", () => {
    const late = row("c", "2026-10-14T23:30:00.000Z");
    expect([...groupByDay([late], LIMA).keys()]).toEqual(["2026-10-14"]);
    expect([...groupByDay([late], "Asia/Tokyo").keys()]).toEqual(["2026-10-15"]);
  });

  it("conserva el orden recibido y descarta repetidos entre páginas", () => {
    const first = row("1", "2026-10-14T18:00:00.000Z");
    const second = row("2", "2026-10-14T19:30:00.000Z");
    const byDay = groupByDay([first, second, { ...first }], LIMA);
    expect(byDay.get("2026-10-14")?.map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("prepareAction", () => {
  it("permite marcar desde Confirmada o Reprogramada si el rol puede escribir", () => {
    expect(prepareAction("CONFIRMED", true)).toBe("mark");
    expect(prepareAction("RESCHEDULED", true)).toBe("mark");
  });

  it("muestra el indicador fijo cuando ya está preparada, para cualquier rol", () => {
    expect(prepareAction("UPCOMING", true)).toBe("prepared");
    expect(prepareAction("UPCOMING", false)).toBe("prepared");
  });

  it("no ofrece la acción a roles de solo lectura ni en estados que no la admiten", () => {
    expect(prepareAction("CONFIRMED", false)).toBe("none");
    for (const status of ["IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"] satisfies ReservationStatus[]) {
      expect(prepareAction(status, true)).toBe("none");
    }
  });
});

describe("isUuid", () => {
  it("solo acepta ids con forma de UUID", () => {
    expect(isUuid("3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("R-2026-000201")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
